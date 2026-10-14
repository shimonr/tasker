from datetime import timedelta

import jwt
import pytest

from app import auth, models
from app.timeutil import utcnow
from conftest import PASSWORD, login, make_user


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- login & tokens


def test_login_by_email_or_username_case_insensitive(client, db):
    make_user(db, "kid", models.UserRole.child)
    assert client.get("/api/me", headers=login(client, "KID@example.com")).json()["username"] == "kid"
    me = client.get("/api/me", headers=login(client, " Kid ")).json()
    assert me["role"] == "child"
    assert "password" not in str(me)  # no plaintext or hashed password leaks


def test_wrong_password_is_rejected_and_rate_limited(client, db):
    make_user(db, "kid", models.UserRole.child)
    for _ in range(10):
        assert client.post("/api/token", data={"username": "kid", "password": "nope"}).status_code == 401
    # Even the right password is refused while the account is locked.
    response = client.post("/api/token", data={"username": "kid", "password": PASSWORD})
    assert response.status_code == 429


def test_successful_login_resets_failure_count(client, db):
    make_user(db, "kid", models.UserRole.child)
    for _ in range(9):
        client.post("/api/token", data={"username": "kid", "password": "nope"})
    login(client, "kid")
    for _ in range(9):
        client.post("/api/token", data={"username": "kid", "password": "nope"})
    login(client, "kid")


def test_rate_limiter_window_expires(monkeypatch):
    limiter = auth.RateLimiter(max_attempts=2, window_seconds=60)
    now = [1000.0]
    monkeypatch.setattr(auth.time, "monotonic", lambda: now[0])
    assert not limiter.is_blocked("k")
    limiter.hit("k")
    limiter.hit("k")
    assert limiter.is_blocked("k")
    now[0] += 61
    assert not limiter.is_blocked("k")
    assert limiter._hits == {}  # expired keys are dropped, not leaked


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        jwt.encode({"type": "access", "ver": 0}, "x", algorithm="HS256"),  # wrong signature
        "missing-sub",
        "non-int-sub",
        "reset-token",
        "expired",
    ],
)
def test_invalid_tokens_are_rejected(client, db, token):
    user = make_user(db, "kid", models.UserRole.child)
    key, alg = auth.SECRET_KEY, auth.ALGORITHM
    crafted = {
        "missing-sub": jwt.encode({"type": "access", "ver": 0}, key, algorithm=alg),
        "non-int-sub": jwt.encode({"type": "access", "ver": 0, "sub": "abc"}, key, algorithm=alg),
        "reset-token": auth.create_reset_token(user.id, 0),
        "expired": jwt.encode({"type": "access", "ver": 0, "sub": str(user.id), "exp": utcnow() - timedelta(minutes=1)}, key, algorithm=alg),
    }
    response = client.get("/api/me", headers=bearer(crafted.get(token, token)))
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_token_of_deleted_user_is_rejected(client, db):
    user = make_user(db, "kid", models.UserRole.child)
    headers = login(client, "kid")
    db.delete(user)
    db.commit()
    assert client.get("/api/me", headers=headers).status_code == 401


def test_password_reset_by_admin_revokes_existing_sessions(client, db):
    make_user(db, "boss", models.UserRole.admin)
    make_user(db, "kid", models.UserRole.child)
    kid_headers = login(client, "kid")
    response = client.post(
        "/api/admin/reset-password", json={"email": "kid@example.com", "new_password": "brand-new-pass"}, headers=login(client, "boss")
    )
    assert response.status_code == 200
    assert client.get("/api/me", headers=kid_headers).status_code == 401
    login(client, "kid", "brand-new-pass")


# ---------------------------------------------------------------- forgot / reset password


def test_forgot_password_emails_a_working_one_time_link(client, db, sent_emails):
    make_user(db, "kid", models.UserRole.child, full_name="Kiddo")
    response = client.post("/api/auth/forgot-password", json={"email": "KID@example.com"})
    assert response.status_code == 200
    [(kind, (email, name, token))] = sent_emails
    assert (kind, email, name) == ("send_password_reset", "kid@example.com", "Kiddo")

    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "short"}).status_code == 422
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "my-new-secret"}).status_code == 200
    login(client, "kid", "my-new-secret")
    # The link cannot be reused once the password changed.
    reused = client.post("/api/auth/reset-password", json={"token": token, "new_password": "another-secret"})
    assert reused.status_code == 400


def test_forgot_password_does_not_reveal_unknown_accounts(client, sent_emails):
    known = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert known.status_code == 200
    assert known.json()["message"].startswith("If that account exists")
    assert sent_emails == []


def test_forgot_password_is_rate_limited_per_email(client, db, sent_emails):
    make_user(db, "kid", models.UserRole.child)
    for _ in range(5):
        assert client.post("/api/auth/forgot-password", json={"email": "kid@example.com"}).status_code == 200
    assert len(sent_emails) == 3


@pytest.mark.parametrize("case", ["garbage", "access-token", "deleted-user", "no-sub"])
def test_reset_password_rejects_bad_tokens(client, db, case):
    user = make_user(db, "kid", models.UserRole.child)
    tokens = {
        "garbage": "garbage",
        "access-token": auth.create_access_token(user.id, "child", 0),
        "deleted-user": auth.create_reset_token(9999, 0),
        "no-sub": jwt.encode({"type": "reset", "ver": 0}, auth.SECRET_KEY, algorithm=auth.ALGORITHM),
    }
    response = client.post("/api/auth/reset-password", json={"token": tokens[case], "new_password": "my-new-secret"})
    assert response.status_code == 400
    assert response.json()["detail"] == "This reset link is invalid or has expired."


# ---------------------------------------------------------------- admin


@pytest.fixture()
def admin_h(db, client):
    make_user(db, "boss", models.UserRole.admin)
    return login(client, "boss")


def test_admin_creates_user_and_welcome_email_is_sent(client, admin_h, sent_emails):
    response = client.post(
        "/api/admin/users",
        json={"email": "new@example.com", "username": "  ", "full_name": "New Kid", "role": "child", "password": "long-enough"},
        headers=admin_h,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["username"] is None  # blank usernames are stored as NULL, not ""
    assert body["created_at"].endswith(("Z", "+00:00"))
    assert sent_emails == [("send_welcome", ("new@example.com", "New Kid", "child"))]
    # A second user without username must not collide on "".
    second = client.post(
        "/api/admin/users", json={"email": "new2@example.com", "username": "", "role": "child", "password": "long-enough"}, headers=admin_h
    )
    assert second.status_code == 200


@pytest.mark.parametrize(
    "payload, status",
    [
        ({"email": "boss@example.com", "role": "child", "password": "long-enough"}, 400),
        ({"email": "x@example.com", "username": "BOSS", "role": "child", "password": "long-enough"}, 400),
        ({"email": "x@example.com", "role": "child", "password": "short"}, 422),
        ({"email": "not-an-email", "role": "child", "password": "long-enough"}, 422),
    ],
)
def test_admin_create_user_validation(client, admin_h, payload, status):
    assert client.post("/api/admin/users", json=payload, headers=admin_h).status_code == status


def test_admin_lists_and_updates_users(client, db, admin_h):
    kid = make_user(db, "kid", models.UserRole.child)
    make_user(db, "other", models.UserRole.child)
    assert {u["username"] for u in client.get("/api/admin/users", headers=admin_h).json()} == {"boss", "kid", "other"}

    response = client.put(f"/api/admin/users/{kid.id}", json={"full_name": "Kid Renamed", "username": "kid"}, headers=admin_h)
    assert response.status_code == 200
    assert response.json()["full_name"] == "Kid Renamed"

    taken = client.put(f"/api/admin/users/{kid.id}", json={"email": "other@example.com"}, headers=admin_h)
    assert taken.status_code == 400
    assert client.put("/api/admin/users/9999", json={"full_name": "x"}, headers=admin_h).status_code == 404


def test_admin_cannot_demote_or_delete_themselves(client, db, admin_h):
    me = client.get("/api/me", headers=admin_h).json()
    assert client.put(f"/api/admin/users/{me['id']}", json={"role": "parent"}, headers=admin_h).status_code == 400
    assert client.put(f"/api/admin/users/{me['id']}", json={"role": "admin", "full_name": "Boss"}, headers=admin_h).status_code == 200
    assert client.delete(f"/api/admin/users/{me['id']}", headers=admin_h).status_code == 400
    assert client.delete("/api/admin/users/9999", headers=admin_h).status_code == 404


def test_admin_reset_password_validation(client, admin_h):
    unknown = client.post("/api/admin/reset-password", json={"email": "ghost@example.com", "new_password": "long-enough"}, headers=admin_h)
    assert unknown.status_code == 404
    short = client.post("/api/admin/reset-password", json={"email": "boss@example.com", "new_password": "123"}, headers=admin_h)
    assert short.status_code == 422


def test_deleting_users_removes_their_tasks_and_history(client, db, admin_h, family):
    task = client.post(
        "/api/parent/tasks", json={"title": "Dishes", "assignee_ids": family["kids"][:2]}, headers=family["parent_h"]
    ).json()
    daily = client.post(
        "/api/parent/tasks",
        json={"title": "Bed", "task_type": "recurring", "recurrence": "daily", "assignee_ids": [family["kids"][0]]},
        headers=family["parent_h"],
    ).json()
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    client.post(f"/api/occurrences/{daily['occurrences'][0]['id']}/complete", headers=family["kid_h"][0])

    assert client.delete(f"/api/admin/users/{family['kids'][0]}", headers=admin_h).status_code == 200
    remaining = client.get("/api/parent/tasks", headers=family["parent_h"]).json()
    assert [a["child_id"] for a in remaining[1]["assignments"]] == [family["kids"][1]]
    assert remaining[0]["occurrences"][0]["completed_by"] is None

    assert client.delete(f"/api/admin/users/{family['parent']}", headers=admin_h).status_code == 200
    assert db.query(models.Task).count() == 0
    assert db.query(models.TaskStatusLog).count() == 0


@pytest.mark.parametrize(
    "method, path",
    [("get", "/api/admin/users"), ("get", "/api/parent/tasks"), ("get", "/api/child/tasks")],
)
def test_role_checks(client, db, method, path):
    make_user(db, "stranger", models.UserRole.admin if "admin" not in path else models.UserRole.parent)
    assert getattr(client, method)(path, headers=login(client, "stranger")).status_code == 403
    assert getattr(client, method)(path).status_code == 401
