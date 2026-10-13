"""
Role-based access control.

Design notes (read this before adding a new role or module):

- `User.role` in the database stays a free-text DISPLAY label
  ("Senior Physician", "Dr. Smith's preferred title", whatever). We do
  NOT force a schema change / data migration on it. Instead every
  permission check runs the role through `normalize_role()`, which maps
  known display labels onto one of the fixed CANONICAL_ROLES below.
  New users created via the Users admin screen should use a canonical
  role name directly (so it displays cleanly AND matches for
  permissions), but legacy/seed data with a friendly title keeps working
  via ROLE_ALIASES.

- PERMISSIONS is the single source of truth for "who can do what". It's
  intentionally just a Python dict (not a DB table) - simple to read,
  simple to diff in code review, and it's enforced on every request via
  `require_permission()`. `/api/permissions/me` exposes the *current
  user's* resolved matrix so the frontend can hide/disable buttons the
  backend would reject anyway (never the only line of defense - the
  backend check is what actually matters).

- Adding a new module later (pharmacy, opd, ipd, ...): add one line to
  PERMISSIONS, then pass `permission_module="pharmacy"` to
  `make_crud_router(...)`. No other file needs to change.
"""

from fastapi import Depends, HTTPException, status

from app.security import get_current_user
from app import models

CANONICAL_ROLES = ["admin", "doctor", "nurse", "receptionist", "pharmacist", "lab_tech"]

ROLE_LABELS = {
    "admin": "Administrator",
    "doctor": "Doctor",
    "nurse": "Nurse",
    "receptionist": "Receptionist",
    "pharmacist": "Pharmacist",
    "lab_tech": "Lab Technician",
}

# Legacy / friendly display labels -> canonical role key.
# Add to this if your hospital uses other job titles for the same access level.
ROLE_ALIASES = {
    "admin": "admin",
    "administrator": "admin",
    "senior physician": "admin",
    "hospital admin": "admin",
    "doctor": "doctor",
    "physician": "doctor",
    "dr": "doctor",
    "nurse": "nurse",
    "staff nurse": "nurse",
    "receptionist": "receptionist",
    "front desk": "receptionist",
    "front office": "receptionist",
    "pharmacist": "pharmacist",
    "pharmacy": "pharmacist",
    "lab_tech": "lab_tech",
    "lab technician": "lab_tech",
    "lab tech": "lab_tech",
    "technician": "lab_tech",
}

ACTIONS = ("view", "create", "edit", "delete")

# module -> action -> list of canonical roles allowed to perform it.
# A role NOT listed for an action simply cannot do it - default is deny.
PERMISSIONS: dict[str, dict[str, list[str]]] = {
    "patients": {
        "view":   ["admin", "doctor", "nurse", "receptionist", "pharmacist", "lab_tech"],
        "create": ["admin", "receptionist"],
        "edit":   ["admin", "doctor", "nurse", "receptionist"],
        "delete": ["admin", "receptionist"],  # "delete" = archive (soft delete)
    },
    "doctors": {
        "view":   CANONICAL_ROLES,
        "create": ["admin"],
        "edit":   ["admin"],
        "delete": ["admin"],
    },
    "appointments": {
        "view":   CANONICAL_ROLES,
        "create": ["admin", "receptionist"],
        "edit":   ["admin", "receptionist", "doctor"],
        "delete": ["admin", "receptionist"],
    },
    "departments": {
        "view":   CANONICAL_ROLES,
        "create": ["admin"],
        "edit":   ["admin"],
        "delete": ["admin"],
    },
    "lab-reports": {
        "view":   ["admin", "doctor", "nurse", "lab_tech"],
        "create": ["admin", "doctor", "lab_tech"],
        "edit":   ["admin", "lab_tech", "doctor"],
        "delete": ["admin", "lab_tech"],
    },
    "prescriptions": {
        "view":   ["admin", "doctor", "nurse", "pharmacist"],
        "create": ["admin", "doctor"],
        "edit":   ["admin", "doctor", "pharmacist"],
        "delete": ["admin", "doctor"],
    },
    "billing": {
        "view":   ["admin", "receptionist"],
        "create": ["admin", "receptionist"],
        "edit":   ["admin", "receptionist"],
        "delete": ["admin"],
    },
    "opd": {
        "view":   ["admin", "doctor", "nurse", "receptionist"],
        "create": ["admin", "receptionist", "nurse"],           # register / check-in a walk-in
        "edit":   ["admin", "doctor", "nurse", "receptionist"],  # call next, add vitals, complete
        "delete": ["admin", "receptionist"],                     # cancel a visit
    },
    "ipd": {
        "view":   ["admin", "doctor", "nurse", "receptionist"],
        "create": ["admin", "doctor", "nurse"],                  # admit a patient
        "edit":   ["admin", "doctor", "nurse"],                  # update / discharge
        "delete": ["admin"],
    },
    "wards": {
        "view":   CANONICAL_ROLES,
        "create": ["admin"],
        "edit":   ["admin"],
        "delete": ["admin"],
    },
    "pharmacy": {
        "view":   ["admin", "pharmacist", "doctor", "nurse"],
        "create": ["admin", "pharmacist"],                       # add medicine / restock
        "edit":   ["admin", "pharmacist"],                       # dispense / adjust stock
        "delete": ["admin", "pharmacist"],
    },
    "lab-orders": {
        "view":   ["admin", "doctor", "nurse", "lab_tech"],
        "create": ["admin", "doctor"],                           # order a test
        "edit":   ["admin", "lab_tech", "doctor"],                # collect sample / process / verify
        "delete": ["admin", "lab_tech"],                          # cancel an order
    },
    "users": {
        "view": ["admin"], "create": ["admin"], "edit": ["admin"], "delete": ["admin"],
    },
}


def normalize_role(role: str | None) -> str:
    """Map a raw/display role string onto a canonical role, or "" (no
    permissions at all) if it can't be recognized.

    SECURITY: this must fail CLOSED. An unrecognized or missing role must
    never resolve to a role that has real permissions (it previously
    defaulted to "doctor", which is a privilege-escalation bug - any typo'd
    or unexpected role string silently got doctor-level access instead of
    being denied). "" matches nothing in PERMISSIONS, so has_permission()
    correctly returns False for every module/action.
    """
    if not role:
        return ""
    key = role.strip().lower()
    if key in ROLE_ALIASES:
        return ROLE_ALIASES[key]
    return key if key in CANONICAL_ROLES else ""


def get_permission_matrix(role: str) -> dict[str, list[str]]:
    """All actions the given (raw, un-normalized) role is allowed to take, per module."""
    canonical = normalize_role(role)
    return {
        module: [action for action in ACTIONS if canonical in actions.get(action, [])]
        for module, actions in PERMISSIONS.items()
    }


def has_permission(role: str, module: str, action: str) -> bool:
    canonical = normalize_role(role)
    return canonical in PERMISSIONS.get(module, {}).get(action, [])


def require_permission(module: str, action: str):
    """FastAPI dependency factory: 403s unless the current user's role
    is allowed to perform `action` on `module`."""

    def _dependency(current_user: models.User = Depends(get_current_user)) -> models.User:
        if not has_permission(current_user.role, module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role ({current_user.role}) does not have '{action}' access to {module}.",
            )
        return current_user

    return _dependency


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if normalize_role(current_user.role) != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires an Administrator role.",
        )
    return current_user
