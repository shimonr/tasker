from datetime import timedelta

from app import models
from app.timeutil import utcnow
from conftest import login, make_user


def add_reward(client, family, **fields):
    body = {"name": "Movie night", "emoji": "🎬", "cost": 2, **fields}
    response = client.post("/api/parent/rewards", json=body, headers=family["parent_h"])
    assert response.status_code == 200, response.text
    return response.json()


def give_stars(db, child_id: int, count: int, days_ago: int = 0) -> None:
    when = utcnow() - timedelta(days=days_ago)
    for _ in range(count):
        db.add(models.CompletionEvent(child_id=child_id, task_title="chore", stars=1, completed_at=when))
    db.commit()


def badges(client, headers) -> dict[str, bool]:
    return {b["key"]: b["earned"] for b in client.get("/api/child/stats", headers=headers).json()["badges"]}


# ---------------------------------------------------------------- parent manages rewards


def test_parent_creates_updates_and_deletes_rewards(client, family):
    reward = add_reward(client, family)
    assert reward == {"id": reward["id"], "name": "Movie night", "emoji": "🎬", "cost": 2, "active": True}
    updated = client.put(
        f"/api/parent/rewards/{reward['id']}", json={"cost": 5, "active": False, "emoji": None}, headers=family["parent_h"]
    ).json()
    assert (updated["cost"], updated["active"], updated["emoji"], updated["name"]) == (5, False, None, "Movie night")
    renamed = client.put(f"/api/parent/rewards/{reward['id']}", json={"name": "Pizza"}, headers=family["parent_h"]).json()
    assert renamed["name"] == "Pizza"
    assert [r["id"] for r in client.get("/api/parent/rewards", headers=family["parent_h"]).json()] == [reward["id"]]
    assert client.delete(f"/api/parent/rewards/{reward['id']}", headers=family["parent_h"]).json() == {"message": "Reward deleted"}
    assert client.get("/api/parent/rewards", headers=family["parent_h"]).json() == []


def test_reward_validation(client, family):
    for body in ({"name": "", "cost": 2}, {"name": "x", "cost": 0}, {"name": "x", "cost": 10001}, {"name": "x"}):
        assert client.post("/api/parent/rewards", json=body, headers=family["parent_h"]).status_code == 422
    reward = add_reward(client, family)
    assert client.put(f"/api/parent/rewards/{reward['id']}", json={"name": ""}, headers=family["parent_h"]).status_code == 422
    assert client.put(f"/api/parent/rewards/{reward['id']}", json={"cost": 0}, headers=family["parent_h"]).status_code == 422


def test_other_families_cannot_change_or_delete_rewards(client, db, family):
    reward = add_reward(client, family)
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    assert client.put(f"/api/parent/rewards/{reward['id']}", json={"cost": 1}, headers=lee_h).status_code == 404
    assert client.delete(f"/api/parent/rewards/{reward['id']}", headers=lee_h).status_code == 404
    assert client.get("/api/parent/rewards", headers=lee_h).json() == []


# ---------------------------------------------------------------- kids spend stars


def test_kid_sees_only_active_rewards_from_their_family(client, db, family):
    add_reward(client, family, name="Shown", cost=1)
    hidden = add_reward(client, family, name="Hidden", cost=1)
    client.put(f"/api/parent/rewards/{hidden['id']}", json={"active": False}, headers=family["parent_h"])
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    client.post("/api/parent/rewards", json={"name": "Elsewhere", "cost": 1}, headers=lee_h)
    names = [r["name"] for r in client.get("/api/child/rewards", headers=family["kid_h"][0]).json()]
    assert names == ["Shown"]


def test_redeeming_spends_stars_and_is_checked_against_the_balance(client, db, family):
    ann = family["kids"][0]
    movie = add_reward(client, family, name="Movie", cost=2)
    headers = family["kid_h"][0]
    assert client.post(f"/api/child/rewards/{movie['id']}/redeem", headers=headers).json()["detail"] == "Not enough stars yet"
    give_stars(db, ann, 3)
    redemption = client.post(f"/api/child/rewards/{movie['id']}/redeem", headers=headers).json()
    assert (redemption["reward_name"], redemption["cost"], redemption["status"], redemption["child_name"]) == ("Movie", 2, "requested", "Ann")
    stats = client.get("/api/child/stats", headers=headers).json()
    assert (stats["stars"], stats["spent"], stats["balance"]) == (3, 2, 1)
    assert client.post(f"/api/child/rewards/{movie['id']}/redeem", headers=headers).status_code == 400
    assert [r["id"] for r in client.get("/api/child/redemptions", headers=headers).json()] == [redemption["id"]]


def test_redeeming_unknown_inactive_or_foreign_rewards_is_not_found(client, db, family):
    give_stars(db, family["kids"][0], 10)
    headers = family["kid_h"][0]
    assert client.post("/api/child/rewards/9999/redeem", headers=headers).status_code == 404
    inactive = add_reward(client, family, name="Old", cost=1, active=False)
    client.put(f"/api/parent/rewards/{inactive['id']}", json={"active": False}, headers=family["parent_h"])
    assert client.post(f"/api/child/rewards/{inactive['id']}/redeem", headers=headers).status_code == 404
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    lee_reward = client.post("/api/parent/rewards", json={"name": "Lee's", "cost": 1}, headers=lee_h).json()
    assert client.post(f"/api/child/rewards/{lee_reward['id']}/redeem", headers=headers).status_code == 404


def test_parent_fulfills_redemptions_from_their_family(client, db, family):
    give_stars(db, family["kids"][0], 5)
    movie = add_reward(client, family, cost=2)
    redemption = client.post(f"/api/child/rewards/{movie['id']}/redeem", headers=family["kid_h"][0]).json()
    listed = client.get("/api/parent/redemptions", headers=family["parent_h"]).json()
    assert [(r["child_name"], r["status"]) for r in listed] == [("Ann", "requested")]
    fulfilled = client.post(f"/api/parent/redemptions/{redemption['id']}/fulfill", headers=family["parent_h"]).json()
    assert fulfilled["status"] == "fulfilled" and fulfilled["fulfilled_at"]
    again = client.post(f"/api/parent/redemptions/{redemption['id']}/fulfill", headers=family["parent_h"]).json()
    assert again["fulfilled_at"] == fulfilled["fulfilled_at"]
    assert client.post("/api/parent/redemptions/9999/fulfill", headers=family["parent_h"]).status_code == 404
    make_user(db, "lee", models.UserRole.parent)
    lee_h = login(client, "lee")
    assert client.get("/api/parent/redemptions", headers=lee_h).json() == []
    assert client.post(f"/api/parent/redemptions/{redemption['id']}/fulfill", headers=lee_h).status_code == 404


def test_redemption_keeps_its_name_after_the_reward_is_deleted(client, db, family):
    give_stars(db, family["kids"][0], 5)
    movie = add_reward(client, family, name="Movie", cost=2)
    client.post(f"/api/child/rewards/{movie['id']}/redeem", headers=family["kid_h"][0])
    client.delete(f"/api/parent/rewards/{movie['id']}", headers=family["parent_h"])
    [kept] = client.get("/api/child/redemptions", headers=family["kid_h"][0]).json()
    assert kept["reward_name"] == "Movie" and kept["cost"] == 2


def test_parent_sees_kids_balance_on_the_leaderboard(client, db, family):
    give_stars(db, family["kids"][0], 4)
    movie = add_reward(client, family, cost=3)
    client.post(f"/api/child/rewards/{movie['id']}/redeem", headers=family["kid_h"][0])
    ann = client.get("/api/parent/tasks/stats", headers=family["parent_h"]).json()["children"][0]
    assert (ann["name"], ann["stars"], ann["spent"], ann["balance"]) == ("Ann", 4, 3, 1)


# ---------------------------------------------------------------- badges


def test_badges_are_earned_from_completions_streaks_and_stars(client, db, family):
    ann = family["kids"][0]
    headers = family["kid_h"][0]
    assert badges(client, headers) == {
        "first_task": False,
        "streak_3": False,
        "streak_7": False,
        "stars_10": False,
        "stars_50": False,
        "tasks_25": False,
    }
    give_stars(db, ann, 1)
    assert badges(client, headers)["first_task"] is True
    for days_ago in (1, 2):
        give_stars(db, ann, 1, days_ago=days_ago)
    assert badges(client, headers)["streak_3"] is True
    assert badges(client, headers)["streak_7"] is False
    for days_ago in (3, 4, 5, 6):
        give_stars(db, ann, 1, days_ago=days_ago)
    assert badges(client, headers)["streak_7"] is True
    give_stars(db, ann, 5)  # 12 stars and 12 chores in total
    earned = badges(client, headers)
    assert earned["stars_10"] is True
    assert earned["stars_50"] is False and earned["tasks_25"] is False
    give_stars(db, ann, 40)  # 52 stars and 52 chores in total
    earned = badges(client, headers)
    assert earned["stars_50"] is True and earned["tasks_25"] is True
