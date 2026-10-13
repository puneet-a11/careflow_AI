from django.db import models


class ExistingModel(models.Model):
    class Meta:
        abstract = True
        managed = False


class User(ExistingModel):
    email = models.EmailField(primary_key=True)
    password_hash = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=255)
    avatar = models.CharField(max_length=255)

    @property
    def is_authenticated(self):
        return True

    class Meta:
        db_table = "users"


class Patient(ExistingModel):
    id = models.CharField(max_length=32, primary_key=True)
    mrn = models.CharField(max_length=255, null=True, unique=True)
    name = models.CharField(max_length=255)
    age = models.IntegerField(null=True)
    gender = models.CharField(max_length=100, null=True)
    bloodGroup = models.CharField(max_length=20, null=True)
    allergies = models.JSONField(default=list)
    vitals = models.JSONField(default=dict)
    symptoms = models.JSONField(default=list)
    severity = models.CharField(max_length=50, null=True)
    triageScore = models.IntegerField(null=True)
    doctor = models.CharField(max_length=255, null=True)
    status = models.CharField(max_length=100, null=True)
    admissionDate = models.CharField(max_length=100, null=True)
    medicalHistory = models.JSONField(default=list)
    currentMedications = models.JSONField(default=list)
    avatarBg = models.CharField(max_length=30, null=True)
    isArchived = models.BooleanField(default=False)
    archivedAt = models.CharField(max_length=100, null=True)
    archivedBy = models.CharField(max_length=255, null=True)

    class Meta:
        db_table = "patients"


class Doctor(ExistingModel):
    id = models.CharField(max_length=32, primary_key=True)
    name = models.CharField(max_length=255)
    specialization = models.CharField(max_length=255, null=True)
    department = models.CharField(max_length=255, null=True)
    availability = models.CharField(max_length=100, null=True)
    appointmentsToday = models.IntegerField(default=0)
    patientCount = models.IntegerField(default=0)
    phone = models.CharField(max_length=100, null=True)
    email = models.CharField(max_length=255, null=True)
    avatarBg = models.CharField(max_length=30, null=True)

    class Meta:
        db_table = "doctors"


class Appointment(ExistingModel):
    id = models.CharField(max_length=32, primary_key=True)
    patientId = models.CharField(max_length=32, null=True)
    patientName = models.CharField(max_length=255)
    doctor = models.CharField(max_length=255)
    type = models.CharField(max_length=100, null=True)
    date = models.CharField(max_length=100)
    time = models.CharField(max_length=100)
    status = models.CharField(max_length=100, null=True)

    class Meta:
        db_table = "appointments"


class Department(ExistingModel):
    id = models.CharField(max_length=32, primary_key=True)
    name = models.CharField(max_length=255)
    icon = models.CharField(max_length=100, null=True)
    color = models.CharField(max_length=100, null=True)
    doctors = models.IntegerField(default=0)
    beds = models.IntegerField(default=0)
    patients = models.IntegerField(default=0)
    description = models.CharField(max_length=1000, null=True)

    class Meta:
        db_table = "departments"


class LabReport(ExistingModel):
    id = models.CharField(max_length=32, primary_key=True)
    patientId = models.CharField(max_length=32, null=True)
    patientName = models.CharField(max_length=255)
    test = models.CharField(max_length=255)
    date = models.CharField(max_length=100)
    doctor = models.CharField(max_length=255)
    result = models.CharField(max_length=255, null=True)
    status = models.CharField(max_length=100, null=True)
    normalRange = models.CharField(max_length=255, null=True)

    class Meta:
        db_table = "lab_reports"


class Prescription(ExistingModel):
    id = models.CharField(max_length=32, primary_key=True)
    patientId = models.CharField(max_length=32, null=True)
    patientName = models.CharField(max_length=255)
    doctor = models.CharField(max_length=255)
    diagnosis = models.CharField(max_length=1000, null=True)
    medicines = models.JSONField(default=list)
    dosage = models.CharField(max_length=255, null=True)
    frequency = models.CharField(max_length=255, null=True)
    duration = models.CharField(max_length=255, null=True)
    date = models.CharField(max_length=100)

    class Meta:
        db_table = "prescriptions"


class Billing(ExistingModel):
    id = models.CharField(max_length=32, primary_key=True)
    patientId = models.CharField(max_length=32, null=True)
    patientName = models.CharField(max_length=255)
    consultation = models.FloatField(default=0)
    lab = models.FloatField(default=0)
    medicine = models.FloatField(default=0)
    total = models.FloatField(default=0)
    status = models.CharField(max_length=100, null=True)
    date = models.CharField(max_length=100)

    class Meta:
        db_table = "billing"
