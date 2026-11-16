from app import models
from conftest import make_user, login


def make_task(client, family, **fields):
    body = {"title": "Dishes", "priority": "High", "assignee_ids": family["kids"][:1], "requires_approval": True, **fields}
    response = client.post("/api/parent/tasks", json=body, headers=family["parent_h"])
    assert response.status_code == 200, response.text
    return response.json()


def stars(client, headers) -> int:
    return client.get("/api/child/stats", headers=headers).json()["stars"]


def test_task_remembers_whether_it_needs_approval(client, family):
    plain = make_task(client, family, requires_approval=False)
    approved = make_task(client, family, title="Bed")
    assert (plain["requires_approval"], approved["requires_approval"]) == (False, True)
    default = client.post("/api/parent/tasks", json={"title": "Toys", "assignee_ids": family["kids"][:1]}, headers=family["parent_h"]).json()
    assert default["requires_approval"] is False
    updated = client.put(f"/api/parent/tasks/{plain['id']}", json={"requires_approval": True}, headers=family["parent_h"]).json()
    assert updated["requires_approval"] is True


def test_child_completion_waits_for_parent_and_emails_them(client, family, sent_emails):
    task = make_task(client, family)
    sent_emails.clear()
    response = client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    assert response.json() == {"message": "Sent to your parent to approve"}
    assert stars(client, family["kid_h"][0]) == 0
    assert sent_emails == [("send_approval_request", ("parent@example.com", "Mom", "Ann", "Dishes"))]
    listed = client.get("/api/child/tasks", headers=family["kid_h"][0]).json()[0]
    assert listed["assignments"][0]["awaiting_approval"] is True
    again = client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    assert again.json() == {"message": "Already waiting for your parent to approve"}
    assert len(sent_emails) == 1


def test_parent_approval_awards_stars_and_completes_the_task(client, family, sent_emails):
    task = make_task(client, family)
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    sent_emails.clear()
    approved = client.post(f"/api/parent/tasks/{task['id']}/approve", json={"child_id": family["kids"][0]}, headers=family["parent_h"])
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "completed"
    assert approved.json()["assignments"][0]["awaiting_approval"] is False
    assert stars(client, family["kid_h"][0]) == 3
    assert sent_emails == []  # the parent made the decision, so they are not emailed about it
    assert client.post(f"/api/parent/tasks/{task['id']}/approve", json={"child_id": family["kids"][0]}, headers=family["parent_h"]).status_code == 400


def test_rejecting_sends_the_task_back_without_stars(client, family):
    task = make_task(client, family)
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    rejected = client.post(f"/api/parent/tasks/{task['id']}/reject", json={"child_id": family["kids"][0]}, headers=family["parent_h"]).json()
    assert rejected["assignments"][0]["awaiting_approval"] is False
    assert rejected["status"] == "pending"
    assert stars(client, family["kid_h"][0]) == 0
    assert client.post(f"/api/parent/tasks/{task['id']}/reject", json={"child_id": family["kids"][0]}, headers=family["parent_h"]).status_code == 400
    # The child can try again after a rejection.
    assert client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0]).json()["message"].startswith("Sent")


def test_approval_needs_a_child_who_is_waiting_and_a_task_in_your_family(client, db, family):
    task = make_task(client, family, assignee_ids=family["kids"][:2])
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    unknown_child = client.post(f"/api/parent/tasks/{task['id']}/approve", json={"child_id": family["kids"][1]}, headers=family["parent_h"])
    assert unknown_child.status_code == 400
    assert client.post(f"/api/parent/tasks/{task['id']}/reject", json={"child_id": family["kids"][1]}, headers=family["parent_h"]).status_code == 400
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    assert client.post(f"/api/parent/tasks/{task['id']}/approve", json={"child_id": family["kids"][0]}, headers=lee_h).status_code == 404
    assert client.post(f"/api/parent/tasks/{task['id']}/reject", json={"child_id": family["kids"][0]}, headers=lee_h).status_code == 404


def test_approving_a_rotating_turn_passes_it_to_the_next_child(client, family, sent_emails):
    ann, ben = family["kids"][:2]
    task = make_task(client, family, task_type="rotating", assignee_ids=[ann, ben], title="Trash")
    assert client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][1]).status_code == 400
    client.post(f"/api/child/tasks/{task['id']}/complete", headers=family["kid_h"][0])
    sent_emails.clear()
    approved = client.post(f"/api/parent/tasks/{task['id']}/approve", json={"child_id": ann}, headers=family["parent_h"]).json()
    active = [a["child_id"] for a in approved["assignments"] if a["is_active"]]
    assert active == [ben]
    assert sent_emails == [("send_task_assigned", ("ben@example.com", "Ben", "Trash", "Mom", True))]
    assert stars(client, family["kid_h"][0]) == 3


def test_recurring_occurrence_waits_for_approval(client, family, sent_emails):
    task = make_task(client, family, task_type="recurring", recurrence="daily", title="Make bed", due_date=None)
    occurrence_id = task["occurrences"][0]["id"]
    sent_emails.clear()
    waiting = client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0]).json()
    assert (waiting["status"], waiting["awaiting_approval"], waiting["completed_by"]) == ("pending", True, family["kids"][0])
    assert [e[0] for e in sent_emails] == ["send_approval_request"]
    again = client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0]).json()
    assert again["awaiting_approval"] is True
    assert len(sent_emails) == 1

    approved = client.post(f"/api/parent/occurrences/{occurrence_id}/approve", headers=family["parent_h"]).json()
    assert (approved["status"], approved["awaiting_approval"], approved["completed_by"]) == ("completed", False, family["kids"][0])
    assert stars(client, family["kid_h"][0]) == 3
    assert client.post(f"/api/parent/occurrences/{occurrence_id}/approve", headers=family["parent_h"]).status_code == 400
    # Completing it again after approval changes nothing.
    done = client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0]).json()
    assert done["status"] == "completed" and done["awaiting_approval"] is False
    assert stars(client, family["kid_h"][0]) == 3


def test_rejected_occurrence_can_be_completed_again(client, family):
    task = make_task(client, family, task_type="recurring", recurrence="daily", title="Feed cat")
    occurrence_id = task["occurrences"][0]["id"]
    client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0])
    rejected = client.post(f"/api/parent/occurrences/{occurrence_id}/reject", headers=family["parent_h"]).json()
    assert (rejected["awaiting_approval"], rejected["completed_by"]) == (False, None)
    assert client.post(f"/api/parent/occurrences/{occurrence_id}/reject", headers=family["parent_h"]).status_code == 400
    assert client.post(f"/api/parent/occurrences/{occurrence_id}/approve", headers=family["parent_h"]).status_code == 400
    assert client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0]).json()["awaiting_approval"] is True


def test_occurrence_approvals_are_limited_to_the_family(client, db, family):
    task = make_task(client, family, task_type="recurring", recurrence="daily")
    occurrence_id = task["occurrences"][0]["id"]
    client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0])
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    assert client.post(f"/api/parent/occurrences/{occurrence_id}/approve", headers=lee_h).status_code == 404
    assert client.post(f"/api/parent/occurrences/{occurrence_id}/reject", headers=lee_h).status_code == 404
    assert client.post("/api/parent/occurrences/9999/approve", headers=family["parent_h"]).status_code == 404
    assert client.post("/api/occurrences/9999/complete", headers=family["kid_h"][0]).status_code == 404


def test_occurrence_completion_for_a_kid_not_on_the_task_is_hidden(client, family):
    task = make_task(client, family, task_type="recurring", recurrence="daily")
    occurrence_id = task["occurrences"][0]["id"]
    assert client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][2]).status_code == 404


def test_parent_can_mark_an_awaiting_occurrence_done_directly(client, family):
    task = make_task(client, family, task_type="recurring", recurrence="daily")
    occurrence_id = task["occurrences"][0]["id"]
    client.post(f"/api/occurrences/{occurrence_id}/complete", headers=family["kid_h"][0])
    set_done = client.put(f"/api/occurrences/{occurrence_id}/status", json={"status": "completed"}, headers=family["parent_h"]).json()
    assert set_done["awaiting_approval"] is False and set_done["status"] == "completed"
