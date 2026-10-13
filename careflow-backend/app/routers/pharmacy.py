"""
Pharmacy inventory: stock, batch tracking, expiry and low-stock alerts.

Each Medicine row is one batch. Stock only ever changes through
adjust_stock() below (never a raw PUT on quantity) so every movement
gets a StockTransaction audit row - "who took how much of what, when,
and why" is always answerable.
"""
from datetime import datetime, timezone, date as date_cls, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud_factory import _next_id
from app.database import get_db
from app.permissions import require_permission
from app.security import get_current_user

router = APIRouter(prefix="/api/pharmacy", tags=["pharmacy"])

EXPIRY_WARNING_DAYS = 30


@router.get("/medicines", response_model=list[schemas.MedicineOut], dependencies=[Depends(require_permission("pharmacy", "view"))])
def list_medicines(low_stock_only: bool = False, expiring_only: bool = False, db: Session = Depends(get_db)):
    items = db.query(models.Medicine).all()
    if low_stock_only:
        items = [m for m in items if m.quantity <= m.reorderLevel]
    if expiring_only:
        cutoff = (date_cls.today() + timedelta(days=EXPIRY_WARNING_DAYS)).isoformat()
        items = [m for m in items if m.expiryDate and m.expiryDate <= cutoff]
    return items


@router.get("/medicines/{medicine_id}", response_model=schemas.MedicineOut, dependencies=[Depends(require_permission("pharmacy", "view"))])
def get_medicine(medicine_id: str, db: Session = Depends(get_db)):
    medicine = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return medicine


@router.post("/medicines", response_model=schemas.MedicineOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("pharmacy", "create"))])
def add_medicine(payload: schemas.MedicineCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Adds a new medicine/batch. Starting quantity is logged as an
    initial 'IN' stock transaction, same as any later restock."""
    data = payload.model_dump()
    medicine_id = data.pop("id", None) or _next_id(db, models.Medicine, "MED")
    medicine = models.Medicine(id=medicine_id, **data)
    db.add(medicine)

    if medicine.quantity:
        db.add(models.StockTransaction(
            id=_next_id(db, models.StockTransaction, "TXN"),
            medicineId=medicine_id, medicineName=medicine.name, type="IN",
            quantity=medicine.quantity, reason="Initial stock",
            performedBy=current_user.email, date=datetime.now(timezone.utc).isoformat(),
        ))

    db.commit()
    db.refresh(medicine)
    return medicine


@router.put("/medicines/{medicine_id}", response_model=schemas.MedicineOut, dependencies=[Depends(require_permission("pharmacy", "edit"))])
def update_medicine(medicine_id: str, payload: schemas.MedicineUpdate, db: Session = Depends(get_db)):
    """Edits descriptive fields only - use /stock to change quantity so
    every change to the count is audited."""
    medicine = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(medicine, field, value)
    db.commit()
    db.refresh(medicine)
    return medicine


@router.post("/medicines/{medicine_id}/stock", response_model=schemas.MedicineOut, dependencies=[Depends(require_permission("pharmacy", "edit"))])
def adjust_stock(medicine_id: str, payload: schemas.StockAdjustRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """type='IN' (restock), 'OUT' (dispense to a patient), or
    'ADJUSTMENT' (correction/write-off - quantity can be negative)."""
    medicine = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    if payload.type == "IN":
        medicine.quantity += abs(payload.quantity)
    elif payload.type == "OUT":
        if abs(payload.quantity) > medicine.quantity:
            raise HTTPException(status_code=400, detail=f"Only {medicine.quantity} {medicine.unit}(s) of '{medicine.name}' in stock.")
        medicine.quantity -= abs(payload.quantity)
    else:  # ADJUSTMENT - quantity is a signed delta
        new_quantity = medicine.quantity + payload.quantity
        if new_quantity < 0:
            raise HTTPException(status_code=400, detail="Adjustment would make stock negative.")
        medicine.quantity = new_quantity

    db.add(models.StockTransaction(
        id=_next_id(db, models.StockTransaction, "TXN"),
        medicineId=medicine_id, medicineName=medicine.name, type=payload.type,
        quantity=payload.quantity, reason=payload.reason, patientId=payload.patientId,
        performedBy=current_user.email, date=datetime.now(timezone.utc).isoformat(),
    ))

    db.commit()
    db.refresh(medicine)
    return medicine


@router.delete("/medicines/{medicine_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("pharmacy", "delete"))])
def delete_medicine(medicine_id: str, db: Session = Depends(get_db)):
    medicine = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    db.delete(medicine)
    db.commit()
    return None


@router.get("/transactions", response_model=list[schemas.StockTransactionOut], dependencies=[Depends(require_permission("pharmacy", "view"))])
def list_transactions(medicine_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.StockTransaction)
    if medicine_id:
        query = query.filter(models.StockTransaction.medicineId == medicine_id)
    return query.order_by(models.StockTransaction.date.desc()).all()
