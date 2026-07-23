import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Technical Interview Platform"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite:///./ai_interview.db"
    )
    
    # Gemini API
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Secret used to encrypt Gemini API keys at rest (companies.custom_api_key,
    # platform_api_keys.api_key). Must be a urlsafe-base64 32-byte Fernet key — generate one
    # with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Losing this key makes every stored API key permanently undecryptable.
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    # Number of trusted reverse-proxy hops in front of the app (Caddy + nginx = 2). The real
    # client IP is the Nth-from-last entry in X-Forwarded-For; anything further left is
    # client-supplied and must not be trusted, or a spoofed header defeats IP rate limiting.
    TRUSTED_PROXY_HOPS: int = int(os.getenv("TRUSTED_PROXY_HOPS", "2"))

    class Config:
        case_sensitive = True

settings = Settings()
