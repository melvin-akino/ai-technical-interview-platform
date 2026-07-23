"""One-time migration: encrypt any plaintext API keys left over from before encryption-at-rest
was added. Safe to run multiple times — a value that already decrypts as a valid Fernet token
is left untouched.

Run inside the backend container, after deploying with ENCRYPTION_KEY set:
    docker exec ai_interview_backend_prod python3 scripts/encrypt_existing_keys.py
"""
from cryptography.fernet import InvalidToken

from app.core.crypto import encrypt, _get_fernet
from app.db.session import SessionLocal
from app.db import models


def is_encrypted(value: str) -> bool:
    if not value:
        return True  # nothing to migrate
    try:
        _get_fernet().decrypt(value.encode())
        return True
    except InvalidToken:
        return False


def main():
    db = SessionLocal()
    migrated = 0
    try:
        for key in db.query(models.PlatformApiKey).all():
            if not is_encrypted(key.api_key):
                key.api_key = encrypt(key.api_key)
                migrated += 1
                print(f"  encrypted platform_api_keys.id={key.id} (label={key.label!r})")

        for company in db.query(models.Company).all():
            if company.custom_api_key and not is_encrypted(company.custom_api_key):
                company.custom_api_key = encrypt(company.custom_api_key)
                migrated += 1
                print(f"  encrypted companies.id={company.id} (name={company.name!r}) custom_api_key")

        db.commit()
        print(f"Done. {migrated} value(s) encrypted.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
