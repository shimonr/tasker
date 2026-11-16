from app import auth, crud, mailer, models
from conftest import PASSWORD, login, make_user


def signup(client, email="maria@example.com", **fields):
    body = {"family_name": "Rivera", "full_name": "Maria", "email": email, "password": "long-enough", **fields}
    return client.post("/api/auth/signup", json=body)


def link_token(sent_emails, email: str) -> str:
    return next(args[2] for name, args in reversed(sent_emails) if name == "send_verification" and args[0] == email)


def verify(client, token: str):
    return client.post("/api/auth/verify-email", json={"token": token})


def test_new_accounts_must_confirm_before_signing_in(client, sent_emails):
    assert signup(client).status_code == 200
    rejected = client.post("/api/token", data={"username": "maria@example.com", "password": "long-enough"})
    assert rejected.status_code == 403
    assert rejected.json()["detail"] == "Please confirm your email first. Check your inbox for the link."
    # A wrong password still gets the ordinary answer, so the message does not reveal anything extra.
    assert client.post("/api/token", data={"username": "maria@example.com", "password": "nope-nope"}).status_code == 401


def test_confirming_the_link_activates_the_account_once(client, sent_emails):
    signup(client)
    token = link_token(sent_emails, "maria@example.com")
    sent_emails.clear()
    response = verify(client, token)
    assert response.json() == {"message": "Your email is confirmed. You can sign in now."}
    assert sent_emails == [("send_welcome", ("maria@example.com", "Maria", "parent"))]
    login(client, "maria@example.com", "long-enough")
    # The same link works again but does not send a second welcome email.
    assert verify(client, token).status_code == 200
    assert len(sent_emails) == 1


def test_bad_or_stale_links_are_rejected(client, db, sent_emails):
    signup(client)
    token = link_token(sent_emails, "maria@example.com")
    assert verify(client, "not-a-token").status_code == 400
    access = auth.create_access_token(1, "parent", 0)
    assert verify(client, access).status_code == 400  # an access token is not a verification link
    ghost = auth.create_verify_token(9999, 0)
    assert verify(client, ghost).status_code == 400
    maria = crud.get_user_by_email(db, "maria@example.com")
    crud.set_password(db, maria, "changed-pass-1")  # bumps the token version, so old links stop working
    assert verify(client, token).status_code == 400


def test_joining_families_also_needs_confirmation(client, db, sent_emails):
    signup(client)
    maria_token = link_token(sent_emails, "maria@example.com")
    verify(client, maria_token)
    headers = login(client, "maria@example.com", "long-enough")
    code = client.get("/api/family", headers=headers).json()["invite_code"]
    response = client.post(
        "/api/auth/join",
        json={"invite_code": code, "role": "child", "full_name": "Ted", "email": "ted@example.com", "password": "long-enough"},
    )
    assert response.json() == {"message": "We sent a link to ted@example.com. Open it to finish signing up."}
    assert client.post("/api/token", data={"username": "ted@example.com", "password": "long-enough"}).status_code == 403
    assert verify(client, link_token(sent_emails, "ted@example.com")).status_code == 200
    assert login(client, "ted@example.com", "long-enough")


def test_resend_only_helps_accounts_that_still_need_confirming(client, db, sent_emails):
    make_user(db, "done", models.UserRole.parent)  # confirmed accounts never get a new link
    generic = "If that account needs confirming, a new link is on its way."
    assert client.post("/api/auth/resend-verification", json={"email": "done@example.com"}).json() == {"message": generic}
    assert client.post("/api/auth/resend-verification", json={"email": "nobody@example.com"}).json() == {"message": generic}
    assert sent_emails == []

    signup(client)
    sent_emails.clear()
    assert client.post("/api/auth/resend-verification", json={"email": "maria@example.com"}).json() == {"message": generic}
    assert [name for name, _ in sent_emails] == ["send_verification"]
    for _ in range(4):
        client.post("/api/auth/resend-verification", json={"email": "maria@example.com"})
    assert len(sent_emails) == 5  # the sixth request within the hour is not sent
    assert client.post("/api/auth/resend-verification", json={"email": "maria@example.com"}).json() == {"message": generic}
    assert len(sent_emails) == 5


def test_resetting_the_password_also_confirms_the_email(client, db):
    maria = crud.add_user(
        db, email="maria@example.com", username="maria", full_name="Maria", password=PASSWORD, role=models.UserRole.parent, email_verified=False
    )
    reset = auth.create_reset_token(maria.id, maria.token_version)
    assert client.post("/api/auth/reset-password", json={"token": reset, "new_password": "fresh-pass-2"}).status_code == 200
    login(client, "maria", "fresh-pass-2")


def test_verification_email_links_to_the_app(monkeypatch):
    calls = []

    class Accepted:
        status_code = 201

        def raise_for_status(self):
            pass

    monkeypatch.setattr(mailer.httpx, "post", lambda url, json, headers, timeout: calls.append(json) or Accepted())
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setenv("EMAIL_SENDER_ADDRESS", "hello@family.example")
    monkeypatch.setenv("APP_BASE_URL", "https://shimonr.com/tasker")
    assert mailer.send_verification("maria@example.com", "Maria", "tok123") is True
    [mail] = calls
    assert mail["subject"] == "Confirm your email for Family Task Adventure ✉️"
    assert "https://shimonr.com/tasker/verify-email?token=tok123" in mail["textContent"]


# ---------------------------------------------------------------- change my password


def test_signed_in_users_can_change_their_password(client, db):
    make_user(db, "boss", models.UserRole.admin)
    headers = login(client, "boss")
    wrong = client.post("/api/me/password", json={"current_password": "not-it-12", "new_password": "brand-new-1"}, headers=headers)
    assert wrong.status_code == 400 and wrong.json()["detail"] == "Your current password is not right."
    assert client.post("/api/me/password", json={"current_password": PASSWORD, "new_password": "short"}, headers=headers).status_code == 422

    changed = client.post("/api/me/password", json={"current_password": PASSWORD, "new_password": "brand-new-1"}, headers=headers)
    assert changed.status_code == 200
    # The old session is gone, but the new token keeps this browser signed in.
    assert client.get("/api/me", headers=headers).status_code == 401
    assert client.get("/api/me", headers={"Authorization": f"Bearer {changed.json()['access_token']}"}).status_code == 200
    login(client, "boss", "brand-new-1")


def test_password_change_needs_a_signed_in_user(client):
    assert client.post("/api/me/password", json={"current_password": PASSWORD, "new_password": "brand-new-1"}).status_code == 401
