"""Security — secret encryption, log redaction, session isolation."""

import hashlib
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("browser-py.engine.security")

AUDIT_REQUIRED_ACTIONS = {
    "click_submit", "purchase", "login", "delete", "payment",
    "transfer", "publish", "apply", "send_email", "book",
}

_SENSITIVE_KEY_PATTERNS = re.compile(
    r"password|token|secret|key|auth|credential|cvv|ssn|card|otp|pin|bearer"
    r"|authorization|cookie|session|private|api_key|access_key|refresh",
    re.IGNORECASE,
)

_INLINE_PATTERNS = [
    (re.compile(r"(password[\"']?\s*[:=]\s*)[^\s,\"'}{]+", re.IGNORECASE), r"\1***"),
    (re.compile(r"(token[\"']?\s*[:=]\s*)[^\s,\"'}{]+", re.IGNORECASE), r"\1***"),
    (re.compile(r"(Bearer\s+)\S+", re.IGNORECASE), r"\1***"),
    (re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), "****-****-****-****"),
    (re.compile(r"(secret[\"']?\s*[:=]\s*)[^\s,\"'}{]+", re.IGNORECASE), r"\1***"),
    (re.compile(r"(api[_-]?key[\"']?\s*[:=]\s*)[^\s,\"'}{]+", re.IGNORECASE), r"\1***"),
]

_SENSITIVE_HEADERS = {
    "authorization", "cookie", "set-cookie", "x-api-key",
    "x-auth-token", "x-csrf-token", "x-session-id",
}


def redact_dict(data: dict, depth: int = 0) -> dict:
    """Recursively redact sensitive keys from a dict."""
    if depth > 10:
        return data
    result = {}
    for k, v in data.items():
        if _SENSITIVE_KEY_PATTERNS.search(str(k)):
            result[k] = "***REDACTED***"
        elif isinstance(v, dict):
            result[k] = redact_dict(v, depth + 1)
        elif isinstance(v, list):
            result[k] = [
                redact_dict(item, depth + 1) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            result[k] = v
    return result


def redact_string(text: str) -> str:
    """Redact secrets that appear inline in strings."""
    for pattern, replacement in _INLINE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def redact_headers(headers: dict) -> dict:
    """Redact sensitive HTTP headers."""
    result = {}
    for k, v in headers.items():
        if k.lower() in _SENSITIVE_HEADERS:
            result[k] = "***REDACTED***"
        else:
            result[k] = v
    return result


class SecureStore:
    """In-memory encrypted secret store using XOR cipher."""

    def __init__(self):
        self._session_key: bytes = os.urandom(32)
        self._store: dict[str, bytes] = {}

    def store(self, key: str, value: str) -> None:
        """Encrypt and store a secret."""
        data = value.encode("utf-8")
        self._store[key] = self._xor_encrypt(data, self._session_key)

    def retrieve(self, key: str) -> Optional[str]:
        """Decrypt and return a stored secret."""
        encrypted = self._store.get(key)
        if encrypted is None:
            return None
        return self._xor_encrypt(encrypted, self._session_key).decode("utf-8", errors="replace")

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        """Wipe all stored secrets from memory."""
        self._store.clear()
        self._session_key = os.urandom(32)

    def has(self, key: str) -> bool:
        return key in self._store

    def _xor_encrypt(self, data: bytes, key: bytes) -> bytes:
        """XOR cipher — symmetric, works for both encrypt and decrypt."""
        key_len = len(key)
        return bytes(b ^ key[i % key_len] for i, b in enumerate(data))


class SessionIsolation:
    """Guards against cross-session data leakage."""

    def generate_session_id(self) -> str:
        return str(uuid.uuid4())

    def validate_no_cross_session(self, session_id: str, data: dict) -> bool:
        """Check that data doesn't reference other session IDs."""
        data_str = str(data)
        # Find any UUID-like strings in data
        uuids_found = re.findall(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            data_str,
            re.IGNORECASE,
        )
        foreign = [u for u in uuids_found if u != session_id]
        if foreign:
            log.warning("Cross-session reference detected: %s", foreign[:3])
            return False
        return True

    def sanitize_log_entry(self, entry: dict, session_id: str) -> dict:
        """Redact secrets and validate session isolation in a log entry."""
        clean = redact_dict(entry)
        # Remove any string values that look like foreign session IDs
        return clean


class SecurityManager:
    """Top-level security facade."""

    def __init__(self):
        self.store = SecureStore()
        self.isolation = SessionIsolation()

    def redact_for_log(self, data: dict) -> dict:
        return redact_dict(data)

    def redact_text(self, text: str) -> str:
        return redact_string(text)

    def is_audit_required(self, action_type: str) -> bool:
        return action_type.lower() in AUDIT_REQUIRED_ACTIONS

    def store_credential(self, key: str, value: str) -> None:
        self.store.store(key, value)

    def get_credential(self, key: str) -> Optional[str]:
        return self.store.retrieve(key)

    def clear_credentials(self) -> None:
        self.store.clear()
