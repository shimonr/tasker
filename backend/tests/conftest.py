import os
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import auth, crud, database, main, models, schemas  # noqa: E402

# Set TEST_DATABASE_URL (e.g. a throwaway PostgreSQL) to run the suite against a real server.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
engine = (
    create_engine(TEST_DATABASE_URL)
    if TEST_DATABASE_URL
    else create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "correct-horse"


database.Base.metadata.create_all(bind=engine)


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch):
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", TestingSessionLocal)
    for name in ("BREVO_API_KEY", "BREVO_SMTP_LOGIN", "EMAIL_SENDER_ADDRESS", "EMAIL_OVERRIDE_RECIPIENT", "ADMIN_PASSWORD", "TASKER_SECRET_KEY", "APP_BASE_URL", "REMINDER_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    auth.login_limiter.clear()
    auth.password_reset_limiter.clear()
    auth.signup_limiter.clear()
    yield
    # Empty every table (keeping the schema) so tests stay independent.
    with engine.begin() as conn:
        for table in reversed(database.Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    return TestClient(main.app)


@pytest.fixture()
def sent_emails(monkeypatch):
    """Capture emails instead of calling Brevo."""
    sent = []
    for name in ("send_welcome", "send_password_reset", "send_task_assigned", "send_task_completed", "send_approval_request", "send_reminder"):
        monkeypatch.setattr(main.mailer, name, lambda *args, _name=name: sent.append((_name, args)))
    return sent


def make_user(db, name: str, role: models.UserRole, password: str = PASSWORD, full_name: str | None = None, family_id: int | None = None) -> models.User:
    """Create a user. Without a family_id, parents and kids each get a family of their own."""
    if family_id is None and role != models.UserRole.admin:
        family_id = crud.create_family(db, f"{name} family").id
    return crud.add_user(
        db,
        email=f"{name}@example.com",
        username=name,
        full_name=full_name or name.title(),
        password=password,
        role=role,
        family_id=family_id,
    )


def login(client, identifier: str, password: str = PASSWORD) -> dict[str, str]:
    response = client.post("/api/token", data={"username": identifier, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def family(db, client):
    """A parent with three children, all logged in."""
    family_id = crud.create_family(db, "Smiths").id
    parent = make_user(db, "parent", models.UserRole.parent, full_name="Mom", family_id=family_id)
    kids = [make_user(db, name, models.UserRole.child, family_id=family_id) for name in ("ann", "ben", "cat")]
    return {
        "family_id": family_id,
        "parent": parent.id,
        "kids": [kid.id for kid in kids],
        "parent_h": login(client, "parent"),
        "kid_h": [login(client, kid.username) for kid in kids],
    }
