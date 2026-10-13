"""
IPD / Admission - ward, room and bed allocation, and the discharge
workflow.

Bed.status is kept in sync here rather than being editable directly:
admitting a patient marks their bed Occupied, discharging frees it back
to Available. Ward/Bed master data (create/edit/delete) is admin-only
via the 'wards' permission module; day-to-day admit/discharge uses the
'ipd' module so doctors/nurses can operate it without ward-management
rights.
"""
from datetime import datetime, timezone, date as date_cls

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud_factory import _next_id
from app.database import get_db
from app.permissions import require_permission
from app.security import get_current_user

router = APIRouter(tags=["ipd"])


# ---------------------------------------------------------------- Wards

@router.get("/api/wards", response_model=list[schemas.WardOut], dependencies=[Depends(require_permission("wards", "view"))])
def list_wards(db: Session = Depends(get_db)):
    return db.query(models.Ward).all()


@router.post("/api/wards", response_model=schemas.WardOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("wards", "create"))])
def create_ward(payload: schemas.WardCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    ward_id = data.pop("id", None) or _next_id(db, models.Ward, "W")
    if db.query(models.Ward).filter(models.Ward.id == ward_id).first():
        raise HTTPException(status_code=400, detail=f"Ward '{ward_id}' already exists")
    ward = models.Ward(id=ward_id, **data)
    db.add(ward)
    db.commit()
    db.refresh(ward)
    return ward


@router.put("/api/wards/{ward_id}", response_model=schemas.WardOut, dependencies=[Depends(require_permission("wards", "edit"))])
def update_ward(ward_id: str, payload: schemas.WardUpdate, db: Session = Depends(get_db)):
    ward = db.query(models.Ward).filter(models.Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ward, field, value)
    db.commit()
    db.refresh(ward)
    return ward


@router.delete("/api/wards/{ward_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("wards", "delete"))])
def delete_ward(ward_id: str, db: Session = Depends(get_db)):
    ward = db.query(models.Ward).filter(models.Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    if db.query(models.Bed).filter(models.Bed.wardId == ward_id).first():
        raise HTTPException(status_code=400, detail="Remove this ward's beds before deleting it.")
    db.delete(ward)
    db.commit()
    return None


# ----------------------------------------------------------------- Beds

@router.get("/api/beds", response_model=list[schemas.BedOut], dependencies=[Depends(require_permission("wards", "view"))])
def list_beds(ward_id: str | None = None, available_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(models.Bed)
    if ward_id:
        query = query.filter(models.Bed.wardId == ward_id)
    if available_only:
        query = query.filter(models.Bed.status == "Available")
    return query.all()


@router.post("/api/beds", response_model=schemas.BedOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("wards", "create"))])
def create_bed(payload: schemas.BedCreate, db: Session = Depends(get_db)):
    if not db.query(models.Ward).filter(models.Ward.id == payload.wardId).first():
        raise HTTPException(status_code=400, detail="wardId does not refer to an existing ward")
    data = payload.model_dump()
    bed_id = data.pop("id", None) or _next_id(db, models.Bed, "BED")
    bed = models.Bed(id=bed_id, status="Available", **data)
    db.add(bed)
    db.commit()
    db.refresh(bed)
    return bed


@router.put("/api/beds/{bed_id}", response_model=schemas.BedOut, dependencies=[Depends(require_permission("wards", "edit"))])
def update_bed(bed_id: str, payload: schemas.BedUpdate, db: Session = Depends(get_db)):
    bed = db.query(models.Bed).filter(models.Bed.id == bed_id).first()
    if not bed:
        raise HTTPException(status_code=404, detail="Bed not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(bed, field, value)
    db.commit()
    db.refresh(bed)
    return bed


@router.delete("/api/beds/{bed_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("wards", "delete"))])
def delete_bed(bed_id: str, db: Session = Depends(get_db)):
    bed = db.query(models.Bed).filter(models.Bed.id == bed_id).first()
    if not bed:
        raise HTTPException(status_code=404, detail="Bed not found")
    if bed.status == "Occupied":
        raise HTTPException(status_code=400, detail="Cannot delete an occupied bed.")
    db.delete(bed)
    db.commit()
    return None


# ------------------------------------------------------------ Admissions

@router.get("/api/admissions", response_model=list[schemas.AdmissionOut], dependencies=[Depends(require_permission("ipd", "view"))])
def list_admissions(status_filter: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Admission)
    if status_filter:
        query = query.filter(models.Admission.status == status_filter)
    return query.order_by(models.Admission.admissionDate.desc()).all()


@router.get("/api/admissions/{admission_id}", response_model=schemas.AdmissionOut, dependencies=[Depends(require_permission("ipd", "view"))])
def get_admission(admission_id: str, db: Session = Depends(get_db)):
    admission = db.query(models.Admission).filter(models.Admission.id == admission_id).first()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")
    return admission


@router.post("/api/admissions", response_model=schemas.AdmissionOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("ipd", "create"))])
def admit_patient(payload: schemas.AdmissionCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    bed_id = data.get("bedId")

    bed = None
    if bed_id:
        bed = db.query(models.Bed).filter(models.Bed.id == bed_id).first()
        if not bed:
            raise HTTPException(status_code=400, detail="bedId does not refer to an existing bed")
        if bed.status != "Available":
            raise HTTPException(status_code=400, detail=f"Bed '{bed_id}' is not available (status: {bed.status}).")

    admission_id = data.pop("id", None) or _next_id(db, models.Admission, "ADM")
    data["admissionDate"] = data.get("admissionDate") or date_cls.today().isoformat()

    admission = models.Admission(id=admission_id, status="Admitted", **data)
    db.add(admission)

    if bed:
        bed.status = "Occupied"

    # Reflect the admission on the patient record too, mirroring how the
    # rest of the app already tracks a patient's current status.
    patient = db.query(models.Patient).filter(models.Patient.id == data.get("patientId")).first()
    if patient:
        patient.status = "Admitted"

    db.commit()
    db.refresh(admission)
    return admission


@router.put("/api/admissions/{admission_id}", response_model=schemas.AdmissionOut, dependencies=[Depends(require_permission("ipd", "edit"))])
def update_admission(admission_id: str, payload: schemas.AdmissionUpdate, db: Session = Depends(get_db)):
    admission = db.query(models.Admission).filter(models.Admission.id == admission_id).first()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")
    if admission.status == "Discharged":
        raise HTTPException(status_code=400, detail="This admission has already been discharged.")

    updates = payload.model_dump(exclude_unset=True)
    new_bed_id = updates.get("bedId")

    if new_bed_id and new_bed_id != admission.bedId:
        new_bed = db.query(models.Bed).filter(models.Bed.id == new_bed_id).first()
        if not new_bed:
            raise HTTPException(status_code=400, detail="bedId does not refer to an existing bed")
        if new_bed.status != "Available":
            raise HTTPException(status_code=400, detail=f"Bed '{new_bed_id}' is not available.")
        old_bed = db.query(models.Bed).filter(models.Bed.id == admission.bedId).first()
        if old_bed:
            old_bed.status = "Available"
        new_bed.status = "Occupied"

    for field, value in updates.items():
        setattr(admission, field, value)

    db.commit()
    db.refresh(admission)
    return admission


@router.post("/api/admissions/{admission_id}/discharge", response_model=schemas.AdmissionOut, dependencies=[Depends(require_permission("ipd", "edit"))])
def discharge_patient(admission_id: str, payload: schemas.DischargeRequest, db: Session = Depends(get_db)):
    admission = db.query(models.Admission).filter(models.Admission.id == admission_id).first()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")
    if admission.status == "Discharged":
        raise HTTPException(status_code=400, detail="This admission has already been discharged.")

    admission.status = "Discharged"
    admission.dischargeDate = payload.dischargeDate or date_cls.today().isoformat()
    admission.dischargeSummary = payload.dischargeSummary

    if admission.bedId:
        bed = db.query(models.Bed).filter(models.Bed.id == admission.bedId).first()
        if bed:
            bed.status = "Available"

    patient = db.query(models.Patient).filter(models.Patient.id == admission.patientId).first()
    if patient:
        patient.status = "Discharged"

    db.commit()
    db.refresh(admission)
    return admission
