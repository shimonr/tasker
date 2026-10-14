from datetime import datetime, timedelta, timezone

import pytest

from app import crud, models
from app.timeutil import utcnow
from conftest import login, make_user


def create(client, family, **fields):
    body = {"title": "Chore", "assignee_ids": family["kids"][:1], **fields}
    response = client.post("/api/parent/tasks", json=body, headers=family["parent_h"])
    assert response.status_code == 200, response.text
    return response.json()


def active_child(task):
    return [a["child_id"] for a in task["assignments"] if a["is_active"]]


def child_titles(client, headers):
    return [t["title"] for t in client.get("/api/child/tasks", headers=headers).json()]


# ---------------------------------------------------------------- create / validate


def test_parent_creates_adhoc_task_visible_to_assigned_child(client, family, sent_emails):
    due = "2030-05-01T12:00:00+02:00"
    task = create(client, family, title="Wash dishes", description="After dinner", due_date=due, priority="High")
    assert task["due_date"] in ("2030-05-01T10:00:00Z", "2030-05-01T10:00:00+00:00")  # normalized to UTC
    assert task["occurrences"] == []
    assert child_titles(client, family["kid_h"][0]) == ["Wash dishes"]
    assert child_titles(client, family["kid_h"][1]) == []
    assert sent_emails == [("send_task_assigned", ("ann@example.com", "Ann", "Wash dishes", "Mom", False))]
    assert [c["username"] for c in client.get("/api/parent/children", headers=family["parent_h"]).json()] == ["cat", "ben", "ann"]


@pytest.mark.parametrize(
    "fields, detail",
    [
        ({"task_type": "rotating", "assignee_ids": [1]}, "Rotating tasks require at least 2 assignees"),
        ({"task_type": "recurring"}, "Recurring tasks require a recurrence"),
        ({"assignee_ids": [9999]}, "Tasks can only be assigned to child accounts"),
        ({"assignee_ids": "parent"}, "Tasks can only be assigned to child accounts"),
    ],
)
def test_create_task_validation(client, family, fields, detail):
    if fields.get("assignee_ids") == "parent":
        fields["assignee_ids"] = [family["parent"]]
    response = client.post("/api/parent/tasks", json={"title": "x", **fields}, headers=family["parent_h"])
    assert response.status_code == 400
    assert response.json()["detail"] == detail


def test_create_task_rejects_blank_title_and_unknown_priority(client, family):
    assert client.post("/api/parent/tasks", json={"title": "   "}, headers=family["parent_h"]).status_code == 422
    assert client.post("/api/parent/tasks", json={"title": "x", "priority": "Urgent"}, headers=family["parent_h"]).status_code == 422


def test_recurrence_is_dropped_for_non_recurring_tasks(client, family):
    assert create(client, family, recurrence="daily")["recurrence"] is None


# ---------------------------------------------------------------- listing / ownership


def test_parent_list_filters_and_ownership(client, db, family):
    first = create(client, family, title="A")
    create(client, family, title="B", assignee_ids=[family["kids"][1]])
    client.post(f"/api/tasks/{first['id']}/status", json={"status": "failed"}, headers=family["parent_h"])
    h = family["parent_h"]
    assert [t["title"] for t in client.get("/api/parent/tasks", headers=h).json()] == ["B", "A"]
    assert [t["title"] for t in client.get("/api/parent/tasks?status=failed", headers=h).json()] == ["A"]
    assert len(client.get("/api/parent/tasks?status=bogus", headers=h).json()) == 2
    assert [t["title"] for t in client.get(f"/api/parent/tasks?child_id={family['kids'][1]}", headers=h).json()] == ["B"]

    make_user(db, "dad", models.UserRole.parent)
    other = login(client, "dad")
    assert client.get("/api/parent/tasks", headers=other).json() == []
    for method, path in [
        ("put", f"/api/parent/tasks/{first['id']}"),
        ("delete", f"/api/parent/tasks/{first['id']}"),
        ("get", f"/api/parent/tasks/{first['id']}/log"),
        ("post", f"/api/parent/tasks/{first['id']}/advance"),
        ("get", f"/api/tasks/{first['id']}/occurrences"),
    ]:
        kwargs = {"json": {"title": "hacked"}} if method == "put" else {}
        assert getattr(client, method)(path, headers=other, **kwargs).status_code == 404


def test_children_cannot_see_tasks_not_assigned_to_them(client, family):
    task = create(client, family)
    stranger = family["kid_h"][1]
    assert client.get(f"/api/tasks/{task['id']}/occurrences", headers=stranger).status_code == 404
    assert client.post(f"/api/tasks/{task['id']}/status", json={"status": "in_progress"}, headers=stranger).status_code == 404
    assert client.post(f"/api/child/tasks/{task['id']}/complete", headers=stranger).status_code == 404


def test_delete_task_and_status_log(client, family):
    task = create(client, family)
    h = family["parent_h"]
    client.post(f"/api/tasks/{task['id']}/status", json={"status": "in_progress"}, headers=h)
    client.post(f"/api/tasks/{task['id']}/status", json={"status": "in_progress"}, headers=h)  # no-op, not logged
    logs = client.get(f"/api/parent/tasks/{task['id']}/log", headers=h).json()
    assert [(log["previous_status"], log["new_status"]) for log in logs] == [("pending", "in_progress"), ("pending", "pending")]
    assert logs[0]["changed_by"] == family["parent"]
    assert client.delete(f"/api/parent/tasks/{task['id']}", headers=h).json() == {"message": "Task deleted"}
    assert client.get("/api/parent/tasks", headers=h).json() == []


# ---------------------------------------------------------------- update


def test_update_task_keeps_progress_of_remaining_children(client, family, sent_emails):
    ann, ben, cat = family["kids"]
    task = create(client, family, assignee_ids=[ann, ben], priority="Low")
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    sent_emails.clear()

    response = client.put(
        f"/api/parent/tasks/{task['id']}",
        json={"title": "Renamed", "priority": "High", "assignee_ids": [ann, cat, cat]},
        headers=family["parent_h"],
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Renamed"
    assert {a["child_id"]: a["completed"] for a in updated["assignments"]} == {ann: True, cat: False}
    assert sent_emails == [("send_task_assigned", ("cat@example.com", "Cat", "Renamed", "Mom", False))]


def test_update_without_assignees_keeps_them(client, family):
    task = create(client, family)
    updated = client.put(f"/api/parent/tasks/{task['id']}", json={"description": "new"}, headers=family["parent_h"]).json()
    assert [a["child_id"] for a in updated["assignments"]] == family["kids"][:1]


def test_update_validates_merged_task(client, family):
    task = create(client, family)
    h = family["parent_h"]
    assert client.put(f"/api/parent/tasks/{task['id']}", json={"task_type": "rotating"}, headers=h).status_code == 400
    assert client.put(f"/api/parent/tasks/{task['id']}", json={"task_type": "recurring"}, headers=h).status_code == 400
    assert client.put(f"/api/parent/tasks/{task['id']}", json={"assignee_ids": [family["parent"]]}, headers=h).status_code == 400


def test_converting_recurring_task_to_adhoc_removes_open_occurrences(client, family):
    task = create(client, family, task_type="recurring", recurrence="daily", start_date=(utcnow() - timedelta(days=2)).isoformat())
    assert len(task["occurrences"]) == 3
    client.post(f"/api/occurrences/{task['occurrences'][1]['id']}/complete", headers=family["kid_h"][0])
    updated = client.put(f"/api/parent/tasks/{task['id']}", json={"task_type": "adhoc"}, headers=family["parent_h"]).json()
    assert updated["recurrence"] is None
    # Completed history (and the stars it earned) is kept; open occurrences go away.
    assert [o["status"] for o in updated["occurrences"]] == ["completed"]


# ---------------------------------------------------------------- rotating


def test_rotating_task_rotates_through_every_child_in_order(client, family, sent_emails):
    ann, ben, cat = family["kids"]
    task = create(client, family, task_type="rotating", assignee_ids=[ann, ben, cat])
    assert active_child(task) == [ann]
    assert child_titles(client, family["kid_h"][1]) == []

    order = []
    for _ in range(4):
        task = client.post(f"/api/parent/tasks/{task['id']}/advance", headers=family["parent_h"]).json()
        order.append(active_child(task)[0])
    assert order == [ben, cat, ann, ben]
    assert sent_emails[-1] == ("send_task_assigned", ("ben@example.com", "Ben", "Chore", "Mom", True))


def test_completing_rotating_task_hands_it_to_next_child_then_finishes_round(client, family, sent_emails):
    ann, ben, cat = family["kids"]
    task = create(client, family, task_type="rotating", assignee_ids=[ann, ben, cat])
    sent_emails.clear()

    assert client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][1]).status_code == 400
    assert client.post(f"/api/tasks/{task['id']}/status", json={"status": "in_progress"}, headers=family["kid_h"][1]).status_code == 400

    assert client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0]).status_code == 200
    assert sent_emails == [
        ("send_task_completed", ("parent@example.com", "Mom", "Chore", "Ann")),
        ("send_task_assigned", ("ben@example.com", "Ben", "Chore", "Mom", True)),
    ]
    assert child_titles(client, family["kid_h"][0]) == []
    assert child_titles(client, family["kid_h"][1]) == ["Chore"]
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][1])
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][2])

    task = client.get("/api/parent/tasks", headers=family["parent_h"]).json()[0]
    assert task["status"] == "completed"
    assert active_child(task) == []

    # Advancing a finished round starts a new one with the child after the last finisher.
    task = client.post(f"/api/parent/tasks/{task['id']}/advance", headers=family["parent_h"]).json()
    assert active_child(task) == [ann]
    assert task["status"] == "pending"
    assert not any(a["completed"] for a in task["assignments"])


def test_editing_rotating_assignees_moves_turn_when_active_child_removed(client, family):
    ann, ben, cat = family["kids"]
    task = create(client, family, task_type="rotating", assignee_ids=[ann, ben])
    task = client.put(f"/api/parent/tasks/{task['id']}", json={"assignee_ids": [ben, cat]}, headers=family["parent_h"]).json()
    assert active_child(task) == [ben]
    assert sorted((a["child_id"], a["rotation_order"]) for a in task["assignments"]) == [(ben, 0), (cat, 1)]


def test_advance_rejects_non_rotating_tasks(client, family):
    task = create(client, family)
    response = client.post(f"/api/parent/tasks/{task['id']}/advance", headers=family["parent_h"])
    assert response.status_code == 400


# ---------------------------------------------------------------- completing ad-hoc tasks


def test_shared_task_completes_only_when_every_child_is_done(client, family):
    ann, ben, _ = family["kids"]
    task = create(client, family, assignee_ids=[ann, ben], priority="Medium")
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    again = client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    assert again.json() == {"message": "Task already completed"}
    assert client.get("/api/parent/tasks", headers=family["parent_h"]).json()[0]["status"] == "in_progress"
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][1])
    assert client.get("/api/parent/tasks", headers=family["parent_h"]).json()[0]["status"] == "completed"


def test_child_status_rules(client, family):
    task = create(client, family)
    kid = family["kid_h"][0]
    assert client.post(f"/api/tasks/{task['id']}/status", json={"status": "completed"}, headers=kid).status_code == 400
    assert client.post(f"/api/tasks/{task['id']}/status", json={"status": "in_progress"}, headers=kid).status_code == 200
    assert client.get("/api/parent/tasks", headers=family["parent_h"]).json()[0]["status"] == "in_progress"


# ---------------------------------------------------------------- recurring


def test_recurring_task_catches_up_missing_occurrences(client, db, family):
    task = create(client, family, task_type="recurring", recurrence="daily")
    assert len(task["occurrences"]) == 1
    assert client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0]).status_code == 400

    # Pretend the task started three days ago: the next read fills in the missing days.
    db_task = db.get(models.Task, task["id"])
    db_task.start_date = db_task.start_date - timedelta(days=3)
    db.commit()
    occurrences = client.get(f"/api/tasks/{task['id']}/occurrences", headers=family["kid_h"][0]).json()
    dates = [o["occurrence_date"][:10] for o in occurrences]
    expected = [(utcnow() - timedelta(days=d)).date().isoformat() for d in range(4)]
    assert dates == expected
    assert len(child_titles(client, family["kid_h"][0])) == 1


def test_occurrence_completion_by_child_and_status_by_parent(client, db, family, sent_emails):
    task = create(client, family, task_type="recurring", recurrence="weekly", priority="High")
    occurrence_id = task["occurrences"][0]["id"]
    sent_emails.clear()

    done = client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0]).json()
    assert done["status"] == "completed"
    assert done["completed_by"] == family["kids"][0]
    client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0])  # already done: no second award
    assert sent_emails == [("send_task_completed", ("parent@example.com", "Mom", "Chore", "Ann"))]
    assert client.get("/api/child/stats", headers=family["kid_h"][0]).json()["stars"] == 3

    h = family["parent_h"]
    reopened = client.put(f"/api/occurrences/{occurrence_id}/status", json={"status": "pending"}, headers=h).json()
    assert (reopened["status"], reopened["completed_at"], reopened["completed_by"]) == ("pending", None, None)
    same = client.put(f"/api/occurrences/{occurrence_id}/status", json={"status": "pending"}, headers=h)
    assert same.status_code == 200
    logs = client.get(f"/api/parent/tasks/{task['id']}/log", headers=h).json()
    assert [(log["previous_status"], log["new_status"]) for log in logs][:2] == [("completed", "pending"), ("pending", "completed")]


def test_occurrence_permissions(client, db, family):
    task = create(client, family, task_type="recurring", recurrence="daily")
    occurrence_id = task["occurrences"][0]["id"]
    assert client.post("/api/occurrences/9999/complete", headers=family["kid_h"][0]).status_code == 404
    assert client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][1]).status_code == 404
    assert client.put(f"/api/occurrences/{occurrence_id}/status", json={"status": "failed"}, headers=family["kid_h"][0]).status_code == 403
    make_user(db, "dad", models.UserRole.parent)
    other = login(client, "dad")
    assert client.put(f"/api/occurrences/{occurrence_id}/status", json={"status": "failed"}, headers=other).status_code == 404
    assert client.put("/api/occurrences/9999/status", json={"status": "failed"}, headers=other).status_code == 404


@pytest.mark.parametrize(
    "recurrence, start, expected",
    [
        ("daily", datetime(2026, 1, 30, 8, tzinfo=timezone.utc), ["2026-01-30", "2026-01-31", "2026-02-01"]),
        ("weekly", datetime(2026, 1, 1, 8, tzinfo=timezone.utc), ["2026-01-01", "2026-01-08", "2026-01-15"]),
        # The 31st clamps to short months but returns to the 31st afterwards.
        ("monthly", datetime(2026, 1, 31, 8, tzinfo=timezone.utc), ["2026-01-31", "2026-02-28", "2026-03-31"]),
        ("monthly", datetime(2026, 11, 15, 8, tzinfo=timezone.utc), ["2026-11-15", "2026-12-15", "2027-01-15"]),
        ("yearly", datetime(2028, 2, 29, 8, tzinfo=timezone.utc), ["2028-02-29", "2029-02-28", "2030-02-28"]),
    ],
)
def test_recurrence_dates(recurrence, start, expected):
    until = crud._schedule(start, recurrence, 2)
    assert [d.date().isoformat() for d in crud.recurrence_dates(start, recurrence, until)] == expected


def test_recurrence_dates_keep_only_recent_window():
    start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    dates = crud.recurrence_dates(start, "daily", start + timedelta(days=500))
    assert len(dates) == crud.MAX_OCCURRENCES
    assert dates[-1] == start + timedelta(days=500)


def test_changing_schedule_regenerates_open_occurrences(client, family):
    start = (utcnow() - timedelta(days=13)).isoformat()
    task = create(client, family, task_type="recurring", recurrence="daily", start_date=start)
    assert len(task["occurrences"]) == 14
    updated = client.put(f"/api/parent/tasks/{task['id']}", json={"recurrence": "weekly"}, headers=family["parent_h"]).json()
    assert updated["recurrence"] == "weekly"
    assert len(updated["occurrences"]) == 2


def test_monthly_task_starting_on_31st_can_be_created(client, family):
    task = create(client, family, task_type="recurring", recurrence="monthly", start_date="2026-01-31T10:00:00Z")
    assert task["occurrences"][-1]["occurrence_date"].startswith("2026-01-31")


# ---------------------------------------------------------------- stars, streaks, stats


def test_child_stats_stars_and_streak(client, db, family):
    ann = family["kids"][0]
    assert client.get("/api/child/stats", headers=family["kid_h"][0]).json() == {"stars": 0, "completed_count": 0, "streak_days": 0}
    now = utcnow()
    for days_ago, stars in [(1, 2), (2, 1), (4, 3)]:
        db.add(models.CompletionEvent(child_id=ann, task_title="old", stars=stars, completed_at=now - timedelta(days=days_ago)))
    db.commit()
    # Nothing today yet: yesterday's streak still counts.
    assert client.get("/api/child/stats", headers=family["kid_h"][0]).json() == {"stars": 6, "completed_count": 3, "streak_days": 2}

    task = create(client, family, priority="Low")
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    assert client.get("/api/child/stats", headers=family["kid_h"][0]).json() == {"stars": 7, "completed_count": 4, "streak_days": 3}


def test_parent_stats_counts_and_leaderboard(client, family):
    ann, ben, _ = family["kids"]
    done = create(client, family, priority="High")
    create(client, family, assignee_ids=[ben])
    failed = create(client, family, assignee_ids=[ben])
    client.post(f"/api/child/tasks/{done['id']}/complete", headers=family["kid_h"][0])
    client.post(f"/api/tasks/{failed['id']}/status", json={"status": "failed"}, headers=family["parent_h"])

    stats = client.get("/api/parent/tasks/stats", headers=family["parent_h"]).json()
    assert {k: v for k, v in stats.items() if k != "children"} == {
        "total_tasks": 3,
        "completed_tasks": 1,
        "pending_tasks": 1,
        "in_progress_tasks": 0,
        "failed_tasks": 1,
    }
    assert stats["children"][0] == {"child_id": ann, "name": "Ann", "stars": 3, "completed_count": 1, "streak_days": 1}
    assert len(stats["children"]) == 3


def test_parent_stats_use_current_occurrence_for_recurring_tasks(client, family):
    daily = create(client, family, task_type="recurring", recurrence="daily")
    create(client, family, task_type="recurring", recurrence="weekly", start_date=(utcnow() + timedelta(days=3)).isoformat())
    client.post(f"/api/occurrences/{daily['occurrences'][0]['id']}/complete", headers=family["kid_h"][0])
    stats = client.get("/api/parent/tasks/stats", headers=family["parent_h"]).json()
    # Today's chore is done; the not-yet-started one is still to do.
    assert (stats["completed_tasks"], stats["pending_tasks"]) == (1, 1)
