import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.security import create_access_token, verify_password, hash_password, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _password_problems(password: str) -> list[str]:
    """Returns a list of human-readable reasons a password is too weak, or
    [] if it's acceptable. Used for change-password; new user creation
    (app/routers/users.py) applies the same rule."""
    problems = []
    if len(password) < 8:
        problems.append("Password must be at least 8 characters.")
    if not any(c.isupper() for c in password):
        problems.append("Password must include at least one uppercase letter.")
    if not any(c.islower() for c in password):
        problems.append("Password must include at least one lowercase letter.")
    if not any(c.isdigit() for c in password):
        problems.append("Password must include at least one number.")
    return problems

# ----------------------------------------------------------------------
# Login rate limiting / brute-force protection
# ----------------------------------------------------------------------
# Simple in-memory sliding-window limiter keyed by (client IP, email).
# Deliberately time-based, not a permanent lock: legitimate users always
# regain access after LOCKOUT_SECONDS with no admin/recovery step needed.
# LIMITATION: this state is per-process. If this API is ever run with
# multiple worker processes/instances behind a load balancer, move this
# to a shared store (e.g. Redis) so attempts are counted consistently -
# see PROGRESS.md.
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 5 * 60
_LOCKOUT_SECONDS = 5 * 60

_login_attempts: dict[str, list[float]] = {}
_login_lockouts: dict[str, float] = {}
_login_lock = threading.Lock()


def _client_key(request: Request, email: str) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return f"{client_ip}:{email.lower().strip()}"


def _check_and_record_attempt(request: Request, email: str) -> None:
    key = _client_key(request, email)
    now = time.time()
    with _login_lock:
        locked_until = _login_lockouts.get(key)
        if locked_until and locked_until > now:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please try again in a few minutes.",
                headers={"Retry-After": str(int(locked_until - now))},
            )
        if locked_until and locked_until <= now:
            _login_lockouts.pop(key, None)
            _login_attempts.pop(key, None)


def _record_failed_attempt(request: Request, email: str) -> None:
    key = _client_key(request, email)
    now = time.time()
    with _login_lock:
        attempts = [t for t in _login_attempts.get(key, []) if now - t < _WINDOW_SECONDS]
        attempts.append(now)
        _login_attempts[key] = attempts
        if len(attempts) >= _MAX_ATTEMPTS:
            _login_lockouts[key] = now + _LOCKOUT_SECONDS


def _clear_attempts(request: Request, email: str) -> None:
    key = _client_key(request, email)
    with _login_lock:
        _login_attempts.pop(key, None)
        _login_lockouts.pop(key, None)


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    _check_and_record_attempt(request, payload.email)

    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        _record_failed_attempt(request, payload.email)
        # Same generic message whether the email doesn't exist or the
        # password is wrong - don't reveal which one it was.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please try again.",
        )

    if not user.is_active:
        # Only disclosed once the password has already been verified, so
        # this can't be used to fish for which accounts exist/are active.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact an administrator.",
        )

    _clear_attempts(request, payload.email)
    token = create_access_token({"sub": user.email, "tv": user.token_version})
    return schemas.TokenResponse(access_token=token, user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=schemas.UserOut)
def update_me(
    payload: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if value is not None:
            setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password")
def change_password(
    payload: schemas.PasswordChangeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )
    problems = _password_problems(payload.new_password)
    if problems:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=" ".join(problems),
        )
    current_user.password_hash = hash_password(payload.new_password)
    current_user.token_version += 1
    db.commit()
    # Every previously-issued token (including the one used for this very
    # request) is now invalid - see get_current_user()'s "tv" claim check.
    # This is intentional: a password change should force re-authentication
    # everywhere, including wherever the old password/token may have leaked.
    # The frontend must log the user out and send them back to login after
    # a successful response here (see settings.js).
    return {"detail": "Password changed successfully. Please sign in again."}


@router.post("/logout")
def logout():
    # JWTs are stateless - logout is handled client-side by discarding the token.
    return {"detail": "Logged out"}
