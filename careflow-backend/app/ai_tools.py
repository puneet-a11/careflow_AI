"""
Controlled tool layer for the CareFlow AI assistant.

Gemini NEVER gets raw SQL access. It can only call the explicit,
whitelisted tools declared in TOOL_DECLARATIONS.

Every tool:
    fn(db: Session, current_user: models.User, **kwargs) -> dict

returns a JSON-serialisable dictionary.

IMPORTANT:
- Read operations can execute directly.
- Create/update operations are validated through Pydantic schemas.
- Destructive delete operations MUST go through the router's confirmation flow.
- Every database mutation creates an AuditLog entry.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud_factory import _next_id as generate_next_id


# ============================================================================
# CONFIGURATION
# ============================================================================

MAX_LIST_RESULTS = 25


# ============================================================================
# WRITE ALLOW-LISTS
# ============================================================================

PATIENT_WRITABLE_FIELDS = {
    "mrn",
    "name",
    "age",
    "gender",
    "bloodGroup",
    "allergies",
    "vitals",
    "symptoms",
    "severity",
    "triageScore",
    "doctor",
    "status",
    "admissionDate",
    "medicalHistory",
    "currentMedications",
    "avatarBg",
}

VITALS_WRITABLE_FIELDS = {
    "bp",
    "hr",
    "temp",
    "spo2",
    "rr",
}

DOCTOR_WRITABLE_FIELDS = {
    "name",
    "specialization",
    "department",
    "availability",
    "appointmentsToday",
    "patientCount",
    "phone",
    "email",
    "avatarBg",
}

APPOINTMENT_WRITABLE_FIELDS = {
    "patientId",
    "patientName",
    "doctor",
    "type",
    "date",
    "time",
    "status",
}

LAB_REPORT_WRITABLE_FIELDS = {
    "patientId",
    "patientName",
    "test",
    "date",
    "doctor",
    "result",
    "status",
    "normalRange",
}

PRESCRIPTION_WRITABLE_FIELDS = {
    "patientId",
    "patientName",
    "doctor",
    "diagnosis",
    "medicines",
    "dosage",
    "frequency",
    "duration",
    "date",
}

BILLING_WRITABLE_FIELDS = {
    "patientId",
    "patientName",
    "consultation",
    "lab",
    "medicine",
    "total",
    "status",
    "date",
}

DEPARTMENT_WRITABLE_FIELDS = {
    "name",
    "icon",
    "color",
    "doctors",
    "beds",
    "patients",
    "description",
}


# ============================================================================
# DESTRUCTIVE TOOLS
# ============================================================================
#
# These names are intercepted by the router.
# The actual _execute_* function is only called after explicit confirmation.
# ============================================================================

DESTRUCTIVE_TOOLS = {
    "delete_patient",
    "delete_doctor",
    "delete_appointment",
    "delete_lab_report",
    "delete_prescription",
    "delete_billing",
    "delete_billing_record",
    "delete_department",
}


# ============================================================================
# COMMON HELPERS
# ============================================================================

def _serialize(obj) -> dict:
    """Serialize a SQLAlchemy model into a plain JSON-safe dict."""
    return {
        column.name: getattr(obj, column.name)
        for column in obj.__table__.columns
    }


def _serialize_lab_report(obj) -> dict:
    """Lab report as the AI should describe it.

    The Lab Reports screen treats a report as PENDING until its document is
    uploaded; Normal/Abnormal (the database `status` column) only says how
    the result reads. Handing the model the raw column made it call every
    report "completed", contradicting the screen. So here `status` follows
    the screen, and the result flag is exposed separately.
    """
    data = _serialize(obj)
    uploaded = bool(data.get("documentFilename"))
    data["result_flag"] = data.get("status")
    data["document_uploaded"] = uploaded
    data["status"] = "Uploaded" if uploaded else "Pending"
    if not uploaded:
        data["note"] = (
            "Report document not uploaded yet, so this report is still Pending. "
            "result_flag is only the Normal/Abnormal reading of the entered value."
        )
    return data


def _write_audit(
    db: Session,
    *,
    user_email: str,
    operation: str,
    entity: str,
    entity_id: str,
    old_value: dict | None,
    new_value: dict | None,
) -> None:
    """Write an AI-generated audit record."""
    db.add(
        models.AuditLog(
            timestamp=datetime.now(timezone.utc),
            user_email=user_email,
            operation=operation,
            entity=entity,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            ai_initiated=True,
        )
    )
    db.commit()


def _validate_fields(
    fields: dict,
    allowed: set[str],
    entity_name: str,
) -> str | None:
    """Return an error message if fields outside the allow-list are supplied."""
    if not isinstance(fields, dict):
        return f"{entity_name} fields must be an object."

    unknown = set(fields) - allowed

    if unknown:
        return (
            f"Field(s) not permitted for {entity_name} update: "
            f"{', '.join(sorted(unknown))}. "
            f"Allowed fields: {', '.join(sorted(allowed))}."
        )

    return None


def _find_patient(
    db: Session,
    patient_id: str,
) -> models.Patient | None:
    return (
        db.query(models.Patient)
        .filter(models.Patient.id == patient_id)
        .first()
    )


# ============================================================================
# PATIENTS
# ============================================================================

def search_patient(
    db: Session,
    current_user: models.User,
    query: str,
) -> dict:
    """
    Search patients by partial name, patient ID, or MRN.
    """
    query = (query or "").strip()

    if not query:
        return {
            "error": "A patient name, patient ID, or MRN is required."
        }

    like = f"%{query}%"

    rows = (
        db.query(models.Patient)
        .filter(
            or_(
                models.Patient.name.ilike(like),
                models.Patient.id.ilike(like),
                models.Patient.mrn.ilike(like),
            )
        )
        .all()
    )

    if not rows:
        return {
            "found": 0,
            "patients": [],
            "message": f"No patient found matching '{query}'.",
        }

    return {
        "found": len(rows),
        "patients": [
            {
                "id": p.id,
                "mrn": p.mrn,
                "name": p.name,
                "age": p.age,
                "gender": p.gender,
                "doctor": p.doctor,
                "status": p.status,
                "severity": p.severity,
            }
            for p in rows
        ],
    }


def list_patients(
    db: Session,
    current_user: models.User,
    status: str | None = None,
    severity: str | None = None,
    doctor: str | None = None,
    department: str | None = None,
    limit: int | None = None,
) -> dict:
    """List/filter patients."""

    q = db.query(models.Patient)

    if status:
        q = q.filter(models.Patient.status.ilike(status))

    if severity:
        q = q.filter(models.Patient.severity.ilike(severity))

    if doctor:
        q = q.filter(
            models.Patient.doctor.ilike(f"%{doctor}%")
        )

    if department:
        doctor_names = [
            d.name
            for d in db.query(models.Doctor)
            .filter(
                models.Doctor.department.ilike(
                    f"%{department}%"
                )
            )
            .all()
        ]

        if not doctor_names:
            return {
                "found": 0,
                "patients": [],
                "message": (
                    f"No doctors found in department "
                    f"'{department}'."
                ),
            }

        q = q.filter(models.Patient.doctor.in_(doctor_names))

    rows = q.all()

    rows.sort(
        key=lambda p: (
            p.triageScore
            if p.triageScore is not None
            else -1
        ),
        reverse=True,
    )

    cap = min(
        limit or MAX_LIST_RESULTS,
        MAX_LIST_RESULTS,
    )

    results = rows[:cap]

    return {
        "found": len(rows),
        "returned": len(results),
        "truncated": len(rows) > len(results),
        "patients": [
            {
                "id": p.id,
                "mrn": p.mrn,
                "name": p.name,
                "age": p.age,
                "gender": p.gender,
                "doctor": p.doctor,
                "status": p.status,
                "severity": p.severity,
                "triageScore": p.triageScore,
            }
            for p in results
        ],
    }


def get_patient_details(
    db: Session,
    current_user: models.User,
    patient_id: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    return {
        "patient": _serialize(patient)
    }


def get_patient_vitals(
    db: Session,
    current_user: models.User,
    patient_id: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    return {
        "patient_id": patient.id,
        "name": patient.name,
        "vitals": patient.vitals or {},
    }


def create_patient(
    db: Session,
    current_user: models.User,
    fields: dict,
) -> dict:
    try:
        payload = schemas.PatientCreate(**fields)
    except Exception as exc:
        return {
            "error": f"Invalid patient fields: {exc}"
        }

    data = payload.model_dump()

    patient_id = (
        data.pop("id", None)
        or generate_next_id(
            db,
            models.Patient,
            "P",
        )
    )

    if (
        db.query(models.Patient)
        .filter(models.Patient.id == patient_id)
        .first()
    ):
        return {
            "error": (
                f"A patient with id '{patient_id}' "
                f"already exists."
            )
        }

    patient = models.Patient(
        id=patient_id,
        **data,
    )

    db.add(patient)
    db.commit()
    db.refresh(patient)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="create",
        entity="patient",
        entity_id=patient_id,
        old_value=None,
        new_value=_serialize(patient),
    )

    return {
        "created": True,
        "patient": _serialize(patient),
    }


def update_patient(
    db: Session,
    current_user: models.User,
    patient_id: str,
    fields: dict,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    error = _validate_fields(
        fields,
        PATIENT_WRITABLE_FIELDS,
        "patient",
    )

    if error:
        return {"error": error}

    if not fields:
        return {
            "error": "No patient fields were supplied for update."
        }

    old_value = {
        key: getattr(patient, key)
        for key in fields
    }

    for key, value in fields.items():
        setattr(patient, key, value)

    db.commit()
    db.refresh(patient)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="patient",
        entity_id=patient_id,
        old_value=old_value,
        new_value=fields,
    )

    return {
        "updated": True,
        "patient": _serialize(patient),
    }


def update_patient_vitals(
    db: Session,
    current_user: models.User,
    patient_id: str,
    vitals: dict,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    unknown = set(vitals) - VITALS_WRITABLE_FIELDS

    if unknown:
        return {
            "error": (
                "Unknown vital field(s): "
                f"{', '.join(sorted(unknown))}. "
                "Allowed: bp, hr, temp, spo2, rr."
            )
        }

    if not vitals:
        return {
            "error": "No vital signs were supplied."
        }

    old_vitals = dict(patient.vitals or {})
    new_vitals = dict(old_vitals)
    new_vitals.update(vitals)

    patient.vitals = new_vitals

    db.commit()
    db.refresh(patient)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="patient_vitals",
        entity_id=patient_id,
        old_value=old_vitals,
        new_value=new_vitals,
    )

    return {
        "updated": True,
        "patient_id": patient.id,
        "name": patient.name,
        "vitals": patient.vitals,
    }


def get_patient_summary(
    db: Session,
    current_user: models.User,
    patient_id: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    labs = (
        db.query(models.LabReport)
        .filter(
            models.LabReport.patientId == patient_id
        )
        .order_by(
            models.LabReport.date.desc()
        )
        .all()
    )

    prescriptions = (
        db.query(models.Prescription)
        .filter(
            models.Prescription.patientId == patient_id
        )
        .order_by(
            models.Prescription.date.desc()
        )
        .all()
    )

    appointments = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.patientId == patient_id
        )
        .order_by(
            models.Appointment.date.desc()
        )
        .all()
    )

    upcoming = [
        a
        for a in appointments
        if a.status not in ("Completed", "Cancelled")
    ]

    return {
        "patient": _serialize(patient),
        "latest_lab_report": (
            _serialize_lab_report(labs[0])
            if labs
            else None
        ),
        "lab_report_count": len(labs),
        "latest_prescription": (
            _serialize(prescriptions[0])
            if prescriptions
            else None
        ),
        "prescription_count": len(prescriptions),
        "upcoming_appointments": [
            _serialize(a)
            for a in upcoming[:5]
        ],
    }


def add_clinical_note(
    db: Session,
    current_user: models.User,
    patient_id: str,
    note: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    note = (note or "").strip()

    if not note:
        return {
            "error": "Clinical note cannot be empty."
        }

    stamp = datetime.now(timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC"
    )

    entry = (
        f"[{stamp}] "
        f"{current_user.name}: "
        f"{note}"
    )

    history = list(
        patient.medicalHistory or []
    )

    history.append(entry)
    patient.medicalHistory = history

    db.commit()
    db.refresh(patient)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="patient_note",
        entity_id=patient_id,
        old_value=None,
        new_value={"note": entry},
    )

    return {
        "updated": True,
        "patient_id": patient.id,
        "name": patient.name,
        "medicalHistory": patient.medicalHistory,
    }


# ============================================================================
# PATIENT DELETE
# ============================================================================

def _execute_delete_patient(
    db: Session,
    current_user: models.User,
    patient_id: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    old_value = _serialize(patient)

    db.delete(patient)
    db.commit()

    _write_audit(
        db,
        user_email=current_user.email,
        operation="delete",
        entity="patient",
        entity_id=patient_id,
        old_value=old_value,
        new_value=None,
    )

    return {
        "deleted": True,
        "patient_id": patient_id,
    }


# ============================================================================
# DOCTORS
# ============================================================================

def search_doctor(
    db: Session,
    current_user: models.User,
    query: str,
) -> dict:
    query = (query or "").strip()

    if not query:
        return {
            "error": "Doctor name, ID, department, or specialization is required."
        }

    like = f"%{query}%"

    rows = (
        db.query(models.Doctor)
        .filter(
            or_(
                models.Doctor.id.ilike(like),
                models.Doctor.name.ilike(like),
                models.Doctor.department.ilike(like),
                models.Doctor.specialization.ilike(like),
            )
        )
        .all()
    )

    return {
        "found": len(rows),
        "doctors": [
            _serialize(row)
            for row in rows
        ],
    }


def list_doctors(
    db: Session,
    current_user: models.User,
    query: str | None = None,
) -> dict:
    if query:
        return search_doctor(
            db,
            current_user,
            query,
        )

    rows = (
        db.query(models.Doctor)
        .limit(MAX_LIST_RESULTS)
        .all()
    )

    total = db.query(models.Doctor).count()

    return {
        "found": total,
        "returned": len(rows),
        "truncated": total > len(rows),
        "doctors": [
            _serialize(row)
            for row in rows
        ],
    }


def create_doctor(
    db: Session,
    current_user: models.User,
    fields: dict,
) -> dict:
    try:
        payload = schemas.DoctorCreate(**fields)
    except Exception as exc:
        return {
            "error": f"Invalid doctor fields: {exc}"
        }

    data = payload.model_dump()

    doctor_id = (
        data.pop("id", None)
        or generate_next_id(
            db,
            models.Doctor,
            "D",
        )
    )

    if (
        db.query(models.Doctor)
        .filter(models.Doctor.id == doctor_id)
        .first()
    ):
        return {
            "error": (
                f"A doctor with id '{doctor_id}' "
                f"already exists."
            )
        }

    doctor = models.Doctor(
        id=doctor_id,
        **data,
    )

    db.add(doctor)
    db.commit()
    db.refresh(doctor)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="create",
        entity="doctor",
        entity_id=doctor_id,
        old_value=None,
        new_value=_serialize(doctor),
    )

    return {
        "created": True,
        "doctor": _serialize(doctor),
    }


def update_doctor(
    db: Session,
    current_user: models.User,
    doctor_id: str,
    fields: dict,
) -> dict:
    doctor = (
        db.query(models.Doctor)
        .filter(models.Doctor.id == doctor_id)
        .first()
    )

    if not doctor:
        return {
            "error": f"No doctor with id '{doctor_id}' exists."
        }

    error = _validate_fields(
        fields,
        DOCTOR_WRITABLE_FIELDS,
        "doctor",
    )

    if error:
        return {"error": error}

    try:
        validated = schemas.DoctorUpdate(
            **fields
        ).model_dump(exclude_unset=True)
    except Exception as exc:
        return {
            "error": f"Invalid doctor fields: {exc}"
        }

    old_value = {
        key: getattr(doctor, key)
        for key in validated
    }

    for key, value in validated.items():
        setattr(doctor, key, value)

    db.commit()
    db.refresh(doctor)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="doctor",
        entity_id=doctor_id,
        old_value=old_value,
        new_value=validated,
    )

    return {
        "updated": True,
        "doctor": _serialize(doctor),
    }


def _execute_delete_doctor(
    db: Session,
    current_user: models.User,
    doctor_id: str,
) -> dict:
    doctor = (
        db.query(models.Doctor)
        .filter(models.Doctor.id == doctor_id)
        .first()
    )

    if not doctor:
        return {
            "error": f"No doctor with id '{doctor_id}' exists."
        }

    old_value = _serialize(doctor)

    db.delete(doctor)
    db.commit()

    _write_audit(
        db,
        user_email=current_user.email,
        operation="delete",
        entity="doctor",
        entity_id=doctor_id,
        old_value=old_value,
        new_value=None,
    )

    return {
        "deleted": True,
        "doctor_id": doctor_id,
    }


# ============================================================================
# APPOINTMENTS
# ============================================================================

def list_appointments(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    appointment_id: str | None = None,
) -> dict:
    q = db.query(models.Appointment)

    if patient_id:
        q = q.filter(
            models.Appointment.patientId == patient_id
        )

    if appointment_id:
        q = q.filter(
            models.Appointment.id == appointment_id
        )

    rows = q.all()

    return {
        "found": len(rows),
        "appointments": [
            _serialize(row)
            for row in rows
        ],
    }


def search_appointments(
    db: Session,
    current_user: models.User,
    query: str,
) -> dict:
    query = (query or "").strip()

    if not query:
        return {
            "error": "Appointment search query is required."
        }

    like = f"%{query}%"

    rows = (
        db.query(models.Appointment)
        .filter(
            or_(
                models.Appointment.id.ilike(like),
                models.Appointment.patientName.ilike(like),
                models.Appointment.patientId.ilike(like),
                models.Appointment.doctor.ilike(like),
                models.Appointment.type.ilike(like),
                models.Appointment.date.ilike(like),
                models.Appointment.status.ilike(like),
            )
        )
        .all()
    )

    return {
        "found": len(rows),
        "appointments": [
            _serialize(row)
            for row in rows
        ],
    }


# Backward-compatible alias
def get_appointments(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    appointment_id: str | None = None,
) -> dict:
    return list_appointments(
        db,
        current_user,
        patient_id,
        appointment_id,
    )


def create_appointment(
    db: Session,
    current_user: models.User,
    patient_id: str,
    doctor: str,
    date: str,
    time: str,
    type: str | None = None,
    status: str | None = None,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    try:
        payload = schemas.AppointmentCreate(
            patientId=patient.id,
            patientName=patient.name,
            doctor=doctor,
            type=type,
            date=date,
            time=time,
            status=status or "Pending",
        )
    except Exception as exc:
        return {
            "error": f"Invalid appointment fields: {exc}"
        }

    data = payload.model_dump()

    appointment_id = (
        data.pop("id", None)
        or generate_next_id(
            db,
            models.Appointment,
            "A",
        )
    )

    appointment = models.Appointment(
        id=appointment_id,
        **data,
    )

    db.add(appointment)
    db.commit()
    db.refresh(appointment)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="create",
        entity="appointment",
        entity_id=appointment_id,
        old_value=None,
        new_value=_serialize(appointment),
    )

    return {
        "created": True,
        "appointment": _serialize(appointment),
    }


def update_appointment(
    db: Session,
    current_user: models.User,
    appointment_id: str,
    fields: dict,
) -> dict:
    appointment = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.id == appointment_id
        )
        .first()
    )

    if not appointment:
        return {
            "error": (
                f"No appointment with id "
                f"'{appointment_id}' exists."
            )
        }

    error = _validate_fields(
        fields,
        APPOINTMENT_WRITABLE_FIELDS,
        "appointment",
    )

    if error:
        return {"error": error}

    try:
        validated = schemas.AppointmentUpdate(
            **fields
        ).model_dump(exclude_unset=True)
    except Exception as exc:
        return {
            "error": f"Invalid appointment fields: {exc}"
        }

    if not validated:
        return {
            "error": "No appointment fields were supplied."
        }

    old_value = {
        key: getattr(appointment, key)
        for key in validated
    }

    for key, value in validated.items():
        setattr(appointment, key, value)

    db.commit()
    db.refresh(appointment)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="appointment",
        entity_id=appointment_id,
        old_value=old_value,
        new_value=validated,
    )

    return {
        "updated": True,
        "appointment": _serialize(appointment),
    }


def _execute_delete_appointment(
    db: Session,
    current_user: models.User,
    appointment_id: str,
) -> dict:
    appointment = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.id == appointment_id
        )
        .first()
    )

    if not appointment:
        return {
            "error": (
                f"No appointment with id "
                f"'{appointment_id}' exists."
            )
        }

    old_value = _serialize(appointment)

    db.delete(appointment)
    db.commit()

    _write_audit(
        db,
        user_email=current_user.email,
        operation="delete",
        entity="appointment",
        entity_id=appointment_id,
        old_value=old_value,
        new_value=None,
    )

    return {
        "deleted": True,
        "appointment_id": appointment_id,
    }


# ============================================================================
# LAB REPORTS
# ============================================================================

def list_lab_reports(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    lab_report_id: str | None = None,
) -> dict:
    q = db.query(models.LabReport)

    if patient_id:
        q = q.filter(
            models.LabReport.patientId == patient_id
        )

    if lab_report_id:
        q = q.filter(
            models.LabReport.id == lab_report_id
        )

    rows = q.all()

    return {
        "found": len(rows),
        "pending": sum(1 for row in rows if not row.documentFilename),
        "lab_reports": [
            _serialize_lab_report(row)
            for row in rows
        ],
    }


def get_patient_lab_reports(
    db: Session,
    current_user: models.User,
    patient_id: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    rows = (
        db.query(models.LabReport)
        .filter(
            models.LabReport.patientId == patient_id
        )
        .order_by(
            models.LabReport.date.desc()
        )
        .all()
    )

    return {
        "patient_id": patient_id,
        "patient_name": patient.name,
        "found": len(rows),
        "pending": sum(1 for row in rows if not row.documentFilename),
        "lab_reports": [
            _serialize_lab_report(row)
            for row in rows
        ],
    }


# Backward-compatible alias
def get_lab_reports(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    lab_report_id: str | None = None,
) -> dict:
    return list_lab_reports(
        db,
        current_user,
        patient_id,
        lab_report_id,
    )


def create_lab_report(
    db: Session,
    current_user: models.User,
    patient_id: str,
    test: str,
    date: str,
    doctor: str,
    result: str | None = None,
    status: str | None = None,
    normal_range: str | None = None,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    try:
        payload = schemas.LabReportCreate(
            patientId=patient.id,
            patientName=patient.name,
            test=test,
            date=date,
            doctor=doctor,
            result=result,
            status=status or "Normal",
            normalRange=normal_range,
        )
    except Exception as exc:
        return {
            "error": f"Invalid lab report fields: {exc}"
        }

    data = payload.model_dump()

    report_id = (
        data.pop("id", None)
        or generate_next_id(
            db,
            models.LabReport,
            "L",
        )
    )

    report = models.LabReport(
        id=report_id,
        **data,
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="create",
        entity="lab_report",
        entity_id=report_id,
        old_value=None,
        new_value=_serialize(report),
    )

    return {
        "created": True,
        "lab_report": _serialize(report),
    }


def update_lab_report(
    db: Session,
    current_user: models.User,
    lab_report_id: str,
    fields: dict,
) -> dict:
    report = (
        db.query(models.LabReport)
        .filter(
            models.LabReport.id == lab_report_id
        )
        .first()
    )

    if not report:
        return {
            "error": (
                f"No lab report with id "
                f"'{lab_report_id}' exists."
            )
        }

    error = _validate_fields(
        fields,
        LAB_REPORT_WRITABLE_FIELDS,
        "lab report",
    )

    if error:
        return {"error": error}

    try:
        validated = schemas.LabReportUpdate(
            **fields
        ).model_dump(exclude_unset=True)
    except Exception as exc:
        return {
            "error": f"Invalid lab report fields: {exc}"
        }

    old_value = {
        key: getattr(report, key)
        for key in validated
    }

    for key, value in validated.items():
        setattr(report, key, value)

    db.commit()
    db.refresh(report)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="lab_report",
        entity_id=lab_report_id,
        old_value=old_value,
        new_value=validated,
    )

    return {
        "updated": True,
        "lab_report": _serialize(report),
    }


def _execute_delete_lab_report(
    db: Session,
    current_user: models.User,
    lab_report_id: str,
) -> dict:
    report = (
        db.query(models.LabReport)
        .filter(
            models.LabReport.id == lab_report_id
        )
        .first()
    )

    if not report:
        return {
            "error": (
                f"No lab report with id "
                f"'{lab_report_id}' exists."
            )
        }

    old_value = _serialize(report)

    db.delete(report)
    db.commit()

    _write_audit(
        db,
        user_email=current_user.email,
        operation="delete",
        entity="lab_report",
        entity_id=lab_report_id,
        old_value=old_value,
        new_value=None,
    )

    return {
        "deleted": True,
        "lab_report_id": lab_report_id,
    }


# ============================================================================
# PRESCRIPTIONS
# ============================================================================

def list_prescriptions(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    prescription_id: str | None = None,
) -> dict:
    q = db.query(models.Prescription)

    if patient_id:
        q = q.filter(
            models.Prescription.patientId == patient_id
        )

    if prescription_id:
        q = q.filter(
            models.Prescription.id == prescription_id
        )

    rows = q.all()

    return {
        "found": len(rows),
        "prescriptions": [
            _serialize(row)
            for row in rows
        ],
    }


def get_patient_prescriptions(
    db: Session,
    current_user: models.User,
    patient_id: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    rows = (
        db.query(models.Prescription)
        .filter(
            models.Prescription.patientId == patient_id
        )
        .order_by(
            models.Prescription.date.desc()
        )
        .all()
    )

    return {
        "patient_id": patient_id,
        "patient_name": patient.name,
        "found": len(rows),
        "prescriptions": [
            _serialize(row)
            for row in rows
        ],
    }


# Backward-compatible alias
def get_prescriptions(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    prescription_id: str | None = None,
) -> dict:
    return list_prescriptions(
        db,
        current_user,
        patient_id,
        prescription_id,
    )


def create_prescription(
    db: Session,
    current_user: models.User,
    patient_id: str,
    doctor: str,
    diagnosis: str | None = None,
    medicines: list[str] | None = None,
    dosage: str | None = None,
    frequency: str | None = None,
    duration: str | None = None,
    date: str | None = None,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    prescription_date = (
        date
        or datetime.now(timezone.utc).strftime(
            "%Y-%m-%d"
        )
    )

    try:
        payload = schemas.PrescriptionCreate(
            patientId=patient.id,
            patientName=patient.name,
            doctor=doctor,
            diagnosis=diagnosis,
            medicines=medicines or [],
            dosage=dosage,
            frequency=frequency,
            duration=duration,
            date=prescription_date,
        )
    except Exception as exc:
        return {
            "error": (
                f"Invalid prescription fields: {exc}"
            )
        }

    data = payload.model_dump()

    prescription_id = (
        data.pop("id", None)
        or generate_next_id(
            db,
            models.Prescription,
            "RX",
        )
    )

    prescription = models.Prescription(
        id=prescription_id,
        **data,
    )

    db.add(prescription)
    db.commit()
    db.refresh(prescription)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="create",
        entity="prescription",
        entity_id=prescription_id,
        old_value=None,
        new_value=_serialize(prescription),
    )

    return {
        "created": True,
        "prescription": _serialize(prescription),
    }


def update_prescription(
    db: Session,
    current_user: models.User,
    prescription_id: str,
    fields: dict,
) -> dict:
    prescription = (
        db.query(models.Prescription)
        .filter(
            models.Prescription.id == prescription_id
        )
        .first()
    )

    if not prescription:
        return {
            "error": (
                f"No prescription with id "
                f"'{prescription_id}' exists."
            )
        }

    error = _validate_fields(
        fields,
        PRESCRIPTION_WRITABLE_FIELDS,
        "prescription",
    )

    if error:
        return {"error": error}

    try:
        validated = schemas.PrescriptionUpdate(
            **fields
        ).model_dump(exclude_unset=True)
    except Exception as exc:
        return {
            "error": (
                f"Invalid prescription fields: {exc}"
            )
        }

    old_value = {
        key: getattr(prescription, key)
        for key in validated
    }

    for key, value in validated.items():
        setattr(prescription, key, value)

    db.commit()
    db.refresh(prescription)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="prescription",
        entity_id=prescription_id,
        old_value=old_value,
        new_value=validated,
    )

    return {
        "updated": True,
        "prescription": _serialize(prescription),
    }


def _execute_delete_prescription(
    db: Session,
    current_user: models.User,
    prescription_id: str,
) -> dict:
    prescription = (
        db.query(models.Prescription)
        .filter(
            models.Prescription.id == prescription_id
        )
        .first()
    )

    if not prescription:
        return {
            "error": (
                f"No prescription with id "
                f"'{prescription_id}' exists."
            )
        }

    old_value = _serialize(prescription)

    db.delete(prescription)
    db.commit()

    _write_audit(
        db,
        user_email=current_user.email,
        operation="delete",
        entity="prescription",
        entity_id=prescription_id,
        old_value=old_value,
        new_value=None,
    )

    return {
        "deleted": True,
        "prescription_id": prescription_id,
    }


# ============================================================================
# BILLING
# ============================================================================

def list_billing(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    billing_id: str | None = None,
) -> dict:
    q = db.query(models.Billing)

    if patient_id:
        q = q.filter(
            models.Billing.patientId == patient_id
        )

    if billing_id:
        q = q.filter(
            models.Billing.id == billing_id
        )

    rows = q.all()

    return {
        "found": len(rows),
        "billing": [
            _serialize(row)
            for row in rows
        ],
    }


def get_patient_billing(
    db: Session,
    current_user: models.User,
    patient_id: str,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    rows = (
        db.query(models.Billing)
        .filter(
            models.Billing.patientId == patient_id
        )
        .order_by(
            models.Billing.date.desc()
        )
        .all()
    )

    return {
        "patient_id": patient_id,
        "patient_name": patient.name,
        "found": len(rows),
        "billing": [
            _serialize(row)
            for row in rows
        ],
    }


# Backward-compatible alias
def get_billing(
    db: Session,
    current_user: models.User,
    patient_id: str | None = None,
    billing_id: str | None = None,
) -> dict:
    return list_billing(
        db,
        current_user,
        patient_id,
        billing_id,
    )


def create_bill(
    db: Session,
    current_user: models.User,
    patient_id: str,
    date: str,
    consultation: float = 0,
    lab: float = 0,
    medicine: float = 0,
    total: float | None = None,
    status: str | None = None,
) -> dict:
    patient = _find_patient(db, patient_id)

    if not patient:
        return {
            "error": f"No patient with id '{patient_id}' exists."
        }

    calculated_total = (
        total
        if total is not None
        else consultation + lab + medicine
    )

    try:
        payload = schemas.BillingCreate(
            patientId=patient.id,
            patientName=patient.name,
            consultation=consultation,
            lab=lab,
            medicine=medicine,
            total=calculated_total,
            status=status or "Pending",
            date=date,
        )
    except Exception as exc:
        return {
            "error": f"Invalid billing fields: {exc}"
        }

    data = payload.model_dump()

    billing_id = (
        data.pop("id", None)
        or generate_next_id(
            db,
            models.Billing,
            "B",
        )
    )

    bill = models.Billing(
        id=billing_id,
        **data,
    )

    db.add(bill)
    db.commit()
    db.refresh(bill)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="create",
        entity="billing",
        entity_id=billing_id,
        old_value=None,
        new_value=_serialize(bill),
    )

    return {
        "created": True,
        "billing": _serialize(bill),
    }


def update_bill(
    db: Session,
    current_user: models.User,
    billing_id: str,
    fields: dict,
) -> dict:
    bill = (
        db.query(models.Billing)
        .filter(
            models.Billing.id == billing_id
        )
        .first()
    )

    if not bill:
        return {
            "error": (
                f"No billing record with id "
                f"'{billing_id}' exists."
            )
        }

    error = _validate_fields(
        fields,
        BILLING_WRITABLE_FIELDS,
        "billing",
    )

    if error:
        return {"error": error}

    try:
        validated = schemas.BillingUpdate(
            **fields
        ).model_dump(exclude_unset=True)
    except Exception as exc:
        return {
            "error": f"Invalid billing fields: {exc}"
        }

    # Automatically recalculate total if one of the component
    # amounts changes and total was not explicitly supplied.
    if (
        "total" not in validated
        and any(
            key in validated
            for key in (
                "consultation",
                "lab",
                "medicine",
            )
        )
    ):
        consultation = validated.get(
            "consultation",
            bill.consultation or 0,
        )
        lab = validated.get(
            "lab",
            bill.lab or 0,
        )
        medicine = validated.get(
            "medicine",
            bill.medicine or 0,
        )

        validated["total"] = (
            consultation + lab + medicine
        )

    old_value = {
        key: getattr(bill, key)
        for key in validated
    }

    for key, value in validated.items():
        setattr(bill, key, value)

    db.commit()
    db.refresh(bill)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="billing",
        entity_id=billing_id,
        old_value=old_value,
        new_value=validated,
    )

    return {
        "updated": True,
        "billing": _serialize(bill),
    }


def _execute_delete_billing(
    db: Session,
    current_user: models.User,
    billing_id: str,
) -> dict:
    bill = (
        db.query(models.Billing)
        .filter(
            models.Billing.id == billing_id
        )
        .first()
    )

    if not bill:
        return {
            "error": (
                f"No billing record with id "
                f"'{billing_id}' exists."
            )
        }

    old_value = _serialize(bill)

    db.delete(bill)
    db.commit()

    _write_audit(
        db,
        user_email=current_user.email,
        operation="delete",
        entity="billing",
        entity_id=billing_id,
        old_value=old_value,
        new_value=None,
    )

    return {
        "deleted": True,
        "billing_id": billing_id,
    }


# Backward-compatible alias
_execute_delete_billing_record = _execute_delete_billing


# ============================================================================
# DEPARTMENTS
# ============================================================================

def list_departments(
    db: Session,
    current_user: models.User,
    query: str | None = None,
) -> dict:
    q = db.query(models.Department)

    if query:
        q = q.filter(
            or_(
                models.Department.id.ilike(
                    f"%{query}%"
                ),
                models.Department.name.ilike(
                    f"%{query}%"
                ),
                models.Department.description.ilike(
                    f"%{query}%"
                ),
            )
        )

    rows = q.all()

    return {
        "found": len(rows),
        "departments": [
            _serialize(row)
            for row in rows
        ],
    }


# Backward-compatible alias
def get_departments(
    db: Session,
    current_user: models.User,
    query: str | None = None,
) -> dict:
    return list_departments(
        db,
        current_user,
        query,
    )


def create_department(
    db: Session,
    current_user: models.User,
    fields: dict,
) -> dict:
    try:
        payload = schemas.DepartmentCreate(
            **fields
        )
    except Exception as exc:
        return {
            "error": (
                f"Invalid department fields: {exc}"
            )
        }

    data = payload.model_dump()

    existing = (
        db.query(models.Department)
        .filter(
            models.Department.name.ilike(
                data["name"]
            )
        )
        .first()
    )

    if existing:
        return {
            "error": (
                f"A department named "
                f"'{data['name']}' already exists."
            )
        }

    department_id = (
        data.pop("id", None)
        or generate_next_id(
            db,
            models.Department,
            "DEP",
        )
    )

    if (
        db.query(models.Department)
        .filter(
            models.Department.id == department_id
        )
        .first()
    ):
        return {
            "error": (
                f"A department with id "
                f"'{department_id}' already exists."
            )
        }

    department = models.Department(
        id=department_id,
        **data,
    )

    db.add(department)
    db.commit()
    db.refresh(department)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="create",
        entity="department",
        entity_id=department_id,
        old_value=None,
        new_value=_serialize(department),
    )

    return {
        "created": True,
        "department": _serialize(department),
    }


def update_department(
    db: Session,
    current_user: models.User,
    department_id: str,
    fields: dict,
) -> dict:
    department = (
        db.query(models.Department)
        .filter(
            models.Department.id == department_id
        )
        .first()
    )

    if not department:
        return {
            "error": (
                f"No department with id "
                f"'{department_id}' exists."
            )
        }

    error = _validate_fields(
        fields,
        DEPARTMENT_WRITABLE_FIELDS,
        "department",
    )

    if error:
        return {"error": error}

    try:
        validated = schemas.DepartmentUpdate(
            **fields
        ).model_dump(exclude_unset=True)
    except Exception as exc:
        return {
            "error": (
                f"Invalid department fields: {exc}"
            )
        }

    if "name" in validated:
        duplicate = (
            db.query(models.Department)
            .filter(
                models.Department.name.ilike(
                    validated["name"]
                ),
                models.Department.id != department_id,
            )
            .first()
        )

        if duplicate:
            return {
                "error": (
                    f"A department named "
                    f"'{validated['name']}' already exists."
                )
            }

    old_value = {
        key: getattr(department, key)
        for key in validated
    }

    for key, value in validated.items():
        setattr(department, key, value)

    db.commit()
    db.refresh(department)

    _write_audit(
        db,
        user_email=current_user.email,
        operation="update",
        entity="department",
        entity_id=department_id,
        old_value=old_value,
        new_value=validated,
    )

    return {
        "updated": True,
        "department": _serialize(department),
    }


def _execute_delete_department(
    db: Session,
    current_user: models.User,
    department_id: str,
) -> dict:
    department = (
        db.query(models.Department)
        .filter(
            models.Department.id == department_id
        )
        .first()
    )

    if not department:
        return {
            "error": (
                f"No department with id "
                f"'{department_id}' exists."
            )
        }

    old_value = _serialize(department)

    db.delete(department)
    db.commit()

    _write_audit(
        db,
        user_email=current_user.email,
        operation="delete",
        entity="department",
        entity_id=department_id,
        old_value=old_value,
        new_value=None,
    )

    return {
        "deleted": True,
        "department_id": department_id,
    }


# ============================================================================
# DIRECT TOOL DISPATCH
# ============================================================================

DIRECT_TOOLS = {
    # Patients
    "search_patient": search_patient,
    "list_patients": list_patients,
    "get_patient_details": get_patient_details,
    "get_patient_vitals": get_patient_vitals,
    "create_patient": create_patient,
    "update_patient": update_patient,
    "update_patient_vitals": update_patient_vitals,
    "get_patient_summary": get_patient_summary,
    "add_clinical_note": add_clinical_note,

    # Doctors
    "list_doctors": list_doctors,
    "search_doctor": search_doctor,
    "create_doctor": create_doctor,
    "update_doctor": update_doctor,

    # Appointments
    "list_appointments": list_appointments,
    "search_appointments": search_appointments,
    "create_appointment": create_appointment,
    "update_appointment": update_appointment,

    # Lab reports
    "list_lab_reports": list_lab_reports,
    "get_patient_lab_reports": get_patient_lab_reports,
    "create_lab_report": create_lab_report,
    "update_lab_report": update_lab_report,

    # Prescriptions
    "list_prescriptions": list_prescriptions,
    "get_patient_prescriptions": get_patient_prescriptions,
    "create_prescription": create_prescription,
    "update_prescription": update_prescription,

    # Billing
    "list_billing": list_billing,
    "get_patient_billing": get_patient_billing,
    "create_bill": create_bill,
    "update_bill": update_bill,

    # Departments
    "list_departments": list_departments,
    "create_department": create_department,
    "update_department": update_department,
}


# ============================================================================
# CONFIRMATION EXECUTORS
# ============================================================================

CONFIRM_EXECUTORS = {
    "delete_patient": _execute_delete_patient,
    "delete_doctor": _execute_delete_doctor,
    "delete_appointment": _execute_delete_appointment,
    "delete_lab_report": _execute_delete_lab_report,
    "delete_prescription": _execute_delete_prescription,
    "delete_billing": _execute_delete_billing,
    "delete_billing_record": _execute_delete_billing,
    "delete_department": _execute_delete_department,
}


ALL_TOOL_NAMES = (
    set(DIRECT_TOOLS)
    | set(CONFIRM_EXECUTORS)
)


# ============================================================================
# GEMINI TOOL DECLARATIONS
# ============================================================================

TOOL_DECLARATIONS: list[dict] = [

    # ------------------------------------------------------------------------
    # PATIENTS
    # ------------------------------------------------------------------------

    {
        "name": "search_patient",
        "description": (
            "Search patients by name, patient ID, or MRN. "
            "Use this whenever the user refers to a patient by name "
            "and the exact patient ID is not already known. "
            "If multiple patients match, do not guess."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "Patient name, patient ID, or MRN."
                    ),
                }
            },
            "required": ["query"],
        },
    },

    {
        "name": "list_patients",
        "description": (
            "List or filter patients. Use for requests such as "
            "'show critical patients', 'waiting patients', "
            "'patients of Dr Sharma', or department-based patient lists."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "severity": {"type": "string"},
                "doctor": {"type": "string"},
                "department": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },

    {
        "name": "get_patient_details",
        "description": (
            "Get the complete database record for one exact patient."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"}
            },
            "required": ["patient_id"],
        },
    },

    {
        "name": "get_patient_vitals",
        "description": (
            "Get the current vital signs of a patient."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"}
            },
            "required": ["patient_id"],
        },
    },

    {
        "name": "create_patient",
        "description": (
            "Create/register a new patient. "
            "The patient name is required. "
            "Use only information explicitly provided by the user."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "fields": {
                    "type": "object",
                    "description": (
                        "PatientCreate fields."
                    ),
                }
            },
            "required": ["fields"],
        },
    },

    {
        "name": "update_patient",
        "description": (
            "Update an existing patient's demographic or clinical "
            "record fields. Do not use for individual vital signs; "
            "use update_patient_vitals instead."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": ["patient_id", "fields"],
        },
    },

    {
        "name": "update_patient_vitals",
        "description": (
            "Update one or more patient vital signs: bp, hr, temp, "
            "spo2, rr. Unspecified vitals remain unchanged."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "vitals": {
                    "type": "object",
                    "properties": {
                        "bp": {"type": "string"},
                        "hr": {"type": "integer"},
                        "temp": {"type": "number"},
                        "spo2": {"type": "integer"},
                        "rr": {"type": "integer"},
                    },
                },
            },
            "required": ["patient_id", "vitals"],
        },
    },

    {
        "name": "get_patient_summary",
        "description": (
            "Get a complete patient summary containing patient details, "
            "latest lab report, latest prescription, and upcoming appointments."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"}
            },
            "required": ["patient_id"],
        },
    },

    {
        "name": "add_clinical_note",
        "description": (
            "Append a timestamped clinical note to a patient's "
            "medical history without deleting existing history."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "note": {"type": "string"},
            },
            "required": ["patient_id", "note"],
        },
    },

    {
        "name": "delete_patient",
        "description": (
            "Permanently delete a patient. "
            "This is destructive and requires explicit confirmation "
            "before execution."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"}
            },
            "required": ["patient_id"],
        },
    },

    # ------------------------------------------------------------------------
    # DOCTORS
    # ------------------------------------------------------------------------

    {
        "name": "search_doctor",
        "description": (
            "Search doctors by name, ID, department, or specialization. "
            "Use this when the user refers to a doctor by name."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            },
            "required": ["query"],
        },
    },

    {
        "name": "list_doctors",
        "description": (
            "List doctors. Optionally filter using a search query."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            },
        },
    },

    {
        "name": "create_doctor",
        "description": (
            "Create a new doctor using DoctorCreate fields."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "fields": {"type": "object"}
            },
            "required": ["fields"],
        },
    },

    {
        "name": "update_doctor",
        "description": (
            "Update an existing doctor's name, specialization, "
            "department, availability, phone, email, or other allowed fields."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doctor_id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": ["doctor_id", "fields"],
        },
    },

    {
        "name": "delete_doctor",
        "description": (
            "Permanently delete a doctor. "
            "Requires explicit confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doctor_id": {"type": "string"}
            },
            "required": ["doctor_id"],
        },
    },

    # ------------------------------------------------------------------------
    # APPOINTMENTS
    # ------------------------------------------------------------------------

    {
        "name": "list_appointments",
        "description": (
            "List appointments. Can be filtered by patient ID "
            "or appointment ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "appointment_id": {"type": "string"},
            },
        },
    },

    {
        "name": "search_appointments",
        "description": (
            "Search appointments using natural search text such as "
            "patient name, doctor name, date, appointment status, "
            "appointment type, appointment ID, or patient ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            },
            "required": ["query"],
        },
    },

    {
        "name": "create_appointment",
        "description": (
            "Create an appointment for an existing patient. "
            "Resolve the patient first when the user gives a patient name."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "doctor": {"type": "string"},
                "date": {"type": "string"},
                "time": {"type": "string"},
                "type": {"type": "string"},
                "status": {"type": "string"},
            },
            "required": [
                "patient_id",
                "doctor",
                "date",
                "time",
            ],
        },
    },

    {
        "name": "update_appointment",
        "description": (
            "Update appointment doctor, date, time, type, status, "
            "or patient information."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": [
                "appointment_id",
                "fields",
            ],
        },
    },

    {
        "name": "delete_appointment",
        "description": (
            "Permanently delete an appointment. "
            "Requires explicit confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string"}
            },
            "required": ["appointment_id"],
        },
    },

    # ------------------------------------------------------------------------
    # LAB REPORTS
    # ------------------------------------------------------------------------

    {
        "name": "list_lab_reports",
        "description": (
            "List lab reports, optionally filtered by patient ID "
            "or lab report ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "lab_report_id": {"type": "string"},
            },
        },
    },

    {
        "name": "get_patient_lab_reports",
        "description": (
            "Get all lab reports belonging to one patient. "
            "Use after resolving a patient name to patient ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"}
            },
            "required": ["patient_id"],
        },
    },

    {
        "name": "create_lab_report",
        "description": (
            "Create a lab report for an existing patient. "
            "Use only test/result information explicitly provided."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "test": {"type": "string"},
                "date": {"type": "string"},
                "doctor": {"type": "string"},
                "result": {"type": "string"},
                "status": {"type": "string"},
                "normal_range": {"type": "string"},
            },
            "required": [
                "patient_id",
                "test",
                "date",
                "doctor",
            ],
        },
    },

    {
        "name": "update_lab_report",
        "description": (
            "Update an existing lab report."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "lab_report_id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": [
                "lab_report_id",
                "fields",
            ],
        },
    },

    {
        "name": "delete_lab_report",
        "description": (
            "Permanently delete a lab report. "
            "Requires explicit confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "lab_report_id": {"type": "string"}
            },
            "required": ["lab_report_id"],
        },
    },

    # ------------------------------------------------------------------------
    # PRESCRIPTIONS
    # ------------------------------------------------------------------------

    {
        "name": "list_prescriptions",
        "description": (
            "List prescriptions, optionally filtered by patient "
            "or prescription ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "prescription_id": {"type": "string"},
            },
        },
    },

    {
        "name": "get_patient_prescriptions",
        "description": (
            "Get prescriptions belonging to a specific patient."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"}
            },
            "required": ["patient_id"],
        },
    },

    {
        "name": "create_prescription",
        "description": (
            "Create a prescription using only medicine, diagnosis, "
            "dosage and treatment information explicitly supplied by "
            "the authenticated user. Never invent medication."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "doctor": {"type": "string"},
                "diagnosis": {"type": "string"},
                "medicines": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "dosage": {"type": "string"},
                "frequency": {"type": "string"},
                "duration": {"type": "string"},
                "date": {"type": "string"},
            },
            "required": [
                "patient_id",
                "doctor",
            ],
        },
    },

    {
        "name": "update_prescription",
        "description": (
            "Update an existing prescription."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "prescription_id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": [
                "prescription_id",
                "fields",
            ],
        },
    },

    {
        "name": "delete_prescription",
        "description": (
            "Permanently delete a prescription. "
            "Requires explicit confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "prescription_id": {"type": "string"}
            },
            "required": ["prescription_id"],
        },
    },

    # ------------------------------------------------------------------------
    # BILLING
    # ------------------------------------------------------------------------

    {
        "name": "list_billing",
        "description": (
            "List billing records, optionally filtered by patient "
            "or billing ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "billing_id": {"type": "string"},
            },
        },
    },

    {
        "name": "get_patient_billing",
        "description": (
            "Get billing records for a specific patient."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"}
            },
            "required": ["patient_id"],
        },
    },

    {
        "name": "create_bill",
        "description": (
            "Create a billing record for an existing patient. "
            "If total is not supplied, calculate it from consultation, "
            "lab and medicine amounts."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string"},
                "consultation": {"type": "number"},
                "lab": {"type": "number"},
                "medicine": {"type": "number"},
                "total": {"type": "number"},
                "status": {"type": "string"},
                "date": {"type": "string"},
            },
            "required": [
                "patient_id",
                "date",
            ],
        },
    },

    {
        "name": "update_bill",
        "description": (
            "Update an existing billing record. "
            "When consultation/lab/medicine changes and total is not "
            "explicitly supplied, total is recalculated automatically."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "billing_id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": [
                "billing_id",
                "fields",
            ],
        },
    },

    {
        "name": "delete_billing",
        "description": (
            "Permanently delete a billing record. "
            "Requires explicit confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "billing_id": {"type": "string"}
            },
            "required": ["billing_id"],
        },
    },

    # ------------------------------------------------------------------------
    # DEPARTMENTS
    # ------------------------------------------------------------------------

    {
        "name": "list_departments",
        "description": (
            "List hospital departments. Optionally search by department "
            "name, ID, or description."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            },
        },
    },

    {
        "name": "create_department",
        "description": (
            "Create a new hospital department. "
            "The department name is required."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "fields": {"type": "object"}
            },
            "required": ["fields"],
        },
    },

    {
        "name": "update_department",
        "description": (
            "Update an existing hospital department."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "department_id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": [
                "department_id",
                "fields",
            ],
        },
    },

    {
        "name": "delete_department",
        "description": (
            "Permanently delete a department. "
            "Requires explicit confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "department_id": {"type": "string"}
            },
            "required": ["department_id"],
        },
    },
]


# ============================================================================
# TOOL EXECUTION
# ============================================================================

def run_tool(
    tool_name: str,
    args: dict,
    db: Session,
    current_user: models.User,
) -> dict:
    """
    Execute a direct/non-destructive tool.

    Destructive tools are intentionally NOT executable through this function.
    They must be handled by the router confirmation mechanism.
    """

    if tool_name in CONFIRM_EXECUTORS:
        return {
            "error": (
                f"Tool '{tool_name}' requires explicit user "
                "confirmation before execution."
            )
        }

    fn = DIRECT_TOOLS.get(tool_name)

    if fn is None:
        return {
            "error": (
                f"Unknown or unavailable tool "
                f"'{tool_name}'."
            )
        }

    try:
        return fn(
            db,
            current_user,
            **(args or {}),
        )

    except TypeError as exc:
        db.rollback()
        return {
            "error": (
                f"Invalid arguments for "
                f"'{tool_name}': {exc}"
            )
        }

    except Exception as exc:
        db.rollback()
        return {
            "error": (
                f"Internal error running "
                f"'{tool_name}': {exc}"
            )
        }