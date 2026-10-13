from rest_framework.permissions import BasePermission

CANONICAL_ROLES = ["admin", "doctor", "nurse", "receptionist", "pharmacist", "lab_tech"]
ROLE_LABELS = {
    "admin": "Administrator", "doctor": "Doctor", "nurse": "Nurse",
    "receptionist": "Receptionist", "pharmacist": "Pharmacist", "lab_tech": "Lab Technician",
}
ROLE_ALIASES = {
    "administrator": "admin", "senior physician": "admin", "hospital admin": "admin",
    "physician": "doctor", "dr": "doctor", "staff nurse": "nurse", "front desk": "receptionist",
    "front office": "receptionist", "pharmacy": "pharmacist", "lab technician": "lab_tech",
    "lab tech": "lab_tech", "technician": "lab_tech",
}
ACTIONS = ("view", "create", "edit", "delete")
PERMISSIONS = {
    "patients": {"view": CANONICAL_ROLES, "create": ["admin", "receptionist"], "edit": ["admin", "doctor", "nurse", "receptionist"], "delete": ["admin", "receptionist"]},
    "doctors": {action: CANONICAL_ROLES if action == "view" else ["admin"] for action in ACTIONS},
    "appointments": {"view": CANONICAL_ROLES, "create": ["admin", "receptionist"], "edit": ["admin", "receptionist", "doctor"], "delete": ["admin", "receptionist"]},
    "departments": {action: CANONICAL_ROLES if action == "view" else ["admin"] for action in ACTIONS},
    "lab-reports": {"view": ["admin", "doctor", "nurse", "lab_tech"], "create": ["admin", "doctor", "lab_tech"], "edit": ["admin", "lab_tech", "doctor"], "delete": ["admin", "lab_tech"]},
    "prescriptions": {"view": ["admin", "doctor", "nurse", "pharmacist"], "create": ["admin", "doctor"], "edit": ["admin", "doctor", "pharmacist"], "delete": ["admin", "doctor"]},
    "billing": {"view": ["admin", "receptionist"], "create": ["admin", "receptionist"], "edit": ["admin", "receptionist"], "delete": ["admin"]},
}


def normalize_role(role):
    key = (role or "doctor").strip().lower()
    return ROLE_ALIASES.get(key, key if key in CANONICAL_ROLES else "doctor")


def has_permission(role, module, action):
    return normalize_role(role) in PERMISSIONS.get(module, {}).get(action, [])


def get_permission_matrix(role):
    canonical = normalize_role(role)
    return {module: [action for action in ACTIONS if canonical in actions.get(action, [])] for module, actions in PERMISSIONS.items()}


class RolePermission(BasePermission):
    module = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        action = getattr(view, "permission_action", {}).get(view.action, "view")
        return has_permission(request.user.role, self.module, action)


class AdminPermission(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and normalize_role(request.user.role) == "admin")
