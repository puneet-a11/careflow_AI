from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator

Severity = Literal["Critical", "High", "Medium", "Low"]


# ---------- Auth ----------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    email: str
    name: str
    role: str
    avatar: str
    is_active: bool = True
    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    name: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str
    avatar: Optional[str] = None


class UserAdminUpdate(BaseModel):
    """Admin-only edit: name, role, and/or active status. Password changes
    stay on the self-service PasswordChangeRequest flow, not here."""
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PermissionsOut(BaseModel):
    role: str
    role_label: str
    modules: dict[str, list[str]]


class RoleOut(BaseModel):
    key: str
    label: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Patient ----------

class Vitals(BaseModel):
    bp: Optional[str] = None
    hr: Optional[int] = None
    temp: Optional[float] = None
    spo2: Optional[int] = None
    rr: Optional[int] = None


class PatientBase(BaseModel):
    mrn: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, max_length=50)
    bloodGroup: Optional[str] = Field(None, max_length=10)
    allergies: list[str] = []
    vitals: dict = {}
    symptoms: list[str] = []
    severity: Optional[Severity] = "Medium"
    triageScore: Optional[int] = Field(None, ge=0, le=10)
    doctor: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = Field("Waiting", max_length=50)
    admissionDate: Optional[str] = None
    medicalHistory: list[str] = []
    currentMedications: list[str] = []
    avatarBg: Optional[str] = "#4f46e5"


class PatientCreate(PatientBase):
    id: Optional[str] = None


class PatientUpdate(BaseModel):
    mrn: Optional[str] = Field(None, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, max_length=50)
    bloodGroup: Optional[str] = Field(None, max_length=10)
    allergies: Optional[list[str]] = None
    vitals: Optional[dict] = None
    symptoms: Optional[list[str]] = None
    severity: Optional[Severity] = None
    triageScore: Optional[int] = Field(None, ge=0, le=10)
    doctor: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = Field(None, max_length=50)
    admissionDate: Optional[str] = None
    medicalHistory: Optional[list[str]] = None
    currentMedications: Optional[list[str]] = None
    avatarBg: Optional[str] = None


class PatientOut(PatientBase):
    id: str
    isArchived: bool = False
    archivedAt: Optional[str] = None
    archivedBy: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- Doctor ----------

class DoctorBase(BaseModel):
    name: str
    specialization: Optional[str] = None
    department: Optional[str] = None
    availability: Optional[str] = "Available"
    appointmentsToday: Optional[int] = 0
    patientCount: Optional[int] = 0
    phone: Optional[str] = None
    email: Optional[str] = None
    avatarBg: Optional[str] = "#4f46e5"
    isActive: Optional[bool] = True


class DoctorCreate(DoctorBase):
    id: Optional[str] = None


class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    specialization: Optional[str] = None
    department: Optional[str] = None
    availability: Optional[str] = None
    appointmentsToday: Optional[int] = None
    patientCount: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    avatarBg: Optional[str] = None
    isActive: Optional[bool] = None


class DoctorOut(DoctorBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Appointment ----------

class AppointmentBase(BaseModel):
    patientId: Optional[str] = None
    patientName: str = Field(..., min_length=1, max_length=200)
    doctor: str = Field(..., min_length=1, max_length=200)
    type: Optional[str] = Field(None, max_length=100)
    date: str
    time: str
    status: Optional[str] = "Pending"


class AppointmentCreate(AppointmentBase):
    id: Optional[str] = None


class AppointmentUpdate(BaseModel):
    patientId: Optional[str] = None
    patientName: Optional[str] = Field(None, min_length=1, max_length=200)
    doctor: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[str] = Field(None, max_length=100)
    date: Optional[str] = None
    time: Optional[str] = None
    status: Optional[str] = None


class AppointmentOut(AppointmentBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Department ----------

class DepartmentBase(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None
    doctors: Optional[int] = 0
    beds: Optional[int] = 0
    patients: Optional[int] = 0
    description: Optional[str] = None


class DepartmentCreate(DepartmentBase):
    id: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    doctors: Optional[int] = None
    beds: Optional[int] = None
    patients: Optional[int] = None
    description: Optional[str] = None


class DepartmentOut(DepartmentBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Lab Report ----------

class LabReportBase(BaseModel):
    patientId: Optional[str] = None
    patientName: str
    test: str
    date: str
    doctor: str
    result: Optional[str] = None
    status: Optional[str] = "Normal"
    normalRange: Optional[str] = None


class LabReportCreate(LabReportBase):
    id: Optional[str] = None


class LabReportUpdate(BaseModel):
    patientId: Optional[str] = None
    patientName: Optional[str] = None
    test: Optional[str] = None
    date: Optional[str] = None
    doctor: Optional[str] = None
    result: Optional[str] = None
    status: Optional[str] = None
    normalRange: Optional[str] = None


class LabReportOut(LabReportBase):
    id: str
    documentFilename: Optional[str] = None
    documentContentType: Optional[str] = None
    documentUploadedAt: Optional[str] = None
    documentUploadedBy: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- Prescription ----------

class PrescriptionBase(BaseModel):
    patientId: Optional[str] = None
    patientName: str
    doctor: str
    diagnosis: Optional[str] = None
    medicines: list[str] = []
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = Field(None, max_length=1000)
    date: str


class PrescriptionCreate(PrescriptionBase):
    id: Optional[str] = None


class PrescriptionUpdate(BaseModel):
    patientId: Optional[str] = None
    patientName: Optional[str] = None
    doctor: Optional[str] = None
    diagnosis: Optional[str] = None
    medicines: Optional[list[str]] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = Field(None, max_length=1000)
    date: Optional[str] = None


class PrescriptionOut(PrescriptionBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Billing ----------

class BillingItemBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=300)
    quantity: float = Field(1, gt=0)
    unitPrice: float = Field(0, ge=0)


class BillingItemCreate(BillingItemBase):
    id: Optional[str] = None


class BillingItemOut(BillingItemBase):
    id: str
    amount: float
    model_config = ConfigDict(from_attributes=True)


class BillingBase(BaseModel):
    patientId: Optional[str] = None
    patientName: str
    # Legacy flat fields - a bill created through the new itemized form
    # leaves these at 0 and uses `items` instead; kept for old bills and
    # for backward compatibility, never required.
    consultation: float = Field(0, ge=0)
    lab: float = Field(0, ge=0)
    medicine: float = Field(0, ge=0)
    discountType: Optional[Literal["percentage", "amount"]] = None
    discountValue: float = Field(0, ge=0)
    taxType: Optional[Literal["percentage", "amount"]] = None
    taxValue: float = Field(0, ge=0)
    status: Optional[Literal["Pending", "Paid"]] = "Pending"  # Void is set only via the /void endpoint, never directly
    date: str

    @field_validator("discountValue")
    @classmethod
    def _discount_percentage_range(cls, v, info):
        # A percentage over 100 is always a mistake; a flat amount has no
        # such ceiling (checked against the subtotal server-side instead,
        # once the actual subtotal is known - see routers/billing.py).
        data = info.data
        if data.get("discountType") == "percentage" and v > 100:
            raise ValueError("discountValue cannot exceed 100 when discountType is 'percentage'")
        return v

    @field_validator("taxValue")
    @classmethod
    def _tax_percentage_range(cls, v, info):
        data = info.data
        if data.get("taxType") == "percentage" and v > 100:
            raise ValueError("taxValue cannot exceed 100 when taxType is 'percentage'")
        return v


class BillingCreate(BillingBase):
    id: Optional[str] = None
    items: list[BillingItemCreate] = []
    # If set, this new bill is the corrected reissue of a voided one -
    # validated server-side (must exist, must actually be Void) in
    # routers/billing.py, never trusted blindly.
    replacesBillId: Optional[str] = None


class BillingUpdate(BaseModel):
    patientId: Optional[str] = None
    patientName: Optional[str] = None
    consultation: Optional[float] = Field(None, ge=0)
    lab: Optional[float] = Field(None, ge=0)
    medicine: Optional[float] = Field(None, ge=0)
    discountType: Optional[Literal["percentage", "amount"]] = None
    discountValue: Optional[float] = Field(None, ge=0)
    taxType: Optional[Literal["percentage", "amount"]] = None
    taxValue: Optional[float] = Field(None, ge=0)
    status: Optional[Literal["Pending", "Paid"]] = None
    date: Optional[str] = None
    items: Optional[list[BillingItemCreate]] = None


class BillingVoidRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class BillingOut(BillingBase):
    id: str
    subtotal: float
    discountAmount: float
    taxAmount: float
    total: float
    items: list[BillingItemOut] = []
    voidReason: Optional[str] = None
    voidedAt: Optional[str] = None
    voidedBy: Optional[str] = None
    replacesBillId: Optional[str] = None
    replacedByBillId: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- OPD Visit (registration / queue) ----------

class OPDVisitBase(BaseModel):
    patientId: Optional[str] = None
    patientName: str
    department: Optional[str] = None
    doctor: Optional[str] = None
    visitType: Optional[str] = "New"
    reason: Optional[str] = None
    vitals: dict = {}
    notes: Optional[str] = None
    status: Optional[str] = "Waiting"
    date: Optional[str] = None


class OPDVisitCreate(OPDVisitBase):
    id: Optional[str] = None


class OPDVisitUpdate(BaseModel):
    patientId: Optional[str] = None
    patientName: Optional[str] = None
    department: Optional[str] = None
    doctor: Optional[str] = None
    visitType: Optional[str] = None
    reason: Optional[str] = None
    vitals: Optional[dict] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class OPDVisitOut(OPDVisitBase):
    id: str
    tokenNumber: Optional[int] = None
    checkedInAt: Optional[str] = None
    calledAt: Optional[str] = None
    completedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- Wards & Beds ----------

class WardBase(BaseModel):
    name: str
    department: Optional[str] = None
    type: Optional[str] = "General"


class WardCreate(WardBase):
    id: Optional[str] = None


class WardUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    type: Optional[str] = None


class WardOut(WardBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


class BedBase(BaseModel):
    wardId: str
    bedNumber: str


class BedCreate(BedBase):
    id: Optional[str] = None


class BedUpdate(BaseModel):
    wardId: Optional[str] = None
    bedNumber: Optional[str] = None
    status: Optional[str] = None


class BedOut(BedBase):
    id: str
    status: str
    model_config = ConfigDict(from_attributes=True)


# ---------- IPD Admission ----------

class AdmissionBase(BaseModel):
    patientId: Optional[str] = None
    patientName: str
    wardId: Optional[str] = None
    bedId: Optional[str] = None
    admittingDoctor: Optional[str] = None
    diagnosis: Optional[str] = None
    admissionDate: Optional[str] = None
    expectedDischargeDate: Optional[str] = None


class AdmissionCreate(AdmissionBase):
    id: Optional[str] = None


class AdmissionUpdate(BaseModel):
    wardId: Optional[str] = None
    bedId: Optional[str] = None
    admittingDoctor: Optional[str] = None
    diagnosis: Optional[str] = None
    expectedDischargeDate: Optional[str] = None


class DischargeRequest(BaseModel):
    dischargeSummary: Optional[str] = None
    dischargeDate: Optional[str] = None


class AdmissionOut(AdmissionBase):
    id: str
    dischargeDate: Optional[str] = None
    dischargeSummary: Optional[str] = None
    status: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Pharmacy ----------

class MedicineBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    unit: Optional[str] = "tablet"
    batchNumber: Optional[str] = Field(None, max_length=100)
    quantity: int = Field(0, ge=0)
    reorderLevel: int = Field(10, ge=0)
    expiryDate: Optional[str] = None
    pricePerUnit: float = Field(0, ge=0)
    supplier: Optional[str] = Field(None, max_length=200)


class MedicineCreate(MedicineBase):
    id: Optional[str] = None


class MedicineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    unit: Optional[str] = None
    batchNumber: Optional[str] = Field(None, max_length=100)
    reorderLevel: Optional[int] = Field(None, ge=0)
    expiryDate: Optional[str] = None
    pricePerUnit: Optional[float] = Field(None, ge=0)
    supplier: Optional[str] = Field(None, max_length=200)


class MedicineOut(MedicineBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


class StockAdjustRequest(BaseModel):
    type: Literal["IN", "OUT", "ADJUSTMENT"]
    # NOTE: signed on purpose - ADJUSTMENT allows negative values (stock
    # correction/write-off, see routers/pharmacy.py:adjust_stock). IN/OUT
    # already take abs() of this there, so only rule out the no-op here.
    quantity: int = Field(...)
    reason: Optional[str] = Field(None, max_length=500)
    patientId: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def _quantity_not_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("quantity must not be zero")
        return v


class StockTransactionOut(BaseModel):
    id: str
    medicineId: str
    medicineName: str
    type: str
    quantity: int
    reason: Optional[str] = None
    patientId: Optional[str] = None
    performedBy: Optional[str] = None
    date: str
    model_config = ConfigDict(from_attributes=True)


# ---------- Lab Orders (pipeline) ----------

class LabOrderBase(BaseModel):
    patientId: Optional[str] = None
    patientName: str
    test: str
    orderedBy: Optional[str] = None
    priority: Optional[str] = "Routine"
    sampleType: Optional[str] = None
    fastingRequired: bool = False
    expectedTurnaround: Optional[str] = None
    clinicalNotes: Optional[str] = None
    orderedDate: Optional[str] = None


class LabOrderCreate(LabOrderBase):
    id: Optional[str] = None


class LabOrderUpdate(BaseModel):
    test: Optional[str] = None
    orderedBy: Optional[str] = None
    priority: Optional[str] = None
    sampleType: Optional[str] = None
    fastingRequired: Optional[bool] = None
    expectedTurnaround: Optional[str] = None
    clinicalNotes: Optional[str] = None


class CollectSampleRequest(BaseModel):
    sampleCollectedBy: Optional[str] = None


class VerifyResultRequest(BaseModel):
    result: str
    normalRange: Optional[str] = None
    resultStatus: Literal["Normal", "Abnormal"] = "Normal"
    verifiedBy: Optional[str] = None


class LabOrderOut(LabOrderBase):
    id: str
    status: str
    sampleCollectedAt: Optional[str] = None
    sampleCollectedBy: Optional[str] = None
    processingStartedAt: Optional[str] = None
    result: Optional[str] = None
    normalRange: Optional[str] = None
    resultStatus: Optional[str] = None
    verifiedBy: Optional[str] = None
    verifiedAt: Optional[str] = None
    labReportId: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- AI Assistant ----------

class ChatRequest(BaseModel):
    message: str
    # The dashboard widget has an independent, ephemeral conversation. The
    # full AI Assistant remains the only channel that is persisted/restored.
    channel: Literal["assistant", "dashboard"] = "assistant"


class ChatResponse(BaseModel):
    response: str
    # Additive/optional so old frontend code (which only reads `response`)
    # keeps working unchanged. Lets the frontend know to refresh its
    # cached data immediately after the AI writes to the database.
    data_changed: bool = False
    affected_entities: list[str] = []
    affected_patient_id: Optional[str] = None


class ChatHistoryItem(BaseModel):
    role: str
    content: str
    patient_id: Optional[str] = None
    timestamp: str


class ChatHistoryResponse(BaseModel):
    messages: list[ChatHistoryItem]
