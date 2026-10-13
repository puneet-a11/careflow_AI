import os
import sys
from dotenv import load_dotenv

load_dotenv()

_INSECURE_DEFAULT_SECRET = "insecure-dev-secret-change-me"

# Origins that must never be allowed in production, no matter what's in
# CORS_ORIGINS - "null" is the Origin header sent by sandboxed iframes,
# data: URIs and some file:// contexts, and allowing it (especially with
# allow_credentials=True, which this app uses) lets a malicious page in
# one of those contexts make authenticated requests against this API.
_ALWAYS_BLOCKED_ORIGINS = {"null", "*"}


class Settings:
    # When true, error responses may include the exception class name to
    # help debugging (never the message/traceback, and never secrets).
    # Defaults on for local dev; set DEBUG=false in production.
    DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("1", "true", "yes")

    SECRET_KEY: str = os.getenv("SECRET_KEY", _INSECURE_DEFAULT_SECRET)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./careflow.db")

    # AI assistant - Gemini only. No OpenAI key is used anywhere in this project.
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            # Web dev servers, plus the origins Capacitor's WebView sends
            # from the mobile app (https://localhost on both platforms
            # with androidScheme/iosScheme set to "https" in
            # capacitor.config.ts; capacitor://localhost is the legacy
            # iOS scheme kept here for older Capacitor builds).
            "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:5501,"
            "https://localhost,capacitor://localhost",
        ).split(",")
        if o.strip() and o.strip().lower() not in _ALWAYS_BLOCKED_ORIGINS
    ]


settings = Settings()


def _fail_fast_on_insecure_production_config() -> None:
    """Refuse to start with an obviously unsafe production configuration,
    instead of silently running insecurely. Only applies when DEBUG=false
    (i.e. the operator has explicitly said "this is production")."""
    if settings.DEBUG:
        return

    problems = []
    if not settings.SECRET_KEY or settings.SECRET_KEY == _INSECURE_DEFAULT_SECRET:
        problems.append(
            "SECRET_KEY is missing or still set to the insecure default. "
            "Set a long random value (e.g. `python -c \"import secrets; print(secrets.token_urlsafe(64))\"`)."
        )
    if len(settings.SECRET_KEY) < 32:
        problems.append("SECRET_KEY is too short (must be at least 32 characters) for production use.")
    if not settings.CORS_ORIGINS:
        problems.append(
            "CORS_ORIGINS resolved to an empty list. Set it to your real frontend origin(s) "
            "(e.g. https://app.yourhospital.com)."
        )
    if any(o in ("http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:3000", "http://127.0.0.1:5501") for o in settings.CORS_ORIGINS):
        problems.append(
            "CORS_ORIGINS still includes a local development origin. Set CORS_ORIGINS explicitly "
            "in production to only your real frontend/app origin(s)."
        )

    if problems:
        message = "Refusing to start with DEBUG=false and an insecure configuration:\n" + "\n".join(
            f"  - {p}" for p in problems
        )
        print(message, file=sys.stderr)
        raise RuntimeError(message)


_fail_fast_on_insecure_production_config()
