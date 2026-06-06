from datetime import datetime

from app import crud, models, schemas


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client, email: str, password: str) -> str:
    response = client.post("/api/token", data={"username": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def create_user(db, email: str, username: str, full_name: str, role: models.UserRole, password: str):
    return crud.create_user(
        db,
        schemas.UserCreate(
            email=email,
            username=username,
            full_name=full_name,
            role=role,
            password=password,
        ),
    )


def test_admin_can_reset_password_and_authenticate(client, db):
    admin = create_user(db, "admin@example.com", "admin", "Admin User", models.UserRole.admin, "adminpass")
    child = create_user(db, "child@example.com", "childuser", "Child User", models.UserRole.child, "childpass")

    admin_token = login(client, admin.email, "adminpass")
    response = client.post(
        "/api/admin/reset-password",
        json={"email": child.email, "new_password": "newchildpass"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Password reset successfully"

    child_token = login(client, child.email, "newchildpass")
    assert child_token


def test_parent_list_children_and_create_task(client, db):
    admin = create_user(db, "admin2@example.com", "admin2", "Admin Two", models.UserRole.admin, "adminpass2")
    parent = create_user(db, "parent@example.com", "parentuser", "Parent User", models.UserRole.parent, "parentpass")
    child = create_user(db, "kid@example.com", "kiduser", "Kid User", models.UserRole.child, "kidpass")

    parent_token = login(client, parent.email, "parentpass")
    child_token = login(client, child.email, "kidpass")

    response = client.get("/api/parent/children", headers=auth_header(parent_token))
    assert response.status_code == 200
    children = response.json()
    assert any(item["email"] == child.email for item in children)

    due_date = datetime.utcnow().replace(microsecond=0).isoformat()
    create_response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Wash dishes",
            "description": "Clean the kitchen after dinner",
            "due_date": due_date,
            "priority": "High",
            "assignee_ids": [child.id],
            "recurrence": "weekly",
        },
        headers=auth_header(parent_token),
    )
    assert create_response.status_code == 200, create_response.text
    task = create_response.json()
    assert task["title"] == "Wash dishes"
    assert task["recurrence"] == "weekly"
    assert task["assignments"]

    list_response = client.get("/api/parent/tasks", headers=auth_header(parent_token))
    assert list_response.status_code == 200
    tasks = list_response.json()
    assert len(tasks) == 1

    child_tasks_response = client.get("/api/child/tasks", headers=auth_header(child_token))
    assert child_tasks_response.status_code == 200
    child_tasks = child_tasks_response.json()
    assert len(child_tasks) == 1
    assert child_tasks[0]["title"] == "Wash dishes"
