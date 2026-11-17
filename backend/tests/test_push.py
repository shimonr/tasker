import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from pywebpush import WebPushException

from app import mailer, models, push
from app.timeutil import utcnow
from conftest import login, make_user


@pytest.fixture()
def pushes(monkeypatch):
    """Record web pushes instead of sending them. Add an endpoint to `failures` to make its send raise."""
    sent = []
    failures = {}

    def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims):
        endpoint = subscription_info["endpoint"]
        if endpoint in failures:
            raise failures[endpoint]
        sent.append({"endpoint": endpoint, "payload": json.loads(data), "claims": vapid_claims, "key": vapid_private_key})

    monkeypatch.setattr(push, "webpush", fake_webpush)
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "public-key")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("APP_BASE_URL", "https://shimonr.com/tasker/")
    monkeypatch.setenv("ADMIN_EMAIL", "shimonro@hotmail.com")
    return sent, failures


def subscribe(client, headers, endpoint):
    body = {"endpoint": endpoint, "keys": {"p256dh": f"{endpoint}-p256dh", "auth": f"{endpoint}-auth"}}
    response = client.post("/api/me/push-subscriptions", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def unsubscribe(client, headers, endpoint):
    response = client.request("DELETE", "/api/me/push-subscriptions", json={"endpoint": endpoint}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def endpoints_in_db(db):
    return sorted(sub.endpoint for sub in db.query(models.PushSubscription).all())


def test_config_offers_the_public_key_only_when_push_is_set_up(client, family, monkeypatch):
    assert client.get("/api/push/config", headers=family["kid_h"][0]).json() == {"public_key": None}
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "public-key")
    assert client.get("/api/push/config", headers=family["kid_h"][0]).json() == {"public_key": None}
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    assert client.get("/api/push/config", headers=family["kid_h"][0]).json() == {"public_key": "public-key"}


def test_config_requires_sign_in(client):
    assert client.get("/api/push/config").status_code == 401


def test_each_endpoint_is_stored_once_and_unsubscribing_only_affects_the_signed_in_user(client, family, db):
    ann_h, ben_h = family["kid_h"][0], family["kid_h"][1]
    subscribe(client, ann_h, "https://push.example/ann-phone")
    subscribe(client, ann_h, "https://push.example/ann-phone")
    subscribe(client, ann_h, "https://push.example/ann-laptop")
    assert endpoints_in_db(db) == ["https://push.example/ann-laptop", "https://push.example/ann-phone"]

    # A shared device: once Ben signs in and subscribes, the endpoint belongs to Ben.
    subscribe(client, ben_h, "https://push.example/ann-phone")
    assert unsubscribe(client, ann_h, "https://push.example/ann-phone") == {"message": "Notifications are off for this device."}
    assert endpoints_in_db(db) == ["https://push.example/ann-laptop", "https://push.example/ann-phone"]

    unsubscribe(client, ben_h, "https://push.example/ann-phone")
    assert endpoints_in_db(db) == ["https://push.example/ann-laptop"]


def test_notify_sends_to_each_of_the_users_devices_and_no_one_else(client, family, pushes):
    sent, _ = pushes
    ann_h, ben_h = family["kid_h"][0], family["kid_h"][1]
    subscribe(client, ann_h, "https://push.example/ann-phone")
    subscribe(client, ann_h, "https://push.example/ann-laptop")
    subscribe(client, ben_h, "https://push.example/ben-phone")

    push.notify(family["kids"][0], "Hi", "Body text", "/child")

    assert sorted(item["endpoint"] for item in sent) == ["https://push.example/ann-laptop", "https://push.example/ann-phone"]
    assert all(item["payload"] == {"title": "Hi", "body": "Body text", "url": "https://shimonr.com/tasker/child"} for item in sent)
    assert all(item["claims"] == {"sub": "mailto:shimonro@hotmail.com"} and item["key"] == "private-key" for item in sent)


def test_notify_does_nothing_until_push_is_configured(client, family, pushes, monkeypatch):
    sent, _ = pushes
    subscribe(client, family["kid_h"][0], "https://push.example/ann-phone")
    monkeypatch.delenv("VAPID_PRIVATE_KEY")
    push.notify(family["kids"][0], "Hi", "Body", "/child")
    assert sent == []


def test_devices_that_are_gone_are_forgotten_and_other_failures_are_kept(client, family, db, pushes):
    sent, failures = pushes
    ann_h = family["kid_h"][0]
    for endpoint in ("gone", "server-error", "no-response", "crash"):
        subscribe(client, ann_h, f"https://push.example/{endpoint}")
    failures["https://push.example/gone"] = WebPushException("gone", response=SimpleNamespace(status_code=410))
    failures["https://push.example/no-response"] = WebPushException("network")
    failures["https://push.example/server-error"] = WebPushException("boom", response=SimpleNamespace(status_code=500))
    failures["https://push.example/crash"] = RuntimeError("bad key")

    push.notify(family["kids"][0], "Hi", "Body", "/child")

    assert sent == []
    assert endpoints_in_db(db) == ["https://push.example/crash", "https://push.example/no-response", "https://push.example/server-error"]


def test_assigning_a_task_pushes_the_child(client, family, pushes):
    sent, _ = pushes
    ann_h = family["kid_h"][0]
    subscribe(client, ann_h, "https://push.example/ann-phone")

    client.post("/api/parent/tasks", json={"title": "Bins", "task_type": "adhoc", "assignee_ids": [family["kids"][0]]}, headers=family["parent_h"])

    assert [(item["endpoint"], item["payload"]["title"], item["payload"]["body"]) for item in sent] == [
        ("https://push.example/ann-phone", "New mission! 🎯", "Mom gave you: Bins")
    ]


def test_passing_a_rotating_task_pushes_the_next_child_their_turn(client, family, pushes):
    sent, _ = pushes
    ann, ben = family["kids"][0], family["kids"][1]
    subscribe(client, family["kid_h"][1], "https://push.example/ben-phone")
    task = client.post(
        "/api/parent/tasks",
        json={"title": "Trash", "task_type": "rotating", "assignee_ids": [ann, ben]},
        headers=family["parent_h"],
    ).json()
    sent.clear()

    client.post(f"/api/parent/tasks/{task['id']}/advance", headers=family["parent_h"])

    assert [(item["endpoint"], item["payload"]["title"], item["payload"]["body"]) for item in sent] == [
        ("https://push.example/ben-phone", "It's your turn! 🔄", "Trash")
    ]


def test_finishing_a_task_pushes_the_parent_and_asks_for_approval_when_needed(client, family, pushes):
    sent, _ = pushes
    ann, ann_h = family["kids"][0], family["kid_h"][0]
    subscribe(client, family["parent_h"], "https://push.example/mom-phone")
    plain = client.post("/api/parent/tasks", json={"title": "Bins", "task_type": "adhoc", "assignee_ids": [ann]}, headers=family["parent_h"]).json()
    checked = client.post(
        "/api/parent/tasks",
        json={"title": "Vacuum", "task_type": "adhoc", "assignee_ids": [ann], "requires_approval": True},
        headers=family["parent_h"],
    ).json()
    sent.clear()

    client.post(f"/api/child/tasks/{plain['id']}/complete", headers=ann_h)
    client.post(f"/api/child/tasks/{checked['id']}/complete", headers=ann_h)

    assert [item["payload"] for item in sent] == [
        {"title": "Mission done! 🎉", "body": "Ann finished Bins", "url": "https://shimonr.com/tasker/parent"},
        {"title": "Approval needed 👀", "body": "Ann finished Vacuum", "url": "https://shimonr.com/tasker/parent"},
    ]


def test_reminders_push_the_child_once_the_email_goes_out(client, family, pushes, monkeypatch):
    sent, _ = pushes
    ann_h = family["kid_h"][0]
    subscribe(client, ann_h, "https://push.example/ann-phone")
    monkeypatch.setattr(mailer, "send_reminder", lambda email, name, title: True)
    monkeypatch.setenv("REMINDER_TOKEN", "cron-secret")
    soon = (utcnow() + timedelta(hours=3)).isoformat()
    client.post("/api/parent/tasks", json={"title": "Bins", "task_type": "adhoc", "assignee_ids": [family["kids"][0]], "due_date": soon}, headers=family["parent_h"])
    sent.clear()

    assert client.post("/api/internal/reminders", headers={"X-Reminder-Token": "cron-secret"}).json() == {"message": "Sent 1 reminders"}

    assert [(item["endpoint"], item["payload"]["title"], item["payload"]["body"]) for item in sent] == [
        ("https://push.example/ann-phone", "Reminder ⏰", "Bins")
    ]
