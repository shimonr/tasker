import logging

import pytest

from app import crud, main, models
from conftest import PASSWORD, login, make_user


def bearer(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def signup(client, **fields):
    body = {"family_name": "Rivera", "full_name": "Maria", "email": "maria@example.com", "password": "long-enough", **fields}
    return client.post("/api/auth/signup", json=body)


def invite_code_of(client, headers) -> str:
    return client.get("/api/family", headers=headers).json()["invite_code"]


def join(client, code, **fields):
    body = {"invite_code": code, "role": "child", "full_name": "Ted", "email": "ted@example.com", "password": "long-enough", **fields}
    return client.post("/api/auth/join", json=body)


@pytest.fixture()
def admin_h(db, client):
    make_user(db, "boss", models.UserRole.admin)
    return login(client, "boss")


# ---------------------------------------------------------------- signup and join


def test_signup_creates_a_family_and_its_first_parent(client, sent_emails):
    response = signup(client, username="maria")
    assert response.status_code == 200, response.text
    headers = bearer(response)
    me = client.get("/api/me", headers=headers).json()
    assert (me["role"], me["family_name"], me["username"]) == ("parent", "Rivera", "maria")
    family = client.get("/api/family", headers=headers).json()
    assert family["name"] == "Rivera" and family["invite_code"]
    assert [m["email"] for m in family["members"]] == ["maria@example.com"]
    assert sent_emails == [("send_welcome", ("maria@example.com", "Maria", "parent"))]


def test_signup_rejects_taken_identities_and_bad_input(client, db):
    make_user(db, "taken", models.UserRole.parent)
    assert signup(client, email="taken@example.com").status_code == 400
    assert signup(client, username="TAKEN").status_code == 400
    assert signup(client, family_name="").status_code == 422
    assert signup(client, full_name="   ").status_code == 422
    assert signup(client, password="short").status_code == 422


def test_signup_is_rate_limited_for_the_whole_app(client):
    for index in range(10):
        assert signup(client, email=f"parent{index}@example.com").status_code == 200
    assert signup(client, email="late@example.com").status_code == 429


def test_join_adds_kids_and_parents_to_the_family(client):
    headers = bearer(signup(client))
    code = invite_code_of(client, headers)
    kid = join(client, code)
    assert kid.status_code == 200, kid.text
    kid_me = client.get("/api/me", headers=bearer(kid)).json()
    assert (kid_me["role"], kid_me["family_name"]) == ("child", "Rivera")
    dad = join(client, code, role="parent", email="dad@example.com", full_name="Dad")
    assert dad.status_code == 200
    members = {m["full_name"] for m in client.get("/api/family", headers=headers).json()["members"]}
    assert members == {"Maria", "Ted", "Dad"}


def test_join_rejects_unknown_codes_taken_identities_and_blank_codes(client, db):
    headers = bearer(signup(client))
    bad = join(client, "no-such-code")
    assert bad.status_code == 400 and bad.json()["detail"] == "This invite code is not valid."
    assert join(client, "   ").status_code == 422
    make_user(db, "ted", models.UserRole.child)  # ted@example.com is taken
    assert join(client, invite_code_of(client, headers)).status_code == 400


def test_regenerated_invite_code_replaces_the_old_one_and_only_parents_can_do_it(client, family):
    old = invite_code_of(client, family["parent_h"])
    new = client.post("/api/family/invite-code", headers=family["parent_h"]).json()["invite_code"]
    assert new != old
    assert join(client, old, email="old@example.com").status_code == 400
    assert join(client, new, email="new@example.com").status_code == 200
    assert client.post("/api/family/invite-code", headers=family["kid_h"][0]).status_code == 403
    assert client.get("/api/family", headers=family["kid_h"][0]).status_code == 403


def test_profile_updates_avatar_colour_and_name(client, family):
    kid = client.put(
        "/api/me/profile",
        json={"avatar": "🦖", "color": "#22C55E", "full_name": "Ann Smith"},
        headers=family["kid_h"][0],
    ).json()
    assert (kid["avatar"], kid["color"], kid["full_name"]) == ("🦖", "#22C55E", "Ann Smith")
    cleared = client.put("/api/me/profile", json={"full_name": "   "}, headers=family["kid_h"][0]).json()
    assert cleared["full_name"] is None
    assert client.put("/api/me/profile", json={"color": "green"}, headers=family["kid_h"][0]).status_code == 422
    assert client.put("/api/me/profile", json={"avatar": "toolongavatar!"}, headers=family["kid_h"][0]).status_code == 422


# ---------------------------------------------------------------- parents manage kids and families


def test_parent_adds_a_child_to_their_own_family(client, family, sent_emails):
    response = client.post(
        "/api/parent/children",
        json={"full_name": "Dana", "email": "dana@example.com", "password": "long-enough", "avatar": "🐱", "color": "#F59E0B"},
        headers=family["parent_h"],
    )
    assert response.status_code == 200, response.text
    dana = response.json()
    assert (dana["role"], dana["family_id"], dana["avatar"], dana["color"]) == ("child", family["family_id"], "🐱", "#F59E0B")
    names = [c["full_name"] for c in client.get("/api/parent/children", headers=family["parent_h"]).json()]
    assert "Dana" in names
    duplicate = client.post(
        "/api/parent/children",
        json={"email": "dana@example.com", "password": "long-enough"},
        headers=family["parent_h"],
    )
    assert duplicate.status_code == 400
    assert sent_emails[-1] == ("send_welcome", ("dana@example.com", "Dana", "child"))
    login(client, "dana@example.com", "long-enough")


def test_families_are_isolated_from_each_other(client, db, family):
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    assert client.get("/api/parent/children", headers=lee_h).json() == []
    assert client.get("/api/parent/tasks", headers=lee_h).json() == []
    stranger = {"title": "Dishes", "assignee_ids": family["kids"][:1]}
    assert client.post("/api/parent/tasks", json=stranger, headers=lee_h).status_code == 400


def test_parents_in_one_family_share_and_manage_tasks(client, db, family):
    make_user(db, "dad", models.UserRole.parent, family_id=family["family_id"])
    dad_h = login(client, "dad")
    task = client.post("/api/parent/tasks", json={"title": "Dishes", "assignee_ids": family["kids"][:1]}, headers=family["parent_h"]).json()
    assert [t["id"] for t in client.get("/api/parent/tasks", headers=dad_h).json()] == [task["id"]]
    assert client.put(f"/api/parent/tasks/{task['id']}", json={"title": "Dishes!"}, headers=dad_h).status_code == 200
    assert client.get(f"/api/parent/tasks/{task['id']}/log", headers=dad_h).status_code == 200


# ---------------------------------------------------------------- admin


def test_admin_parent_without_a_family_gets_a_new_one(client, admin_h):
    created = client.post(
        "/api/admin/users",
        json={"email": "mom@example.com", "full_name": "Mom Lee", "role": "parent", "password": "long-enough"},
        headers=admin_h,
    ).json()
    assert created["family_name"] == "Mom Lee's family"
    assert client.get("/api/admin/families", headers=admin_h).json() == [
        {"id": created["family_id"], "name": "Mom Lee's family", "member_count": 1}
    ]
    no_name = client.post("/api/admin/users", json={"email": "anon@example.com", "role": "parent", "password": "long-enough"}, headers=admin_h).json()
    assert no_name["family_name"] == "anon@example.com's family"


def test_admin_family_rules_for_each_role(client, admin_h, family):
    base = {"email": "x@example.com", "role": "child", "password": "long-enough"}
    assert client.post("/api/admin/users", json=base, headers=admin_h).json()["detail"] == "Children need a family"
    missing = client.post("/api/admin/users", json={**base, "family_id": 9999}, headers=admin_h)
    assert missing.json()["detail"] == "Family not found"
    admin_in_family = {"email": "boss2@example.com", "role": "admin", "password": "long-enough", "family_id": family["family_id"]}
    assert client.post("/api/admin/users", json=admin_in_family, headers=admin_h).json()["detail"] == "Admins do not belong to a family"
    kid = client.post("/api/admin/users", json={**base, "family_id": family["family_id"]}, headers=admin_h)
    assert (kid.status_code, kid.json()["family_name"]) == (200, "Smiths")
    boss = client.post("/api/admin/users", json={"email": "boss2@example.com", "role": "admin", "password": "long-enough"}, headers=admin_h)
    assert boss.json()["family_id"] is None
    parent = client.post(
        "/api/admin/users",
        json={"email": "p@example.com", "role": "parent", "password": "long-enough", "family_id": family["family_id"]},
        headers=admin_h,
    )
    assert parent.json()["family_name"] == "Smiths"
    listed = {u["email"]: u["family_name"] for u in client.get("/api/admin/users", headers=admin_h).json()}
    assert listed["ann@example.com"] == "Smiths" and listed["boss2@example.com"] is None


def test_admin_password_from_env_is_applied_only_when_it_changes(client, db, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "first-pass-1")
    main.create_default_admin(db)
    login(client, "admin", "first-pass-1")
    # The owner changes the password in the app. A redeploy with the same env value must keep it.
    crud.set_password(db, crud.get_user_by_username(db, "admin"), "in-app-pass-2")
    main.create_default_admin(db)
    login(client, "admin", "in-app-pass-2")
    # A new ADMIN_PASSWORD value is applied as a break-glass reset.
    monkeypatch.setenv("ADMIN_PASSWORD", "third-pass-3")
    main.create_default_admin(db)
    login(client, "admin", "third-pass-3")


def test_existing_admin_is_found_by_username_when_the_email_changes(db, monkeypatch):
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    make_user(db, "admin", models.UserRole.admin)  # admin@example.com
    monkeypatch.setenv("ADMIN_EMAIL", "shimonro@hotmail.com")
    main.create_default_admin(db)
    assert crud.get_user_by_username(db, "admin").email == "shimonro@hotmail.com"
    assert db.query(models.User).count() == 1


def test_first_start_without_admin_password_generates_one(db, monkeypatch, caplog):
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    with caplog.at_level(logging.WARNING, logger="tasker"):
        main.create_default_admin(db)
    assert "generated password" in caplog.text
    assert db.query(models.User).filter(models.User.role == models.UserRole.admin).count() == 1


def test_startup_without_an_admin_password_keeps_an_existing_admin(db, monkeypatch):
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    make_user(db, "boss", models.UserRole.admin)
    monkeypatch.setenv("ADMIN_EMAIL", "someone@example.com")
    main.create_default_admin(db)
    assert db.query(models.User).count() == 1


def test_users_created_before_families_get_one_on_startup(db):
    make_user(db, "boss", models.UserRole.admin)
    orphan = crud.add_user(db, email="old@example.com", username="old", full_name="Old Parent", password=PASSWORD, role=models.UserRole.parent)
    crud.assign_orphan_families(db)
    db.refresh(orphan)
    assert orphan.family.name == "Old Parent's family" and orphan.family.invite_code
    assert crud.get_user_by_username(db, "boss").family_id is None
    crud.assign_orphan_families(db)  # nothing left to fix
    assert crud.get_user_by_username(db, "boss").family_id is None
