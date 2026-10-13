from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from rest_framework import authentication, exceptions
from django.conf import settings
from .models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(email):
    expires = datetime.now(timezone.utc) + timedelta(minutes=int(settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    return jwt.encode({"sub": email, "exp": expires}, settings.SECRET_KEY, algorithm="HS256")


class JWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith(self.keyword + " "):
            return None
        token = header.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            email = payload.get("sub")
            if not email:
                raise exceptions.AuthenticationFailed("Could not validate credentials")
            user = User.objects.get(email=email)
        except (JWTError, User.DoesNotExist, ValueError):
            raise exceptions.AuthenticationFailed("Could not validate credentials")
        return user, token


def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)


def hash_password(password):
    return pwd_context.hash(password)
