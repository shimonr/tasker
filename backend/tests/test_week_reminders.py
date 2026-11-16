from datetime import timedelta

import pytest

from app import mailer, models
from app.timeutil import utcnow
from conftest import login, make_user


def post_task(client, family, **fields):
    body = {"title": "Chore", "assignee_ids": family["kids"][:1], **fields}
    response = client.post("/api/parent/tasks", json=body, headers=family["parent_h"])
    assert response.status_code == 200, response.text
    return response.json()


def days_of(client, headers, **query) -> dict[str, list[dict]]:
    week = client.get("/api/parent/week", params=query, headers=headers).json()
    return {day["date"]: day["items"] for day in week["days"]}


# ---------------------------------------------------------------- week view


def test_week_shows_due_dates_and_each_occurrence_per_child(client, family):
    ann, ben, _ = family["kids"]
    today = utcnow().date()
    post_task(client, family, title="Bins", assignee_ids=[ann, ben], due_date=(utcnow() + timedelta(days=2)).isoformat())
    post_task(client, family, title="Far away", due_date=(utcnow() + timedelta(days=20)).isoformat())
    post_task(client, family, title="No date")
    post_task(client, family, title="Make bed", task_type="recurring", recurrence="daily", assignee_ids=[ann])

    week = client.get("/api/parent/week", headers=family["parent_h"]).json()
    assert week["start"] == today.isoformat() and len(week["days"]) == 7
    by_day = {day["date"]: day["items"] for day in week["days"]}
    in_two_days = [i for i in by_day[(today + timedelta(days=2)).isoformat()] if i["title"] == "Bins"]
    assert sorted(i["child_name"] for i in in_two_days) == ["Ann", "Ben"]
    assert all(i["occurrence_id"] is None and i["status"] == "pending" for i in in_two_days)
    [bed] = [i for i in by_day[today.isoformat()] if i["title"] == "Make bed"]
    assert (bed["child_name"], bed["occurrence_id"], bed["status"]) == ("Ann", bed["occurrence_id"], "pending")
    assert bed["occurrence_id"] is not None
    listed = [i["title"] for items in by_day.values() for i in items]
    assert "Far away" not in listed and "No date" not in listed


def test_week_marks_completed_and_waiting_items(client, family):
    ann, ben, _ = family["kids"]
    due = (utcnow() + timedelta(days=1)).isoformat()
    post_task(client, family, title="Bins", assignee_ids=[ann, ben], due_date=due)
    post_task(client, family, title="Vacuum", assignee_ids=[ann], due_date=due, requires_approval=True)
    bins = next(t for t in client.get("/api/parent/tasks", headers=family["parent_h"]).json() if t["title"] == "Bins")
    vacuum = next(t for t in client.get("/api/parent/tasks", headers=family["parent_h"]).json() if t["title"] == "Vacuum")
    client.post(f"/api/child/tasks/{bins['id']}/complete", headers=family["kid_h"][1])
    client.post(f"/api/child/tasks/{vacuum['id']}/complete", headers=family["kid_h"][0])
    items = [i for day in days_of(client, family["parent_h"]).values() for i in day]
    ben_bins = next(i for i in items if i["title"] == "Bins" and i["child_name"] == "Ben")
    ann_bins = next(i for i in items if i["title"] == "Bins" and i["child_name"] == "Ann")
    vacuum_item = next(i for i in items if i["title"] == "Vacuum")
    assert ben_bins["status"] == "completed" and ann_bins["status"] == "in_progress"
    assert vacuum_item["awaiting_approval"] is True and vacuum_item["status"] == "pending"


def test_week_skips_rotating_turns_that_are_not_active(client, family):
    ann, ben, _ = family["kids"]
    post_task(client, family, title="Trash", task_type="rotating", assignee_ids=[ann, ben], due_date=(utcnow() + timedelta(days=1)).isoformat())
    items = [i for day in days_of(client, family["parent_h"]).values() for i in day if i["title"] == "Trash"]
    assert [i["child_name"] for i in items] == ["Ann"]


def test_week_can_start_on_any_day_and_rejects_bad_dates(client, family):
    ann = family["kids"][0]
    start = utcnow().date() + timedelta(days=7)
    post_task(client, family, title="Later", assignee_ids=[ann], due_date=(utcnow() + timedelta(days=8)).isoformat())
    post_task(client, family, title="Daily", task_type="recurring", recurrence="daily", assignee_ids=[ann])
    days = days_of(client, family["parent_h"], start=start.isoformat())
    assert list(days) == [(start + timedelta(days=i)).isoformat() for i in range(7)]
    assert [i["title"] for i in days[(start + timedelta(days=1)).isoformat()]] == ["Later"]
    # Only today's occurrence exists so far, so a week in the future shows no daily chores.
    assert all(i["title"] != "Daily" for day in days.values() for i in day)
    assert client.get("/api/parent/week", params={"start": "2026-99-99"}, headers=family["parent_h"]).status_code == 422


def test_week_only_shows_the_familys_own_tasks(client, db, family):
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    assert client.get("/api/parent/week", headers=lee_h).json()["days"][0]["items"] == []
    post_task(client, family, title="Bins", due_date=(utcnow() + timedelta(days=1)).isoformat())
    items = [i for day in days_of(client, lee_h).values() for i in day]
    assert items == []


# ---------------------------------------------------------------- reminders


@pytest.fixture()
def reminders(monkeypatch):
    """Record reminder emails instead of sending them. `result['ok']` controls whether each send succeeds."""
    sent = []
    result = {"ok": True}

    def fake_send(email, name, title):
        sent.append((email, title))
        return result["ok"]

    monkeypatch.setattr(mailer, "send_reminder", fake_send)
    monkeypatch.setenv("REMINDER_TOKEN", "cron-secret")
    return sent, result


def run_reminders(client, token="cron-secret"):
    headers = {"X-Reminder-Token": token} if token else {}
    return client.post("/api/internal/reminders", headers=headers)


def test_reminders_require_the_secret_token(client, family, reminders, monkeypatch):
    assert run_reminders(client, token="guess").status_code == 404
    assert run_reminders(client, token=None).status_code == 404
    monkeypatch.delenv("REMINDER_TOKEN")
    assert run_reminders(client).status_code == 404
    monkeypatch.setenv("REMINDER_TOKEN", "cron-secret")
    assert run_reminders(client).json() == {"message": "Sent 0 reminders"}


def test_due_soon_chores_are_reminded_once(client, family, reminders):
    sent, _ = reminders
    ann, ben, _ = family["kids"]
    soon = (utcnow() + timedelta(hours=3)).isoformat()
    post_task(client, family, title="Bins", assignee_ids=[ann, ben], due_date=soon)
    post_task(client, family, title="Trash", task_type="rotating", assignee_ids=[ann, ben], due_date=soon)
    post_task(client, family, title="Mow", assignee_ids=[ann], due_date=(utcnow() + timedelta(hours=48)).isoformat())
    post_task(client, family, title="Sweep", assignee_ids=[ann])
    post_task(client, family, title="Dishes", assignee_ids=[ann], due_date=soon)
    post_task(client, family, title="Vacuum", assignee_ids=[ann], due_date=soon, requires_approval=True)
    tasks = {t["title"]: t["id"] for t in client.get("/api/parent/tasks", headers=family["parent_h"]).json()}
    client.post(f"/api/child/tasks/{tasks['Dishes']}/complete", headers=family["kid_h"][0])
    client.post(f"/api/child/tasks/{tasks['Vacuum']}/complete", headers=family["kid_h"][0])

    assert run_reminders(client).json() == {"message": "Sent 3 reminders"}
    assert sorted(sent) == sorted([("ann@example.com", "Bins"), ("ben@example.com", "Bins"), ("ann@example.com", "Trash")])
    assert run_reminders(client).json() == {"message": "Sent 0 reminders"}


def test_open_recurring_chores_are_reminded_once_per_period(client, family, reminders):
    sent, _ = reminders
    ann, ben, _ = family["kids"]
    post_task(client, family, title="Make bed", task_type="recurring", recurrence="daily", assignee_ids=[ann, ben])
    done = post_task(client, family, title="Feed cat", task_type="recurring", recurrence="daily", assignee_ids=[ann])
    client.post(f"/api/occurrences/{done['occurrences'][0]['id']}/complete", headers=family["kid_h"][0])

    assert run_reminders(client).json() == {"message": "Sent 2 reminders"}
    assert sorted(sent) == [("ann@example.com", "Make bed"), ("ben@example.com", "Make bed")]
    assert run_reminders(client).json() == {"message": "Sent 0 reminders"}


def test_failed_reminders_are_retried_on_the_next_run(client, family, reminders):
    sent, result = reminders
    post_task(client, family, title="Bins", due_date=(utcnow() + timedelta(hours=2)).isoformat())
    result["ok"] = False
    assert run_reminders(client).json() == {"message": "Sent 0 reminders"}
    result["ok"] = True
    assert run_reminders(client).json() == {"message": "Sent 1 reminders"}
    assert len(sent) == 2


def test_recurring_occurrence_failures_are_retried_too(client, family, reminders):
    sent, result = reminders
    post_task(client, family, title="Make bed", task_type="recurring", recurrence="daily")
    result["ok"] = False
    assert run_reminders(client).json() == {"message": "Sent 0 reminders"}
    result["ok"] = True
    assert run_reminders(client).json() == {"message": "Sent 1 reminders"}


# ---------------------------------------------------------------- email templates


def test_reminder_and_approval_emails_go_through_brevo(monkeypatch):
    calls = []

    class Accepted:
        status_code = 201

        def raise_for_status(self):
            pass

    monkeypatch.setattr(mailer.httpx, "post", lambda url, json, headers, timeout: calls.append(json) or Accepted())
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setenv("EMAIL_SENDER_ADDRESS", "hello@family.example")
    monkeypatch.setenv("APP_BASE_URL", "https://shimonr.com/tasker")
    assert mailer.send_reminder("ann@example.com", "Ann", "Bins") is True
    assert mailer.send_approval_request("mom@example.com", "Mom", "Ann", "Bins") is True
    reminder, approval = calls
    assert reminder["subject"] == "Reminder: Bins ⏰" and reminder["tags"] == ["tasker", "reminder"]
    assert reminder["to"] == [{"email": "ann@example.com", "name": "Ann"}]
    assert "https://shimonr.com/tasker/child" in reminder["textContent"]
    assert approval["subject"] == "Ann finished: Bins ✅" and approval["tags"] == ["tasker", "approval-request"]
    assert "https://shimonr.com/tasker/parent" in approval["textContent"]
