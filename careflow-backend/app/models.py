from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Float, JSON, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    """Hospital staff account. Authentication is backend-only - there is
    no client-side credential list anywhere in this project (see
    careflow-frontend/auth.js)."""
    __tablename__ = "users"

    email = Column(String, primary_key=True, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    avatar = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    # Bumped on password change, role change, or deactivation. Every JWT
    # carries the token_version it was issued with (see app/security.py);
    # a mismatch means the token predates one of those events and is
    # rejected, even though it hasn't expired yet.
    token_version = Column(Integer, nullable=False, default=0)


class Patient(Base):
    """Mirrors MOCK_PATIENTS in mock-data.js"""
    __tablename__ = "patients"

    id = Column(String, primary_key=True, index=True)
    mrn = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer)
    gender = Column(String)
    bloodGroup = Column(String)
    allergies = Column(JSON, default=list)
    vitals = Column(JSON, default=dict)          # {bp, hr, temp, spo2, rr}
    symptoms = Column(JSON, default=list)
    severity = Column(String)                     # Critical | High | Medium | Low
    triageScore = Column(Integer)
    doctor = Column(String)
    status = Column(String)                       # Waiting | In Progress | Checked In | Triaging
    admissionDate = Column(String)
    medicalHistory = Column(JSON, default=list)
    currentMedications = Column(JSON, default=list)
    avatarBg = Column(String, default="#4f46e5")

    # Soft delete / archive (see app/migrations.py for the ALTER TABLE
    # that adds these columns to a pre-existing database).
    isArchived = Column(Boolean, default=False, nullable=False, server_default="0")
    archivedAt = Column(String, nullable=True)
    archivedBy = Column(String, nullable=True)


class Doctor(Base):
    """Mirrors MOCK_DOCTORS in mock-data.js"""
    __tablename__ = "doctors"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    specialization = Column(String)
    department = Column(String)
    availability = Column(String)                  # Available | Busy | Off Duty
    appointmentsToday = Column(Integer, default=0)
    patientCount = Column(Integer, default=0)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    avatarBg = Column(String, default="#4f46e5")
    # Deactivating a doctor keeps their historical appointments/lab
    # orders/prescriptions intact (no hard delete, no cascade) - it only
    # hides them from "assign to a NEW appointment" pickers going
    # forward. Toggled via PUT /api/doctors/{id} like any other field,
    # RBAC-gated the same way as every other doctor edit (admin only -
    # see permissions.py's "doctors" -> "edit").
    isActive = Column(Boolean, nullable=False, default=True)


class Appointment(Base):
    """Mirrors MOCK_APPOINTMENTS in mock-data.js"""
    __tablename__ = "appointments"

    id = Column(String, primary_key=True, index=True)
    patientId = Column(String, ForeignKey("patients.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    patientName = Column(String)
    doctor = Column(String)
    type = Column(String)
    date = Column(String)
    time = Column(String)
    status = Column(String)                         # Pending | In Progress | Checked In | Triaging | Completed | Cancelled


class Department(Base):
    """Mirrors the departments array in departments.js"""
    __tablename__ = "departments"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    icon = Column(String)
    color = Column(String)
    doctors = Column(Integer, default=0)
    beds = Column(Integer, default=0)
    patients = Column(Integer, default=0)
    description = Column(String)


class LabReport(Base):
    """Mirrors MOCK_LAB_REPORTS in mock-data.js"""
    __tablename__ = "lab_reports"

    id = Column(String, primary_key=True, index=True)
    patientId = Column(String, ForeignKey("patients.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    patientName = Column(String)
    test = Column(String)
    date = Column(String)
    doctor = Column(String)
    result = Column(String)
    status = Column(String)                          # Normal | Abnormal
    normalRange = Column(String)
    # Optional attached scan/document (PDF or image) of the physical/lab
    # result. documentFilename is the ORIGINAL filename shown to users;
    # the file itself is stored server-side under a name derived from the
    # report id (see routers/lab_orders.py or wherever the upload route
    # lives), never from user-supplied input, to avoid path traversal.
    documentFilename = Column(String, nullable=True)
    documentContentType = Column(String, nullable=True)
    documentUploadedAt = Column(String, nullable=True)
    documentUploadedBy = Column(String, nullable=True)


class Prescription(Base):
    """Mirrors MOCK_PRESCRIPTIONS in mock-data.js"""
    __tablename__ = "prescriptions"

    id = Column(String, primary_key=True, index=True)
    patientId = Column(String, ForeignKey("patients.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    patientName = Column(String)
    doctor = Column(String)
    diagnosis = Column(String)
    medicines = Column(JSON, default=list)
    dosage = Column(String)
    frequency = Column(String)
    duration = Column(String)
    # e.g. "Take after food", "Use for 5 days". Nullable so existing rows
    # (created before this field existed) just show as "no instructions"
    # rather than failing to load.
    instructions = Column(String, nullable=True)
    date = Column(String)


class Billing(Base):
    """Mirrors MOCK_BILLING in mock-data.js"""
    __tablename__ = "billing"

    id = Column(String, primary_key=True, index=True)
    patientId = Column(String, ForeignKey("patients.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    patientName = Column(String)
    # Legacy flat charge fields - kept for backward compatibility with
    # bills created before itemized billing existed. New bills use
    # BillingItem rows instead; these stay 0 for them. Never removed so
    # old bills keep displaying exactly as they always did.
    consultation = Column(Float, default=0)
    lab = Column(Float, default=0)
    medicine = Column(Float, default=0)

    subtotal = Column(Float, default=0)
    discountType = Column(String, nullable=True)     # "percentage" | "amount"
    discountValue = Column(Float, default=0)          # raw input, e.g. 10 for "10%" or "10"
    discountAmount = Column(Float, default=0)         # computed, always server-side
    taxType = Column(String, nullable=True)           # "percentage" | "amount"
    taxValue = Column(Float, default=0)
    taxAmount = Column(Float, default=0)               # computed, always server-side
    total = Column(Float, default=0)                   # grand total, computed server-side

    status = Column(String)                           # Pending | Paid | Void
    date = Column(String)

    # Void / reissue (see routers/billing.py) - a bill is never overwritten
    # or hard-deleted once it's Paid or Void; corrections go through
    # void (with a mandatory reason) + issuing a new bill that references
    # the one it replaces.
    voidReason = Column(String, nullable=True)
    voidedAt = Column(String, nullable=True)
    voidedBy = Column(String, nullable=True)
    replacesBillId = Column(String, nullable=True)     # this bill corrects that one
    replacedByBillId = Column(String, nullable=True)   # that bill corrects this one

    items = relationship("BillingItem", backref="billing", cascade="all, delete-orphan", order_by="BillingItem.sortOrder")


class BillingItem(Base):
    """One line item on an itemized bill. See Billing.items."""
    __tablename__ = "billing_items"

    id = Column(String, primary_key=True, index=True)
    billingId = Column(String, ForeignKey("billing.id", ondelete="CASCADE", onupdate="CASCADE"), index=True, nullable=False)
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1)
    unitPrice = Column(Float, default=0)
    amount = Column(Float, default=0)                  # quantity * unitPrice, always server-computed
    sortOrder = Column(Integer, default=0)


class OPDVisit(Base):
    """OPD registration/queue - a patient's single walk-in visit, from
    check-in token to consultation to completion. Separate from
    Appointment (which is a scheduled slot); this is same-day walk-in
    flow with a queue token number."""
    __tablename__ = "opd_visits"

    id = Column(String, primary_key=True, index=True)
    patientId = Column(String, ForeignKey("patients.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    patientName = Column(String, nullable=False)
    department = Column(String, nullable=True)
    doctor = Column(String, nullable=True)
    visitType = Column(String, default="New")            # New | Follow-up
    tokenNumber = Column(Integer)                          # resets each day, see routers/opd.py
    reason = Column(String, nullable=True)
    vitals = Column(JSON, default=dict)
    notes = Column(String, nullable=True)
    status = Column(String, default="Waiting")             # Waiting | In Consultation | Completed | Cancelled
    date = Column(String)                                   # YYYY-MM-DD
    checkedInAt = Column(String, nullable=True)
    calledAt = Column(String, nullable=True)
    completedAt = Column(String, nullable=True)


class Ward(Base):
    """A physical ward/unit (General, ICU, Private...) that groups beds."""
    __tablename__ = "wards"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    department = Column(String, nullable=True)
    type = Column(String, default="General")                # General | ICU | Private | Semi-Private


class Bed(Base):
    """A single bed inside a ward. status is the source of truth for bed
    allocation - kept in sync with Admission by routers/ipd.py, never
    edited directly by the generic CRUD path."""
    __tablename__ = "beds"

    id = Column(String, primary_key=True, index=True)
    wardId = Column(String, ForeignKey("wards.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    bedNumber = Column(String, nullable=False)
    status = Column(String, default="Available")             # Available | Occupied | Maintenance


class Admission(Base):
    """IPD admission: links a patient to a bed for the duration of their
    stay. Discharge frees the bed rather than deleting this record, so
    admission history stays queryable."""
    __tablename__ = "admissions"

    id = Column(String, primary_key=True, index=True)
    patientId = Column(String, ForeignKey("patients.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    patientName = Column(String, nullable=False)
    wardId = Column(String, ForeignKey("wards.id"), nullable=True)
    bedId = Column(String, ForeignKey("beds.id"), nullable=True)
    admittingDoctor = Column(String, nullable=True)
    diagnosis = Column(String, nullable=True)
    admissionDate = Column(String)
    expectedDischargeDate = Column(String, nullable=True)
    dischargeDate = Column(String, nullable=True)
    dischargeSummary = Column(String, nullable=True)
    status = Column(String, default="Admitted")               # Admitted | Discharged


class Medicine(Base):
    """One pharmacy inventory row = one batch of one medicine. Restocking
    the same medicine with a new batch/expiry adds a new row rather than
    overwriting - that's what makes batch tracking possible without a
    separate join table."""
    __tablename__ = "medicines"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    unit = Column(String, default="tablet")
    batchNumber = Column(String, nullable=True)
    quantity = Column(Integer, default=0)
    reorderLevel = Column(Integer, default=10)
    expiryDate = Column(String, nullable=True)                # YYYY-MM-DD
    pricePerUnit = Column(Float, default=0)
    supplier = Column(String, nullable=True)


class StockTransaction(Base):
    """Audit trail for every pharmacy stock movement (restock, dispense,
    manual adjustment/write-off)."""
    __tablename__ = "stock_transactions"

    id = Column(String, primary_key=True, index=True)
    medicineId = Column(String, ForeignKey("medicines.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    medicineName = Column(String)
    type = Column(String)                                       # IN | OUT | ADJUSTMENT
    quantity = Column(Integer)
    reason = Column(String, nullable=True)
    patientId = Column(String, nullable=True)
    performedBy = Column(String, nullable=True)
    date = Column(String)


class LabOrder(Base):
    """Full lab workflow pipeline: Ordered -> Sample Collected ->
    Processing -> Verified (or Cancelled at any point before Verified).
    On verification a LabReport row is created/linked (labReportId) so
    existing lab-reports.html keeps showing the final, verified result
    exactly as before - this table is the in-progress pipeline sitting
    in front of it."""
    __tablename__ = "lab_orders"

    id = Column(String, primary_key=True, index=True)
    patientId = Column(String, ForeignKey("patients.id", ondelete="CASCADE", onupdate="CASCADE"), index=True)
    patientName = Column(String, nullable=False)
    test = Column(String, nullable=False)
    orderedBy = Column(String, nullable=True)
    priority = Column(String, default="Routine")                # Routine | Urgent | STAT
    sampleType = Column(String, nullable=True)                   # Blood | Urine | Stool | Swab | Other
    fastingRequired = Column(Boolean, default=False, nullable=False, server_default="0")
    expectedTurnaround = Column(String, nullable=True)
    clinicalNotes = Column(String, nullable=True)
    status = Column(String, default="Ordered")                   # Ordered | Sample Collected | Processing | Verified | Cancelled
    orderedDate = Column(String)
    sampleCollectedAt = Column(String, nullable=True)
    sampleCollectedBy = Column(String, nullable=True)
    processingStartedAt = Column(String, nullable=True)
    result = Column(String, nullable=True)
    normalRange = Column(String, nullable=True)
    resultStatus = Column(String, nullable=True)                 # Normal | Abnormal
    verifiedBy = Column(String, nullable=True)
    verifiedAt = Column(String, nullable=True)
    labReportId = Column(String, nullable=True)


class AuditLog(Base):
    """Records AI-initiated (and other) database modifications.

    Kept intentionally lightweight - this project had no audit mechanism
    before, so this is the minimal table needed to satisfy 'who changed
    what, when, from what to what' for anything the AI assistant writes.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    user_email = Column(String, index=True)
    operation = Column(String)                         # e.g. "update", "delete"
    entity = Column(String)                             # e.g. "patient", "prescription"
    entity_id = Column(String, index=True)
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    ai_initiated = Column(Boolean, default=True)


class ChatMessage(Base):
    """Persisted AI assistant conversation history, so chats survive a
    server restart and can be reviewed later. The in-memory _Session in
    gemini_assistant.py remains the source of truth for the *live*
    multi-turn Gemini conversation (function-call/response parts aren't
    stored here) - this table is the durable, human-readable transcript."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String, index=True)
    role = Column(String)                               # "user" | "assistant"
    content = Column(String)
    patient_id = Column(String, nullable=True)           # patient in context, if any
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
