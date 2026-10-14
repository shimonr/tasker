import os
import secrets
import threading
import time
from collections import deque
from datetime import timedelta
from typing import Optional

import jwt
from passlib.context import CryptContext

from .timeutil import utcnow

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
RESET_TOKEN_EXPIRE_MINUTES = 60
# Never fall back to a well-known key. Without TASKER_SECRET_KEY the app replaces this
# per-process value with a random key persisted in the database at startup.
SECRET_KEY = os.getenv("TASKER_SECRET_KEY") or secrets.token_urlsafe(48)
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _encode(user_id: int, token_version: int, token_type: str, expires: timedelta, extra: Optional[dict] = None) -> str:
    payload = {"sub": str(user_id), "ver": token_version, "type": token_type, "exp": utcnow() + expires}
    payload.update(extra or {})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user_id: int, role: str, token_version: int) -> str:
    return _encode(user_id, token_version, "access", timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), {"role": role})


def create_reset_token(user_id: int, token_version: int) -> str:
    return _encode(user_id, token_version, "reset", timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES))


def decode_token(token: str, expected_type: str) -> dict:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Unexpected token type")
    return payload


class RateLimiter:
    """Small in-memory sliding-window limiter (per process)."""

    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> deque:
        hits = self._hits.setdefault(key, deque())
        cutoff = time.monotonic() - self.window_seconds
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if not hits:
            del self._hits[key]
        return hits

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key)) >= self.max_attempts

    def hit(self, key: str) -> None:
        with self._lock:
            self._hits[key] = self._recent(key)
            self._hits[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


# Keyed by account, not IP, so spoofed proxy headers cannot bypass them.
login_limiter = RateLimiter(max_attempts=10, window_seconds=15 * 60)
password_reset_limiter = RateLimiter(max_attempts=3, window_seconds=60 * 60)
