import logging
import smtplib

import httpx
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from app import auth, crud, database, mailer, main, models
from conftest import PASSWORD, TestingSessionLocal, login, make_user


# ---------------------------------------------------------------- database


def test_database_url_helpers():
    assert database.normalize_database_url("postgres://u:p@h/db") == "postgresql://u:p@h/db"
    assert database.normalize_database_url("sqlite:///x.db") == "sqlite:///x.db"
    assert database.engine_options("sqlite:///x.db") == {"connect_args": {"check_same_thread": False}}
    assert database.engine_options("postgresql://h/db") == {"pool_pre_ping": True}


def test_upgrade_adds_missing_columns_and_wipes_plaintext_passwords():
    legacy = create_engine("sqlite://", poolclass=StaticPool)
    with legacy.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR, username VARCHAR, full_name VARCHAR, "
                          "hashed_password VARCHAR, role VARCHAR, display_password VARCHAR, created_at DATETIME)"))
        conn.execute(text("CREATE TABLE tasks (id INTEGER PRIMARY KEY, title VARCHAR, recurrence VARCHAR, status VARCHAR, created_by INTEGER)"))
        conn.execute(text("CREATE TABLE task_assignments (id INTEGER PRIMARY KEY, task_id INTEGER, child_id INTEGER)"))
        conn.execute(text("CREATE TABLE task_occurrences (id INTEGER PRIMARY KEY, task_id INTEGER, occurrence_date DATETIME, status VARCHAR)"))
        conn.execute(text("INSERT INTO users (email, hashed_password, role, display_password) VALUES ('a@x.com', 'h', 'child', 'secret123')"))
        conn.execute(text("INSERT INTO tasks (title, recurrence, status, created_by) VALUES ('daily', 'daily', 'pending', 1), ('once', NULL, 'pending', 1)"))

    database.init_db(legacy)
    database.init_db(legacy)  # idempotent

    inspector = inspect(legacy)
    for table, column, _ in database.ADDED_COLUMNS:
        assert column in {c["name"] for c in inspector.get_columns(table)}
    with legacy.connect() as conn:
        assert conn.execute(text("SELECT display_password, token_version FROM users")).one() == (None, 0)
        assert conn.execute(text("SELECT title, task_type FROM tasks ORDER BY id")).all() == [("daily", "recurring"), ("once", "adhoc")]
    assert "completion_events" in inspector.get_table_names()


# ---------------------------------------------------------------- startup


def test_startup_persists_generated_jwt_secret(monkeypatch):
    monkeypatch.setattr(auth, "SECRET_KEY", "per-process")
    main.startup()
    first = auth.SECRET_KEY
    assert first != "per-process" and len(first) >= 48
    main.startup()
    assert auth.SECRET_KEY == first


def test_startup_keeps_configured_secret(monkeypatch):
    monkeypatch.setenv("TASKER_SECRET_KEY", "configured")
    monkeypatch.setattr(auth, "SECRET_KEY", "configured")
    main.startup()
    assert auth.SECRET_KEY == "configured"


def test_lifespan_runs_startup(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "startup", lambda: calls.append(True))
    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
    assert calls == [True]


def test_default_admin_gets_generated_password_when_none_configured(db, caplog, client):
    with caplog.at_level(logging.WARNING, logger="tasker"):
        main.create_default_admin(db)
    password = caplog.records[0].args[1]
    assert len(password) >= 12
    login(client, "admin@example.com", password)
    # Restarting must not create a second admin or change the password.
    main.create_default_admin(db)
    assert db.query(models.User).filter(models.User.role == models.UserRole.admin).count() == 1
    login(client, "admin", password)


def test_default_admin_password_from_env_is_applied_only_when_changed(db, client, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "env-password-1")
    main.create_default_admin(db)
    headers = login(client, "admin", "env-password-1")
    main.create_default_admin(db)  # unchanged: existing sessions stay valid
    assert client.get("/api/me", headers=headers).status_code == 200
    monkeypatch.setenv("ADMIN_PASSWORD", "env-password-2")
    main.create_default_admin(db)
    assert client.get("/api/me", headers=headers).status_code == 401
    login(client, "admin", "env-password-2")


def test_default_admin_skipped_when_another_admin_exists(db):
    make_user(db, "boss", models.UserRole.admin)
    main.create_default_admin(db)
    assert crud.get_user_by_email(db, "admin@example.com") is None


def test_legacy_admin_is_migrated(db, client, monkeypatch):
    db.add(models.User(email="admin@tasker.local", username="old", hashed_password=auth.get_password_hash(PASSWORD), role=models.UserRole.parent, token_version=0))
    db.commit()
    main.create_default_admin(db)
    me = client.get("/api/me", headers=login(client, "admin@example.com")).json()
    assert (me["role"], me["username"]) == ("admin", "admin")


# ---------------------------------------------------------------- http


def test_health_and_security_headers(client, monkeypatch):
    monkeypatch.setenv("APP_ENV", "qa")
    response = client.get("/api/health")
    assert response.json() == {"status": "ok", "version": "0.4.0", "environment": "qa"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_cors_allows_configured_origin(client):
    response = client.options("/api/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    blocked = client.options("/api/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in blocked.headers


# ---------------------------------------------------------------- mailer


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=httpx.Request("POST", mailer.BREVO_URL), response=httpx.Response(self.status_code))


@pytest.fixture()
def brevo(monkeypatch):
    calls = []
    status = {"code": 201}

    def fake_post(url, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return FakeResponse(status["code"])

    monkeypatch.setattr(mailer.httpx, "post", fake_post)
    monkeypatch.setenv("BREVO_API_KEY", "test-key")
    monkeypatch.setenv("EMAIL_SENDER_ADDRESS", "hello@family.example")
    monkeypatch.setenv("APP_BASE_URL", "https://tasks.example/")
    return calls, status


def test_email_skipped_without_configuration(monkeypatch, caplog):
    monkeypatch.setattr(mailer.httpx, "post", lambda *a, **k: pytest.fail("should not call Brevo"))
    with caplog.at_level(logging.INFO, logger="tasker.mailer"):
        assert mailer.send_welcome("kid@example.com", "Kid", "child") is False
    monkeypatch.setenv("BREVO_API_KEY", "key-only")
    assert mailer.send_welcome("kid@example.com", "Kid", "child") is False
    assert "Email skipped" in caplog.text


def test_brevo_request_shape(brevo):
    calls, _ = brevo
    assert mailer.send_password_reset("kid@example.com", None, "tok123") is True
    [call] = calls
    assert call["url"] == "https://api.brevo.com/v3/smtp/email"
    assert call["headers"]["api-key"] == "test-key"
    body = call["json"]
    assert body["sender"] == {"email": "hello@family.example", "name": "Family Task Adventure"}
    assert body["to"] == [{"email": "kid@example.com", "name": "kid@example.com"}]
    assert "https://tasks.example/reset-password?token=tok123" in body["htmlContent"]
    assert "https://tasks.example/reset-password?token=tok123" in body["textContent"]
    assert body["tags"] == ["tasker", "password-reset"]


def test_brevo_escapes_user_content_and_honours_override(brevo, monkeypatch):
    calls, _ = brevo
    monkeypatch.setenv("EMAIL_OVERRIDE_RECIPIENT", "qa@family.example")
    mailer.send_task_assigned("kid@example.com", "Kid", "<script>x</script>", "Mom")
    mailer.send_task_assigned("kid@example.com", "Kid", "Dishes", "Mom", your_turn=True)
    mailer.send_task_completed("mom@example.com", "Mom", "Dishes", "Kid")
    mailer.send_welcome("kid@example.com", "Kid", "child")
    assert all(c["json"]["to"][0]["email"] == "qa@family.example" for c in calls)
    assert calls[0]["json"]["subject"].startswith("[for kid@example.com] New task:")
    assert "<script>" not in calls[0]["json"]["htmlContent"]
    assert "&lt;script&gt;" in calls[0]["json"]["htmlContent"]
    assert "It's your turn" in calls[1]["json"]["subject"]
    assert calls[2]["json"]["subject"] == "[for mom@example.com] Kid finished: Dishes 🎉"
    assert "https://tasks.example/login" in calls[3]["json"]["htmlContent"]


def test_brevo_failure_is_logged_not_raised(brevo, caplog):
    _, status = brevo
    status["code"] = 401
    with caplog.at_level(logging.ERROR, logger="tasker.mailer"):
        assert mailer.send_task_completed("mom@example.com", "Mom", "Dishes", "Kid") is False
    assert "failed" in caplog.text


class FakeSMTP:
    instances = []
    fail_login = False

    def __init__(self, host, port, timeout):
        self.address, self.calls, self.sent = (host, port), [], []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.calls.append("quit")

    def starttls(self):
        self.calls.append("starttls")

    def login(self, user, password):
        if FakeSMTP.fail_login:
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials")
        self.calls.append(("login", user, password))

    def send_message(self, message):
        self.sent.append(message)


@pytest.fixture()
def brevo_smtp(monkeypatch):
    FakeSMTP.instances, FakeSMTP.fail_login = [], False
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(mailer.httpx, "post", lambda *a, **k: pytest.fail("SMTP keys must not use the REST API"))
    monkeypatch.setenv("BREVO_API_KEY", "xsmtpsib-secret")
    monkeypatch.setenv("EMAIL_SENDER_ADDRESS", "hello@family.example")
    monkeypatch.setenv("APP_BASE_URL", "https://tasks.example")
    return FakeSMTP


def test_smtp_key_sends_through_brevo_relay(brevo_smtp, monkeypatch):
    monkeypatch.setenv("EMAIL_OVERRIDE_RECIPIENT", "qa@family.example")
    assert mailer.send_task_assigned("kid@example.com", "Kid", "<b>Dishes</b>", "Mom") is True
    [smtp] = brevo_smtp.instances
    assert smtp.address == ("smtp-relay.brevo.com", 587)
    # TLS must be negotiated before the key is sent; the login defaults to the sender address.
    assert smtp.calls == ["starttls", ("login", "hello@family.example", "xsmtpsib-secret"), "quit"]
    [message] = smtp.sent
    assert message["From"] == "Family Task Adventure <hello@family.example>"
    assert message["To"] == "qa@family.example"
    assert message["Subject"] == "[for kid@example.com] New task: <b>Dishes</b> 🎯"
    assert message["X-Mailin-Tag"] == "tasker, task-assigned"
    html_part = message.get_body(("html",)).get_content()
    assert "&lt;b&gt;Dishes&lt;/b&gt;" in html_part and "https://tasks.example/child" in html_part
    assert "https://tasks.example/child" in message.get_body(("plain",)).get_content()

    monkeypatch.setenv("BREVO_SMTP_LOGIN", "8a1b2c@smtp-brevo.com")
    mailer.send_welcome("kid@example.com", "Kid", "child")
    assert brevo_smtp.instances[1].calls[1] == ("login", "8a1b2c@smtp-brevo.com", "xsmtpsib-secret")


def test_smtp_failure_is_logged_not_raised(brevo_smtp, caplog):
    brevo_smtp.fail_login = True
    with caplog.at_level(logging.ERROR, logger="tasker.mailer"):
        assert mailer.send_task_completed("mom@example.com", "Mom", "Dishes", "Kid") is False
    assert "failed" in caplog.text and brevo_smtp.instances[0].sent == []


def test_app_endpoints_send_real_brevo_requests_in_background(client, db, brevo):
    calls, _ = brevo
    make_user(db, "kid", models.UserRole.child)
    client.post("/api/auth/forgot-password", json={"email": "kid@example.com"})
    assert calls[0]["json"]["tags"] == ["tasker", "password-reset"]


def test_session_factory_is_used_by_dependency():
    from app import deps

    generator = deps.get_db()
    session = next(generator)
    assert isinstance(session, TestingSessionLocal.class_)
    generator.close()
