"""
Full lab workflow: Ordered -> Sample Collected -> Processing -> Verified
(or Cancelled at any point before Verified).

Verifying an order creates the corresponding LabReport row, so the
existing lab-reports.html page keeps showing exactly what it always
has - a list of final, verified results - without any change to that
page. This router is the pipeline that now sits in front of it.
"""
from datetime import datetime, timezone, date as date_cls

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud_factory import _next_id
from app.database import get_db
from app.permissions import require_permission
from app.security import get_current_user

router = APIRouter(prefix="/api/lab-orders", tags=["lab-orders"])


@router.get("", response_model=list[schemas.LabOrderOut], dependencies=[Depends(require_permission("lab-orders", "view"))])
def list_orders(status_filter: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.LabOrder)
    if status_filter:
        query = query.filter(models.LabOrder.status == status_filter)
    return query.order_by(models.LabOrder.orderedDate.desc()).all()


@router.get("/{order_id}", response_model=schemas.LabOrderOut, dependencies=[Depends(require_permission("lab-orders", "view"))])
def get_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(models.LabOrder).filter(models.LabOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    return order


@router.post("", response_model=schemas.LabOrderOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("lab-orders", "create"))])
def create_order(payload: schemas.LabOrderCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    order_id = data.pop("id", None) or _next_id(db, models.LabOrder, "LO")
    data["orderedDate"] = data.get("orderedDate") or date_cls.today().isoformat()
    order = models.LabOrder(id=order_id, status="Ordered", **data)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.put("/{order_id}", response_model=schemas.LabOrderOut, dependencies=[Depends(require_permission("lab-orders", "edit"))])
def update_order(order_id: str, payload: schemas.LabOrderUpdate, db: Session = Depends(get_db)):
    order = db.query(models.LabOrder).filter(models.LabOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    if order.status not in ("Ordered",):
        raise HTTPException(status_code=400, detail="Only an order still 'Ordered' can be edited - cancel and re-order instead.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/collect-sample", response_model=schemas.LabOrderOut, dependencies=[Depends(require_permission("lab-orders", "edit"))])
def collect_sample(order_id: str, payload: schemas.CollectSampleRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    order = db.query(models.LabOrder).filter(models.LabOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    if order.status != "Ordered":
        raise HTTPException(status_code=400, detail=f"Order is '{order.status}', expected 'Ordered'.")
    order.status = "Sample Collected"
    order.sampleCollectedAt = datetime.now(timezone.utc).isoformat()
    order.sampleCollectedBy = payload.sampleCollectedBy or current_user.email
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/start-processing", response_model=schemas.LabOrderOut, dependencies=[Depends(require_permission("lab-orders", "edit"))])
def start_processing(order_id: str, db: Session = Depends(get_db)):
    order = db.query(models.LabOrder).filter(models.LabOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    if order.status != "Sample Collected":
        raise HTTPException(status_code=400, detail=f"Order is '{order.status}', expected 'Sample Collected'.")
    order.status = "Processing"
    order.processingStartedAt = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/verify", response_model=schemas.LabOrderOut, dependencies=[Depends(require_permission("lab-orders", "edit"))])
def verify_result(order_id: str, payload: schemas.VerifyResultRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Final pipeline step: records the result and creates the matching
    LabReport row that the rest of the app (patient details, existing
    lab-reports page) already knows how to display."""
    order = db.query(models.LabOrder).filter(models.LabOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    if order.status != "Processing":
        raise HTTPException(status_code=400, detail=f"Order is '{order.status}', expected 'Processing'.")

    now_iso = datetime.now(timezone.utc).isoformat()
    order.status = "Verified"
    order.result = payload.result
    order.normalRange = payload.normalRange
    order.resultStatus = payload.resultStatus
    order.verifiedBy = payload.verifiedBy or current_user.email
    order.verifiedAt = now_iso

    report_id = _next_id(db, models.LabReport, "L")
    report = models.LabReport(
        id=report_id, patientId=order.patientId, patientName=order.patientName,
        test=order.test, date=date_cls.today().isoformat(), doctor=order.orderedBy or "",
        result=payload.result, status=payload.resultStatus, normalRange=payload.normalRange,
    )
    db.add(report)
    order.labReportId = report_id

    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("lab-orders", "delete"))])
def cancel_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(models.LabOrder).filter(models.LabOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    if order.status == "Verified":
        raise HTTPException(status_code=400, detail="A verified order cannot be cancelled.")
    order.status = "Cancelled"
    db.commit()
    return None
