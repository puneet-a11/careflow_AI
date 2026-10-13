from rest_framework import serializers
from .models import User, Patient, Doctor, Appointment, Department, LabReport, Prescription, Billing


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("email", "name", "role", "avatar")


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = "__all__"
        read_only_fields = ("isArchived", "archivedAt", "archivedBy")


class DoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = "__all__"


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = "__all__"


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = "__all__"


class LabReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabReport
        fields = "__all__"


class PrescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prescription
        fields = "__all__"


class BillingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Billing
        fields = "__all__"

    def validate(self, attrs):
        if not attrs.get("total"):
            attrs["total"] = round(sum(float(attrs.get(field, 0) or 0) for field in ("consultation", "lab", "medicine")), 2)
        return attrs
