from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (LoginView, AuthMeView, ChangePasswordView, LogoutView, PermissionsView, RolesView, AIUnavailableView, UsersViewSet, PatientViewSet, DoctorViewSet, AppointmentViewSet, DepartmentViewSet, LabReportViewSet, PrescriptionViewSet, BillingViewSet)

router = DefaultRouter(trailing_slash=False)
router.register("patients", PatientViewSet, basename="patients")
router.register("doctors", DoctorViewSet, basename="doctors")
router.register("appointments", AppointmentViewSet, basename="appointments")
router.register("departments", DepartmentViewSet, basename="departments")
router.register("lab-reports", LabReportViewSet, basename="lab-reports")
router.register("prescriptions", PrescriptionViewSet, basename="prescriptions")
router.register("billing", BillingViewSet, basename="billing")
router.register("users", UsersViewSet, basename="users")

urlpatterns = [
    path("auth/login", LoginView.as_view()),
    path("auth/me", AuthMeView.as_view()),
    path("auth/change-password", ChangePasswordView.as_view()),
    path("auth/logout", LogoutView.as_view()),
    path("permissions/me", PermissionsView.as_view()),
    path("permissions/matrix", RolesView.as_view()),
    path("permissions/roles", RolesView.as_view()),
    path("ai-assistant/chat", AIUnavailableView.as_view()),
    path("ai-assistant/history", AIUnavailableView.as_view()),
    path("ai-assistant/reset", AIUnavailableView.as_view()),
    path("ai-assistant/analyze-report", AIUnavailableView.as_view()),
    path("", include(router.urls)),
]
