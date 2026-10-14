"""Transactional email through Brevo (https://developers.brevo.com/reference/sendtransacemail).

Configuration (environment):
  BREVO_API_KEY             Brevo API key. Without it emails are logged and skipped.
  EMAIL_SENDER_ADDRESS      A sender address verified in Brevo (required with an API key).
  EMAIL_SENDER_NAME         Display name, default "Family Task Adventure".
  EMAIL_OVERRIDE_RECIPIENT  Send every email here instead (use on QA so real users get nothing).
  APP_BASE_URL              Public URL of the frontend, used for links in emails.
"""

import html
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("tasker.mailer")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def app_base_url() -> str:
    return os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")


def _render_html(heading: str, paragraphs: list[str], cta_label: str, cta_url: str) -> str:
    body = "".join(f'<p style="margin:0 0 14px;font-size:16px;line-height:1.5">{html.escape(p)}</p>' for p in paragraphs)
    return (
        '<div style="background:#fff7d6;padding:24px;font-family:Fredoka,Nunito,Arial,sans-serif;color:#3b0764">'
        '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:24px;padding:28px;'
        'border:4px solid #f472b6">'
        f'<h1 style="margin:0 0 16px;font-size:26px;color:#7c3aed">{html.escape(heading)}</h1>{body}'
        f'<a href="{html.escape(cta_url, quote=True)}" style="display:inline-block;margin-top:8px;background:#7c3aed;'
        f'color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">{html.escape(cta_label)}</a>'
        '<p style="margin:24px 0 0;font-size:13px;color:#9d174d">Family Task Adventure 🌈</p>'
        "</div></div>"
    )


def send_email(to_email: str, to_name: Optional[str], subject: str, heading: str, paragraphs: list[str], cta_label: str, cta_url: str, tag: str) -> bool:
    api_key = os.getenv("BREVO_API_KEY")
    sender = os.getenv("EMAIL_SENDER_ADDRESS")
    if not api_key or not sender:
        logger.info("Email skipped (BREVO_API_KEY or EMAIL_SENDER_ADDRESS not set): %r to %s", subject, to_email)
        return False
    override = os.getenv("EMAIL_OVERRIDE_RECIPIENT")
    if override:
        subject = f"[for {to_email}] {subject}"
    payload = {
        "sender": {"email": sender, "name": os.getenv("EMAIL_SENDER_NAME", "Family Task Adventure")},
        "to": [{"email": override or to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": _render_html(heading, paragraphs, cta_label, cta_url),
        "textContent": "\n\n".join([heading, *paragraphs, f"{cta_label}: {cta_url}"]),
        "tags": ["tasker", tag],
    }
    try:
        response = httpx.post(BREVO_URL, json=payload, headers={"api-key": api_key, "accept": "application/json"}, timeout=10)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("Brevo email %r to %s failed: %s", subject, to_email, exc)
        return False
    return True


def send_welcome(email: str, name: Optional[str], role: str) -> bool:
    return send_email(
        email,
        name,
        "Welcome to Family Task Adventure! 🎈",
        f"Welcome aboard, {name or email}!",
        [
            f"An account has been created for you as a {role}.",
            "Ask your family admin for your password, or use “Forgot password” on the sign-in page to choose your own.",
        ],
        "Open the app",
        f"{app_base_url()}/login",
        "welcome",
    )


def send_password_reset(email: str, name: Optional[str], token: str) -> bool:
    return send_email(
        email,
        name,
        "Reset your Family Task Adventure password 🔑",
        "Let's get you back in!",
        [
            "Someone (hopefully you) asked to reset your password.",
            "The link below works for one hour. If you didn't ask for this, you can ignore this email.",
        ],
        "Choose a new password",
        f"{app_base_url()}/reset-password?token={token}",
        "password-reset",
    )


def send_task_assigned(email: str, name: Optional[str], task_title: str, parent_name: str, your_turn: bool = False) -> bool:
    if your_turn:
        subject, heading = f"It's your turn: {task_title} 🔄", "It's your turn!"
        lines = [f"“{task_title}” has been passed to you. Go get those stars!"]
    else:
        subject, heading = f"New task: {task_title} 🎯", "You have a new task!"
        lines = [f"{parent_name} gave you a new task: “{task_title}”.", "Finish it to earn shiny stars ⭐"]
    return send_email(email, name, subject, heading, lines, "See my tasks", f"{app_base_url()}/child", "task-assigned")


def send_task_completed(email: str, name: Optional[str], task_title: str, child_name: str) -> bool:
    return send_email(
        email,
        name,
        f"{child_name} finished: {task_title} 🎉",
        "Woohoo, a task is done!",
        [f"{child_name} just completed “{task_title}”."],
        "View dashboard",
        f"{app_base_url()}/parent",
        "task-completed",
    )
