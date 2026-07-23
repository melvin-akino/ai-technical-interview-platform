"""Encrypt/decrypt Gemini API keys at rest (companies.custom_api_key, platform_api_keys.api_key).

Previously stored as plain Text columns — a database dump or backup leaked every key.
Uses Fernet (AES-128-CBC + HMAC, from the `cryptography` package) with a secret key from
the ENCRYPTION_KEY env var. Losing that key makes every stored value permanently unreadable,
so it must be generated once and kept like any other production secret (not committed, not
rotated casually).

Migration strategy: decrypt() falls back to returning the input unchanged if it is not a
valid Fernet token, so pre-existing plaintext rows keep working without a hard cutover.
`backend/scripts/encrypt_existing_keys.py` does a one-time pass to actually re-encrypt them;
run it once after deploying with ENCRYPTION_KEY set.
"""
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_fernet = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not settings.ENCRYPTION_KEY:
            raise RuntimeError(
                "ENCRYPTION_KEY is not set. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
                "and set it in the environment before storing or reading API keys."
            )
        _fernet = Fernet(settings.ENCRYPTION_KEY.encode())
    return _fernet


def encrypt(plaintext: str) -> str:
    """Encrypt a value for storage. Returns None unchanged (nullable columns)."""
    if not plaintext:
        return plaintext
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(value: str) -> str:
    """Decrypt a stored value. Falls back to returning it unchanged if it is not a Fernet
    token (i.e. a pre-migration plaintext row), so reads never hard-fail during rollout."""
    if not value:
        return value
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return value
