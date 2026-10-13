from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.permissions import CANONICAL_ROLES, ROLE_ALIASES, ROLE_LABELS, normalize_role, require_admin
from app.routers.auth import _password_problems
from app.security import get_current_user, hash_password


def _validate_role_input(role: str) -> None:
    key = role.strip().lower()
    if key not in ROLE_ALIASES and key not in (r.lower() for r in CANONICAL_ROLES):
        raise HTTPException(
            status_code=422,
            detail=f"Unknown role '{role}'. Use one of: {', '.join(CANONICAL_ROLES)}.",
        )

router = APIRouter(prefix="/api/users", tags=["users"])


def _initials(name: str) -> str:
    parts = [p for p in name.replace(".", " ").split(" ") if p]
    letters = "".join(p[0] for p in parts[:2]).upper()
    return letters or "U"


@router.get("", response_model=list[schemas.UserOut], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.name).all()


@router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    _validate_role_input(payload.role)
    role_key = normalize_role(payload.role)
    problems = _password_problems(payload.password)
    if problems:
        raise HTTPException(status_code=422, detail=" ".join(problems))

    user = models.User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        role=ROLE_LABELS.get(role_key, payload.role),
        avatar=payload.avatar or _initials(payload.name),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{email}", response_model=schemas.UserOut, dependencies=[Depends(require_admin)])
def update_user(
    email: str,
    payload: schemas.UserAdminUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None:
        _validate_role_input(payload.role)
        new_key = normalize_role(payload.role)
        if new_key != "admin" and user.role and normalize_role(user.role) == "admin":
            _ensure_not_last_admin(db, exclude_email=email)
        if normalize_role(user.role) != new_key:
            # Role is changing - any token issued under the old role must
            # stop working immediately, since it may carry more (or
            # differently-shaped) access than the new role should have.
            user.token_version += 1
        user.role = ROLE_LABELS.get(new_key, payload.role)

    if payload.name is not None:
        user.name = payload.name

    if payload.is_active is not None and payload.is_active != user.is_active:
        if not payload.is_active:
            if email == current_user.email:
                raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
            if normalize_role(user.role) == "admin":
                _ensure_not_last_admin(db, exclude_email=email)
            # Deactivating kicks out any session already in progress.
            user.token_version += 1
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{email}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_user(email: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if email == current_user.email:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if normalize_role(user.role) == "admin":
        _ensure_not_last_admin(db, exclude_email=email)
    db.delete(user)
    db.commit()
    return None


def _ensure_not_last_admin(db: Session, exclude_email: str) -> None:
    remaining_admins = [
        u for u in db.query(models.User).all()
        if normalize_role(u.role) == "admin" and u.email != exclude_email and u.is_active
    ]
    if not remaining_admins:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the last active Administrator account. Promote/reactivate another user first.",
        )
