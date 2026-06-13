from datetime import datetime, timedelta

from app import crud, models, schemas


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client, email: str, password: str) -> str:
    response = client.post("/api/token", data={"username": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def create_user(db, email: str, username: str, full_name: str, role: models.UserRole, password: str):
    user = crud.create_user(
        db,
        schemas.UserCreate(
            email=email,
            username=username,
            full_name=full_name,
            role=role,
            password=password,
        ),
    )
    user_id = user.id
    user_email = user.email
    return user_id, user_email


def test_admin_can_reset_password_and_authenticate(client, db):
    admin_id, admin_email = create_user(db, "admin@example.com", "admin", "Admin User", models.UserRole.admin, "adminpass")
    child_id, child_email = create_user(db, "child@example.com", "childuser", "Child User", models.UserRole.child, "childpass")

    admin_token = login(client, admin_email, "adminpass")
    response = client.post(
        "/api/admin/reset-password",
        json={"email": child_email, "new_password": "newchildpass"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Password reset successfully"

    child_token = login(client, child_email, "newchildpass")
    assert child_token


def test_parent_list_children_and_create_task(client, db):
    admin_id, admin_email = create_user(db, "admin2@example.com", "admin2", "Admin Two", models.UserRole.admin, "adminpass2")
    parent_id, parent_email = create_user(db, "parent@example.com", "parentuser", "Parent User", models.UserRole.parent, "parentpass")
    child_id, child_email = create_user(db, "kid@example.com", "kiduser", "Kid User", models.UserRole.child, "kidpass")

    parent_token = login(client, parent_email, "parentpass")
    child_token = login(client, child_email, "kidpass")

    response = client.get("/api/parent/children", headers=auth_header(parent_token))
    assert response.status_code == 200
    children = response.json()
    assert any(item["email"] == child_email for item in children)

    due_date = datetime.utcnow().replace(microsecond=0).isoformat()
    create_response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Wash dishes",
            "description": "Clean the kitchen after dinner",
            "due_date": due_date,
            "priority": "High",
            "assignee_ids": [child_id],
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


def test_create_rotating_task_requires_two_assignees(client, db):
    parent_id, parent_email = create_user(db, "parent_rot@example.com", "parentrot", "Parent Rot", models.UserRole.parent, "pass123")
    child1_id, child1_email = create_user(db, "child1_rot@example.com", "child1rot", "Child 1 Rot", models.UserRole.child, "pass123")
    child2_id, child2_email = create_user(db, "child2_rot@example.com", "child2rot", "Child 2 Rot", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Rotating chore",
            "task_type": "rotating",
            "assignee_ids": [child1_id],
        },
        headers=auth_header(parent_token),
    )
    assert response.status_code == 400
    assert "at least 2 assignees" in response.json()["detail"]


def test_create_rotating_task_with_two_assignees(client, db):
    parent_id, parent_email = create_user(db, "parent_rot2@example.com", "parentrot2", "Parent Rot2", models.UserRole.parent, "pass123")
    child1_id, child1_email = create_user(db, "child1_rot2@example.com", "child1rot2", "Child 1 Rot2", models.UserRole.child, "pass123")
    child2_id, child2_email = create_user(db, "child2_rot2@example.com", "child2rot2", "Child 2 Rot2", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Rotating chore",
            "task_type": "rotating",
            "assignee_ids": [child1_id, child2_id],
        },
        headers=auth_header(parent_token),
    )
    assert response.status_code == 200
    task = response.json()
    assert task["task_type"] == "rotating"
    assert len(task["assignments"]) == 2
    active_assignments = [a for a in task["assignments"] if a["is_active"]]
    assert len(active_assignments) == 1
    assert active_assignments[0]["child_id"] == child1_id


def test_rotating_task_only_visible_to_active_child(client, db):
    parent_id, parent_email = create_user(db, "parent_rot3@example.com", "parentrot3", "Parent Rot3", models.UserRole.parent, "pass123")
    child1_id, child1_email = create_user(db, "child1_rot3@example.com", "child1rot3", "Child 1 Rot3", models.UserRole.child, "pass123")
    child2_id, child2_email = create_user(db, "child2_rot3@example.com", "child2rot3", "Child 2 Rot3", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")
    child1_token = login(client, child1_email, "pass123")
    child2_token = login(client, child2_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Rotating chore",
            "task_type": "rotating",
            "assignee_ids": [child1_id, child2_id],
        },
        headers=auth_header(parent_token),
    )
    assert response.status_code == 200

    child1_tasks = client.get("/api/child/tasks", headers=auth_header(child1_token)).json()
    child2_tasks = client.get("/api/child/tasks", headers=auth_header(child2_token)).json()

    assert len(child1_tasks) == 1
    assert len(child2_tasks) == 0


def test_recurring_task_creates_occurrences(client, db):
    parent_id, parent_email = create_user(db, "parent_rec@example.com", "parentrec", "Parent Rec", models.UserRole.parent, "pass123")
    child_id, child_email = create_user(db, "child_rec@example.com", "childrec", "Child Rec", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Daily task",
            "task_type": "recurring",
            "recurrence": "daily",
            "assignee_ids": [child_id],
        },
        headers=auth_header(parent_token),
    )
    assert response.status_code == 200
    task = response.json()
    assert task["task_type"] == "recurring"
    assert task["recurrence"] == "daily"
    assert len(task["occurrences"]) > 0


def test_update_occurrence_status(client, db):
    parent_id, parent_email = create_user(db, "parent_occ@example.com", "parentocc", "Parent Occ", models.UserRole.parent, "pass123")
    child_id, child_email = create_user(db, "child_occ@example.com", "childocc", "Child Occ", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")
    child_token = login(client, child_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Daily task",
            "task_type": "recurring",
            "recurrence": "daily",
            "assignee_ids": [child_id],
        },
        headers=auth_header(parent_token),
    )
    task = response.json()
    occurrence_id = task["occurrences"][0]["id"]

    response = client.put(
        f"/api/occurrences/{occurrence_id}/status",
        json={"status": "completed"},
        headers=auth_header(parent_token),
    )
    assert response.status_code == 200

    response = client.get(f"/api/tasks/{task['id']}/occurrences", headers=auth_header(parent_token))
    occurrences = response.json()
    updated_occ = next(o for o in occurrences if o["id"] == occurrence_id)
    assert updated_occ["status"] == "completed"


def test_child_can_complete_occurrence(client, db):
    parent_id, parent_email = create_user(db, "parent_occ2@example.com", "parentocc2", "Parent Occ2", models.UserRole.parent, "pass123")
    child_id, child_email = create_user(db, "child_occ2@example.com", "childocc2", "Child Occ2", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")
    child_token = login(client, child_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Daily task",
            "task_type": "recurring",
            "recurrence": "daily",
            "assignee_ids": [child_id],
        },
        headers=auth_header(parent_token),
    )
    task = response.json()
    occurrence_id = task["occurrences"][0]["id"]

    response = client.post(
        f"/api/occurrences/{occurrence_id}/complete",
        headers=auth_header(child_token),
    )
    assert response.status_code == 200

    response = client.get(f"/api/tasks/{task['id']}/occurrences", headers=auth_header(parent_token))
    occurrences = response.json()
    updated_occ = next(o for o in occurrences if o["id"] == occurrence_id)
    assert updated_occ["status"] == "completed"


def test_update_task(client, db):
    parent_id, parent_email = create_user(db, "parent_upd@example.com", "parentupd", "Parent Upd", models.UserRole.parent, "pass123")
    child_id, child_email = create_user(db, "child_upd@example.com", "childupd", "Child Upd", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Original title",
            "description": "Original description",
            "due_date": (datetime.utcnow() + timedelta(days=1)).isoformat(),
            "priority": "Low",
            "assignee_ids": [child_id],
        },
        headers=auth_header(parent_token),
    )
    task = response.json()

    response = client.put(
        f"/api/parent/tasks/{task['id']}",
        json={
            "title": "Updated title",
            "description": "Updated description",
            "priority": "High",
            "assignee_ids": [child_id],
        },
        headers=auth_header(parent_token),
    )
    assert response.status_code == 200
    updated_task = response.json()
    assert updated_task["title"] == "Updated title"
    assert updated_task["description"] == "Updated description"
    assert updated_task["priority"] == "High"


def test_complete_rotating_task_advances_to_next_child(client, db):
    parent_id, parent_email = create_user(db, "parent_rot4@example.com", "parentrot4", "Parent Rot4", models.UserRole.parent, "pass123")
    child1_id, child1_email = create_user(db, "child1_rot4@example.com", "child1rot4", "Child 1 Rot4", models.UserRole.child, "pass123")
    child2_id, child2_email = create_user(db, "child2_rot4@example.com", "child2rot4", "Child 2 Rot4", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")
    child1_token = login(client, child1_email, "pass123")
    child2_token = login(client, child2_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Rotating chore",
            "task_type": "rotating",
            "assignee_ids": [child1_id, child2_id],
        },
        headers=auth_header(parent_token),
    )
    task = response.json()

    child1_tasks = client.get("/api/child/tasks", headers=auth_header(child1_token)).json()
    assert len(child1_tasks) == 1

    response = client.post(
        f"/api/child/tasks/{task['id']}/complete",
        headers=auth_header(child1_token),
    )
    assert response.status_code == 200

    child1_tasks = client.get("/api/child/tasks", headers=auth_header(child1_token)).json()
    child2_tasks = client.get("/api/child/tasks", headers=auth_header(child2_token)).json()
    assert len(child1_tasks) == 0
    assert len(child2_tasks) == 1


def test_status_log_shows_user_name(client, db):
    parent_id, parent_email = create_user(db, "parent_log@example.com", "parentlog", "Parent Log", models.UserRole.parent, "pass123")
    child_id, child_email = create_user(db, "child_log@example.com", "childlog", "Child Log", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Task for logging",
            "due_date": (datetime.utcnow() + timedelta(days=1)).isoformat(),
            "assignee_ids": [child_id],
        },
        headers=auth_header(parent_token),
    )
    task = response.json()

    response = client.get(
        f"/api/parent/tasks/{task['id']}/log",
        headers=auth_header(parent_token),
    )
    assert response.status_code == 200
    logs = response.json()
    assert len(logs) > 0
    assert logs[0]["changed_by"] == parent_id


def test_advance_rotating_task(client, db):
    parent_id, parent_email = create_user(db, "parent_adv@example.com", "parentadv", "Parent Adv", models.UserRole.parent, "pass123")
    child1_id, child1_email = create_user(db, "child1_adv@example.com", "child1adv", "Child 1 Adv", models.UserRole.child, "pass123")
    child2_id, child2_email = create_user(db, "child2_adv@example.com", "child2adv", "Child 2 Adv", models.UserRole.child, "pass123")

    parent_token = login(client, parent_email, "pass123")

    response = client.post(
        "/api/parent/tasks",
        json={
            "title": "Rotating chore",
            "task_type": "rotating",
            "assignee_ids": [child1_id, child2_id],
        },
        headers=auth_header(parent_token),
    )
    task = response.json()

    response = client.post(
        f"/api/parent/tasks/{task['id']}/advance",
        headers=auth_header(parent_token),
    )
    assert response.status_code == 200
    updated_task = response.json()

    active_assignments = [a for a in updated_task["assignments"] if a["is_active"]]
    assert len(active_assignments) == 1
    assert active_assignments[0]["child_id"] == child2_id
