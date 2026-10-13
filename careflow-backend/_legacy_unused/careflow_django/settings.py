import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("SECRET_KEY", "insecure-dev-secret-change-me")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
DEBUG = os.getenv("DEBUG", "true").lower() in ("1", "true", "yes")
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "corsheaders.middleware.CorsMiddleware",
]
ROOT_URLCONF = "careflow_django.urls"
TEMPLATES = []
WSGI_APPLICATION = "careflow_django.wsgi.application"
ASGI_APPLICATION = "careflow_django.asgi.application"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./careflow.db")
if DATABASE_URL.startswith("sqlite:///"):
    database_name = DATABASE_URL.removeprefix("sqlite:///")
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": str(BASE_DIR / database_name) if not os.path.isabs(database_name) else database_name}}
else:
    raise RuntimeError("Django migration currently supports DATABASE_URL=sqlite:///... only")

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500,https://localhost,capacitor://localhost,null").split(",") if o.strip() and o.strip() != "null"]
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["api.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}
