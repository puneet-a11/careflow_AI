"""
OPD registration/queue.

An OPDVisit is a single walk-in visit for one day: patient checks in at
the front desk (a queue token is generated for that date), gets called
in for consultation, and the visit is marked completed. This is
deliberately separate from Appointment (a scheduled slot booked ahead
of time) - OPD is the same-day walk-in flow hospitals actually run
their front desk on.
"""
from datetime import datetime, timezone, date as date_cls

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud_factory import _next_id
from app.database import get_db
from app.permissions import require_permission
from app.security import get_current_user

router = APIRouter(prefix="/api/opd", tags=["opd"])


def _today() -> str:
    return date_cls.today().isoformat()


def _next_token(db: Session, visit_date: str) -> int:
    """Token numbers reset every day - highest token already issued for
    that date, plus one."""
    rows = db.query(models.OPDVisit.tokenNumber).filter(models.OPDVisit.date == visit_date).all()
    max_token = max([r[0] for r in rows if r[0] is not None], default=0)
    return max_token + 1


@router.get("", response_model=list[schemas.OPDVisitOut], dependencies=[Depends(require_permission("opd", "view"))])
def list_visits(date: str | None = None, status_filter: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.OPDVisit)
    if date:
        query = query.filter(models.OPDVisit.date == date)
    if status_filter:
        query = query.filter(models.OPDVisit.status == status_filter)
    return query.order_by(models.OPDVisit.date.desc(), models.OPDVisit.tokenNumber.asc()).all()


@router.get("/{visit_id}", response_model=schemas.OPDVisitOut, dependencies=[Depends(require_permission("opd", "view"))])
def get_visit(visit_id: str, db: Session = Depends(get_db)):
    visit = db.query(models.OPDVisit).filter(models.OPDVisit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="OPD visit not found")
    return visit


@router.post("", response_model=schemas.OPDVisitOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("opd", "create"))])
def check_in(payload: schemas.OPDVisitCreate, db: Session = Depends(get_db)):
    """Register a walk-in: assigns the next queue token for the day."""
    data = payload.model_dump()
    visit_id = data.pop("id", None) or _next_id(db, models.OPDVisit, "OPD")
    visit_date = data.get("date") or _today()
    data["date"] = visit_date

    visit = models.OPDVisit(
        id=visit_id,
        tokenNumber=_next_token(db, visit_date),
        checkedInAt=datetime.now(timezone.utc).isoformat(),
        **data,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return visit


@router.put("/{visit_id}", response_model=schemas.OPDVisitOut, dependencies=[Depends(require_permission("opd", "edit"))])
def update_visit(visit_id: str, payload: schemas.OPDVisitUpdate, db: Session = Depends(get_db)):
    visit = db.query(models.OPDVisit).filter(models.OPDVisit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="OPD visit not found")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(visit, field, value)
    db.commit()
    db.refresh(visit)
    return visit


@router.post("/{visit_id}/call", response_model=schemas.OPDVisitOut, dependencies=[Depends(require_permission("opd", "edit"))])
def call_next(visit_id: str, db: Session = Depends(get_db)):
    """Move a waiting patient into consultation."""
    visit = db.query(models.OPDVisit).filter(models.OPDVisit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="OPD visit not found")
    if visit.status != "Waiting":
        raise HTTPException(status_code=400, detail=f"Visit is '{visit.status}', not 'Waiting'.")
    visit.status = "In Consultation"
    visit.calledAt = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(visit)
    return visit


@router.post("/{visit_id}/complete", response_model=schemas.OPDVisitOut, dependencies=[Depends(require_permission("opd", "edit"))])
def complete_visit(visit_id: str, db: Session = Depends(get_db)):
    visit = db.query(models.OPDVisit).filter(models.OPDVisit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="OPD visit not found")
    if visit.status == "Completed":
        raise HTTPException(status_code=400, detail="Visit is already completed.")
    visit.status = "Completed"
    visit.completedAt = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(visit)
    return visit


@router.delete("/{visit_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("opd", "delete"))])
def cancel_visit(visit_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    visit = db.query(models.OPDVisit).filter(models.OPDVisit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="OPD visit not found")
    visit.status = "Cancelled"
    db.commit()
    return None
