import re
from datetime import datetime, timezone
from django.http import JsonResponse
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from .permissions import ACTIONS, CANONICAL_ROLES, PERMISSIONS, ROLE_LABELS, get_permission_matrix, has_permission, normalize_role, ROLE_ALIASES
from .authentication import create_access_token, hash_password, verify_password
from .models import User, Patient, Doctor, Appointment, Department, LabReport, Prescription, Billing
from .permissions import AdminPermission, RolePermission
from .serializers import (LoginSerializer, UserSerializer, PatientSerializer, DoctorSerializer, AppointmentSerializer, DepartmentSerializer, LabReportSerializer, PrescriptionSerializer, BillingSerializer)


def root(request):
    return JsonResponse({"status": "ok", "service": "CareFlow AI backend", "docs": "/api/health"})


def health(request):
    return JsonResponse({"status": "healthy"})


def next_id(model, prefix):
    highest = 0
    for value in model.objects.values_list("id", flat=True):
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", str(value))
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{prefix}{highest + 1:03d}"


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = User.objects.get(email=serializer.validated_data["email"])
        except User.DoesNotExist:
            return Response({"detail": "Invalid email or password. Please try again."}, status=401)
        if not verify_password(serializer.validated_data["password"], user.password_hash):
            return Response({"detail": "Invalid email or password. Please try again."}, status=401)
        return Response({"access_token": create_access_token(user.email), "token_type": "bearer", "user": UserSerializer(user).data})


class AuthMeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def put(self, request):
        if "name" in request.data:
            request.user.name = request.data["name"]
            request.user.save(update_fields=["name"])
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        if not verify_password(request.data.get("current_password", ""), request.user.password_hash):
            return Response({"detail": "Current password is incorrect."}, status=401)
        if len(request.data.get("new_password", "")) < 6:
            return Response({"detail": "New password must be at least 6 characters."}, status=422)
        request.user.password_hash = hash_password(request.data["new_password"])
        request.user.save(update_fields=["password_hash"])
        return Response({"detail": "Password changed successfully."})


class LogoutView(APIView):
    def post(self, request):
        return Response({"detail": "Logged out"})


class ResourceViewSet(viewsets.ModelViewSet):
    lookup_field = "id"
    permission_classes = [RolePermission]
    permission_action = {"list": "view", "retrieve": "view", "create": "create", "update": "edit", "partial_update": "edit", "destroy": "delete"}
    id_prefix = "X"
    hide_archived = False

    def get_queryset(self):
        queryset = self.model.objects.all()
        if self.hide_archived and self.request.query_params.get("include_archived") != "true":
            queryset = queryset.filter(isArchived=False)
        return queryset

    def perform_create(self, serializer):
        identifier = self.request.data.get("id") or next_id(self.model, self.id_prefix)
        if self.model.objects.filter(id=identifier).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": f"{self.basename} with id '{identifier}' already exists"})
        serializer.save(id=identifier)

    @action(detail=True, methods=["post"])
    def restore(self, request, id=None):
        if not has_permission(request.user.role, self.permission_module, "delete"):
            return Response({"detail": "Permission denied."}, status=403)
        item = self.get_object()
        item.isArchived = False
        item.archivedAt = None
        item.archivedBy = None
        item.save(update_fields=["isArchived", "archivedAt", "archivedBy"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["delete"], permission_classes=[AdminPermission])
    def purge(self, request, id=None):
        item = self.get_object()
        if not item.isArchived:
            return Response({"detail": f"Archive this {self.basename} before permanently deleting it."}, status=400)
        item.delete()
        return Response(status=204)

    def destroy(self, request, *args, **kwargs):
        if not self.hide_archived:
            return super().destroy(request, *args, **kwargs)
        item = self.get_object()
        item.isArchived = True
        item.archivedAt = datetime.now(timezone.utc).isoformat()
        item.archivedBy = request.user.email
        item.save(update_fields=["isArchived", "archivedAt", "archivedBy"])
        return Response(self.get_serializer(item).data)


class PatientViewSet(ResourceViewSet):
    model = Patient
    serializer_class = PatientSerializer
    basename = "patients"
    permission_module = "patients"
    id_prefix = "P"
    hide_archived = True


class DoctorViewSet(ResourceViewSet):
    model = Doctor
    serializer_class = DoctorSerializer
    basename = "doctors"
    permission_module = "doctors"
    id_prefix = "D"


class AppointmentViewSet(ResourceViewSet):
    model = Appointment
    serializer_class = AppointmentSerializer
    basename = "appointments"
    permission_module = "appointments"
    id_prefix = "A"


class DepartmentViewSet(ResourceViewSet):
    model = Department
    serializer_class = DepartmentSerializer
    basename = "departments"
    permission_module = "departments"
    id_prefix = "dep"


class LabReportViewSet(ResourceViewSet):
    model = LabReport
    serializer_class = LabReportSerializer
    basename = "lab-reports"
    permission_module = "lab-reports"
    id_prefix = "L"


class PrescriptionViewSet(ResourceViewSet):
    model = Prescription
    serializer_class = PrescriptionSerializer
    basename = "prescriptions"
    permission_module = "prescriptions"
    id_prefix = "RX"


class BillingViewSet(ResourceViewSet):
    model = Billing
    serializer_class = BillingSerializer
    basename = "billing"
    permission_module = "billing"

    def perform_update(self, serializer):
        data = serializer.validated_data
        if any(field in data for field in ("consultation", "lab", "medicine")):
            data["total"] = round(sum(float(data.get(field, getattr(self.get_object(), field, 0)) or 0) for field in ("consultation", "lab", "medicine")), 2)
        serializer.save()


class UsersViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("name")
    serializer_class = UserSerializer
    permission_classes = [AdminPermission]
    http_method_names = ["get", "post", "put", "delete", "head", "options"]

    def perform_create(self, serializer):
        role = str(self.request.data.get("role", "")).strip().lower()
        if role not in ROLE_ALIASES and role not in CANONICAL_ROLES:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Unknown role."})
        password = self.request.data.get("password", "")
        if len(password) < 6:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Password must be at least 6 characters."})
        name = self.request.data.get("name", "")
        serializer.save(password_hash=hash_password(password), role=ROLE_LABELS.get(normalize_role(role), role), avatar=self.request.data.get("avatar") or "".join(part[0] for part in name.split()[:2]).upper())


class PermissionsView(APIView):
    def get(self, request):
        role = normalize_role(request.user.role)
        return Response({"role": role, "role_label": ROLE_LABELS.get(role, role.title()), "modules": get_permission_matrix(request.user.role)})


class RolesView(APIView):
    permission_classes = [AdminPermission]

    def get(self, request):
        return Response({"roles": [{"key": key, "label": ROLE_LABELS[key]} for key in CANONICAL_ROLES], "modules": {module: {role: [action for action in ACTIONS if role in actions.get(action, [])] for role in CANONICAL_ROLES} for module, actions in PERMISSIONS.items()}})


class AIUnavailableView(APIView):
    def post(self, request, *args, **kwargs):
        return Response({"detail": "Gemini AI service is not enabled in this build. Set GEMINI_API_KEY and enable the AI service adapter."}, status=503)
