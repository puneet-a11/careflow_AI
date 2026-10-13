from fastapi import APIRouter, Depends

from app import models, schemas
from app.permissions import (
    ACTIONS,
    CANONICAL_ROLES,
    PERMISSIONS,
    ROLE_LABELS,
    get_permission_matrix,
    normalize_role,
    require_admin,
)
from app.security import get_current_user

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


@router.get("/me", response_model=schemas.PermissionsOut)
def my_permissions(current_user: models.User = Depends(get_current_user)):
    """What the *logged in* user can do, per module. The frontend uses
    this to hide/disable buttons - the backend re-checks on every
    request regardless, this just avoids showing dead-end UI."""
    role = normalize_role(current_user.role)
    return schemas.PermissionsOut(
        role=role,
        role_label=ROLE_LABELS.get(role, role.title()),
        modules=get_permission_matrix(current_user.role),
    )


@router.get("/roles", response_model=list[schemas.RoleOut], dependencies=[Depends(require_admin)])
def list_roles():
    """Admin-only: the fixed set of roles available for assigning to
    users (see Settings > Users in the frontend)."""
    return [schemas.RoleOut(key=key, label=ROLE_LABELS[key]) for key in CANONICAL_ROLES]


@router.get("/matrix", dependencies=[Depends(require_admin)])
def full_matrix():
    """Admin-only: the complete role x module x action matrix, rendered
    as a reference table on the Users & Roles settings screen. This is
    read from the same PERMISSIONS dict that actually enforces access
    (app/permissions.py) - not a separate description that could drift
    out of sync with what's really allowed."""
    return {
        "roles": [{"key": key, "label": ROLE_LABELS[key]} for key in CANONICAL_ROLES],
        "modules": {
            module: {
                role: [action for action in ACTIONS if role in actions.get(action, [])]
                for role in CANONICAL_ROLES
            }
            for module, actions in PERMISSIONS.items()
        },
    }
