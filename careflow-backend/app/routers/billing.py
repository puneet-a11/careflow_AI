"""
Billing - promoted out of the generic CRUD factory (see crud_factory.py)
because it's grown real business logic the generic factory shouldn't
know about: itemized line items, server-computed discount/tax/total, and
an immutable void-and-reissue workflow for finalized bills.

Core rule enforced throughout this file: totals are NEVER taken from the
client. Whatever consultation/lab/medicine/items/discount/tax values come
in, subtotal/discountAmount/taxAmount/total are always recomputed here
before anything is written to the database.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.crud_factory import _next_id, _write_audit, _serialize
from app.database import get_db
from app.permissions import require_permission
from app.security import get_current_user

router = APIRouter(prefix="/api/billing", tags=["billing"])

_MAX_PAGE_SIZE = 200
_DEFAULT_PAGE_SIZE = 100


def _compute_totals(
    subtotal: float,
    discount_type: str | None,
    discount_value: float,
    tax_type: str | None,
    tax_value: float,
) -> tuple[float, float, float]:
    """Subtotal -> Discount -> Tax -> Grand Total, always in that order.

    Tax is calculated on the post-discount amount (the common convention
    when no specific tax-jurisdiction rule is specified) - documented
    here since "tax before or after discount" is a real, sometimes
    contractual, choice and this project doesn't specify one.
    """
    discount_amount = 0.0
    if discount_type == "percentage":
        discount_amount = subtotal * (discount_value / 100)
    elif discount_type == "amount":
        discount_amount = discount_value
    # Can't discount more than the bill itself.
    discount_amount = max(0.0, min(discount_amount, subtotal))

    taxable_base = subtotal - discount_amount

    tax_amount = 0.0
    if tax_type == "percentage":
        tax_amount = taxable_base * (tax_value / 100)
    elif tax_type == "amount":
        tax_amount = tax_value
    tax_amount = max(0.0, tax_amount)

    total = taxable_base + tax_amount
    return round(discount_amount, 2), round(tax_amount, 2), round(total, 2)


def _subtotal_from_items(items) -> float:
    return round(sum((it.quantity or 0) * (it.unitPrice or 0) for it in items), 2)


def _apply_items(db: Session, bill_id: str, items_in: list[schemas.BillingItemCreate]) -> list[models.BillingItem]:
    """Replaces a bill's line items wholesale with the given list -
    simpler and safer than diffing individual item edits, and line items
    have no independent identity a client needs preserved across saves
    (no comments/history hang off a specific item row)."""
    db.query(models.BillingItem).filter(models.BillingItem.billingId == bill_id).delete()
    created = []
    for idx, item_in in enumerate(items_in):
        item = models.BillingItem(
            id=item_in.id or f"{bill_id}-item-{idx + 1}",
            billingId=bill_id,
            description=item_in.description,
            quantity=item_in.quantity,
            unitPrice=item_in.unitPrice,
            amount=round(item_in.quantity * item_in.unitPrice, 2),
            sortOrder=idx,
        )
        db.add(item)
        created.append(item)
    return created


def _get_bill_or_404(db: Session, bill_id: str) -> models.Billing:
    bill = (
        db.query(models.Billing)
        .options(joinedload(models.Billing.items))
        .filter(models.Billing.id == bill_id)
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Billing record not found")
    return bill


def _recompute_and_store(bill: models.Billing, has_items: bool) -> None:
    subtotal = _subtotal_from_items(bill.items) if has_items else round(
        (bill.consultation or 0) + (bill.lab or 0) + (bill.medicine or 0), 2
    )
    discount_amount, tax_amount, total = _compute_totals(
        subtotal, bill.discountType, bill.discountValue or 0, bill.taxType, bill.taxValue or 0
    )
    bill.subtotal = subtotal
    bill.discountAmount = discount_amount
    bill.taxAmount = tax_amount
    bill.total = total


@router.get("", response_model=list[schemas.BillingOut], dependencies=[Depends(require_permission("billing", "view"))])
def list_billing(
    limit: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Billing)
        .options(joinedload(models.Billing.items))
        .order_by(models.Billing.id)
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{bill_id}", response_model=schemas.BillingOut, dependencies=[Depends(require_permission("billing", "view"))])
def get_billing(bill_id: str, db: Session = Depends(get_db)):
    return _get_bill_or_404(db, bill_id)


@router.post("", response_model=schemas.BillingOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("billing", "create"))])
def create_billing(
    payload: schemas.BillingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    data = payload.model_dump(exclude={"items", "id"})
    items_in = payload.items or []

    replaces = None
    if payload.replacesBillId:
        replaces = db.query(models.Billing).filter(models.Billing.id == payload.replacesBillId).first()
        if not replaces:
            raise HTTPException(status_code=404, detail=f"Bill '{payload.replacesBillId}' (being replaced) not found")
        if replaces.status != "Void":
            raise HTTPException(
                status_code=409,
                detail="Can only reissue against a voided bill. Void the original first.",
            )
        if replaces.replacedByBillId:
            raise HTTPException(
                status_code=409,
                detail=f"Bill '{replaces.id}' has already been replaced by '{replaces.replacedByBillId}'.",
            )

    bill_id = payload.id or _next_id(db, models.Billing, "B")
    if db.query(models.Billing).filter(models.Billing.id == bill_id).first():
        raise HTTPException(status_code=400, detail=f"Billing record with id '{bill_id}' already exists")

    bill = models.Billing(id=bill_id, **data)
    db.add(bill)
    db.flush()  # so bill.id is available for the items' FK below

    _apply_items(db, bill_id, items_in)
    db.flush()
    db.refresh(bill)
    _recompute_and_store(bill, has_items=bool(items_in))

    if replaces:
        replaces.replacedByBillId = bill.id
        bill.replacesBillId = replaces.id

    db.commit()
    db.refresh(bill)

    _write_audit(
        db, user_email=current_user.email, operation="create", entity="billing",
        entity_id=bill_id, old_value=None, new_value=_serialize(bill),
    )
    db.commit()
    return _get_bill_or_404(db, bill_id)


@router.put("/{bill_id}", response_model=schemas.BillingOut, dependencies=[Depends(require_permission("billing", "edit"))])
def update_billing(
    bill_id: str,
    payload: schemas.BillingUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    bill = _get_bill_or_404(db, bill_id)

    if bill.status in ("Paid", "Void"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"This bill is {bill.status.lower()} and can no longer be edited directly. "
                "Void it (with a reason) and issue a corrected replacement bill instead."
            ),
        )

    old_value = _serialize(bill)
    updates = payload.model_dump(exclude_unset=True, exclude={"items"})
    for field, value in updates.items():
        setattr(bill, field, value)

    has_items = payload.items is not None
    if has_items:
        _apply_items(db, bill_id, payload.items)
        db.flush()
        db.refresh(bill)
    else:
        has_items = bool(bill.items)

    _recompute_and_store(bill, has_items=has_items)
    db.commit()
    db.refresh(bill)

    _write_audit(
        db, user_email=current_user.email, operation="update", entity="billing",
        entity_id=bill_id, old_value=old_value, new_value=_serialize(bill),
    )
    db.commit()
    return _get_bill_or_404(db, bill_id)


@router.post("/{bill_id}/void", response_model=schemas.BillingOut, dependencies=[Depends(require_permission("billing", "edit"))])
def void_billing(
    bill_id: str,
    payload: schemas.BillingVoidRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    bill = _get_bill_or_404(db, bill_id)
    if bill.status == "Void":
        raise HTTPException(status_code=409, detail="This bill is already void.")

    old_value = _serialize(bill)
    bill.status = "Void"
    bill.voidReason = payload.reason
    bill.voidedAt = datetime.now(timezone.utc).isoformat()
    bill.voidedBy = current_user.email
    db.commit()
    db.refresh(bill)

    _write_audit(
        db, user_email=current_user.email, operation="void", entity="billing",
        entity_id=bill_id, old_value=old_value, new_value=_serialize(bill),
    )
    db.commit()
    return _get_bill_or_404(db, bill_id)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("billing", "delete"))])
def delete_billing(
    bill_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    bill = _get_bill_or_404(db, bill_id)
    if bill.status in ("Paid", "Void"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"This bill is {bill.status.lower()} and is part of permanent financial history - "
                "it cannot be deleted. Void it instead if it needs to be cancelled."
            ),
        )

    old_value = _serialize(bill)
    db.delete(bill)
    _write_audit(
        db, user_email=current_user.email, operation="delete", entity="billing",
        entity_id=bill_id, old_value=old_value, new_value=None,
    )
    db.commit()
    return None
