"""Web Push notifications, sent alongside the emails.

Delivery is best effort: a failed push is logged and never stops the request or cron run that caused it.
Push stays off until both VAPID keys are set in the environment.
"""

import json
import logging
import os

from pywebpush import WebPushException, webpush

from . import database, models
from .mailer import app_base_url

logger = logging.getLogger("tasker.push")


def _keys() -> tuple[str, str] | None:
    public, private = os.getenv("VAPID_PUBLIC_KEY"), os.getenv("VAPID_PRIVATE_KEY")
    return (public, private) if public and private else None


def public_key() -> str | None:
    """The key browsers subscribe with, or None when push is not configured."""
    keys = _keys()
    return keys[0] if keys else None


def notify(user_id: int, title: str, body: str, path: str) -> None:
    """Show a notification on every device the user has subscribed. `path` is relative to the app's base URL."""
    keys = _keys()
    if not keys:
        return
    payload = json.dumps({"title": title, "body": body, "url": f"{app_base_url()}{path}"})
    claims = {"sub": "mailto:" + os.getenv("ADMIN_EMAIL", "admin@example.com")}
    db = database.SessionLocal()
    try:
        for sub in db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).all():
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=payload,
                    vapid_private_key=keys[1],
                    vapid_claims=claims,
                )
            except WebPushException as exc:
                if exc.response is not None and exc.response.status_code in (404, 410):
                    db.delete(sub)  # the device unsubscribed or the subscription expired
                else:
                    logger.warning("push to subscription %s failed: %s", sub.id, exc)
            except Exception:  # network errors and malformed keys must not fail the caller
                logger.exception("push to subscription %s failed", sub.id)
        db.commit()
    finally:
        db.close()
