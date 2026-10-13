import re
from datetime import datetime, timezone
from typing import Type

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.permissions import require_permission, require_admin
from app.security import get_current_user

_MAX_PAGE_SIZE = 200
_DEFAULT_PAGE_SIZE = 100


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
    """Audit trail for regular (human, non-AI) CRUD writes - mirrors the
    AI assistant's own audit logging (app/ai_tools.py) so 'who changed
    what, when' is captured regardless of which path made the change."""
    db.add(
        models.AuditLog(
            timestamp=datetime.now(timezone.utc),
            user_email=user_email,
            operation=operation,
            entity=entity,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            ai_initiated=False,
        )
    )


def _serialize(item) -> dict:
    return {c.name: getattr(item, c.name) for c in item.__table__.columns}


def _next_id(db: Session, model, prefix: str) -> str:
    """Generates ids in the same style as the frontend mock data (P006, D006, A006...)."""
    rows = db.query(model.id).all()
    max_n = 0
    for (rid,) in rows:
        m = re.match(rf"^{re.escape(prefix)}(\d+)$", str(rid))
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"{prefix}{str(max_n + 1).zfill(3)}"


def make_crud_router(
    *,
    model,
    schema_out: Type[BaseModel],
    schema_create: Type[BaseModel],
    schema_update: Type[BaseModel],
    prefix: str,
    tag: str,
    id_prefix: str,
    require_auth: bool = True,
    permission_module: str | None = None,
    soft_delete: bool = False,
    pre_delete_check=None,
) -> APIRouter:
    """Builds a full CRUD router for a SQLAlchemy model.

    pre_delete_check: optional callable(db: Session, item) -> None, run
    before a delete/archive actually happens. Raise HTTPException (e.g.
    409 Conflict) from it to block the delete - used by departments to
    refuse deletion while doctors still reference it. Left as a generic
    hook rather than special-cased in here so the one resource that
    needs this doesn't force every other resource to carry the same
    check.

    permission_module: RBAC module key (see app/permissions.py). Defaults
        to `tag` if not given. Each verb is gated by the matching action
        (view/create/edit/delete) for the current user's role - a 403 is
        raised, not silently filtered, so the frontend gets a clear signal.

    soft_delete: when True, the model MUST have isArchived / archivedAt /
        archivedBy columns. DELETE then archives instead of removing the
        row, GET list hides archived rows unless ?include_archived=true
        is passed, and two extra endpoints are added:
          POST /{id}/restore  - un-archive (same permission as 'delete')
          DELETE /{id}/purge  - actually remove the row - admin only,
                                 always, regardless of permission_module,
                                 because this is the one truly irreversible
                                 action in the whole API.
    """

    router = APIRouter(prefix=prefix, tags=[tag])
    module = permission_module or tag

    def dep(action: str):
        if not require_auth:
            return []
        return [Depends(require_permission(module, action))]

    @router.get("", response_model=list[schema_out], dependencies=dep("view"))
    def list_items(
        include_archived: bool = False,
        limit: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
    ):
        query = db.query(model)
        if soft_delete and not include_archived:
            query = query.filter(model.isArchived.is_(False))
        return query.order_by(model.id).offset(offset).limit(limit).all()

    @router.get("/{item_id}", response_model=schema_out, dependencies=dep("view"))
    def get_item(item_id: str, db: Session = Depends(get_db)):
        item = db.query(model).filter(model.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"{tag} not found")
        return item

    @router.post("", response_model=schema_out, status_code=status.HTTP_201_CREATED, dependencies=dep("create"))
    def create_item(
        payload: schema_create,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user),
    ):
        data = payload.model_dump()
        item_id = data.pop("id", None) or _next_id(db, model, id_prefix)
        if db.query(model).filter(model.id == item_id).first():
            raise HTTPException(status_code=400, detail=f"{tag} with id '{item_id}' already exists")

        # billing.total auto-calculation, mirrors what the frontend expects to display
        if "total" in schema_create.model_fields and not data.get("total"):
            data["total"] = round(
                float(data.get("consultation", 0) or 0)
                + float(data.get("lab", 0) or 0)
                + float(data.get("medicine", 0) or 0),
                2,
            )

        item = model(id=item_id, **data)
        db.add(item)
        db.commit()
        db.refresh(item)
        _write_audit(
            db, user_email=current_user.email, operation="create", entity=tag,
            entity_id=item_id, old_value=None, new_value=_serialize(item),
        )
        db.commit()
        return item

    @router.put("/{item_id}", response_model=schema_out, dependencies=dep("edit"))
    def update_item(
        item_id: str,
        payload: schema_update,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user),
    ):
        item = db.query(model).filter(model.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"{tag} not found")
        old_value = _serialize(item)
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(item, field, value)

        if hasattr(item, "total") and ("consultation" in updates or "lab" in updates or "medicine" in updates):
            item.total = round((item.consultation or 0) + (item.lab or 0) + (item.medicine or 0), 2)

        db.commit()
        db.refresh(item)
        _write_audit(
            db, user_email=current_user.email, operation="update", entity=tag,
            entity_id=item_id, old_value=old_value, new_value=_serialize(item),
        )
        db.commit()
        return item

    if soft_delete:

        @router.delete("/{item_id}", response_model=schema_out, dependencies=dep("delete"))
        def archive_item(
            item_id: str,
            db: Session = Depends(get_db),
            current_user=Depends(get_current_user),
        ):
            item = db.query(model).filter(model.id == item_id).first()
            if not item:
                raise HTTPException(status_code=404, detail=f"{tag} not found")
            if pre_delete_check:
                pre_delete_check(db, item)
            item.isArchived = True
            item.archivedAt = datetime.now(timezone.utc).isoformat()
            item.archivedBy = current_user.email
            db.commit()
            db.refresh(item)
            _write_audit(
                db, user_email=current_user.email, operation="archive", entity=tag,
                entity_id=item_id, old_value=None, new_value=_serialize(item),
            )
            db.commit()
            return item

        @router.post("/{item_id}/restore", response_model=schema_out, dependencies=dep("delete"))
        def restore_item(
            item_id: str,
            db: Session = Depends(get_db),
            current_user=Depends(get_current_user),
        ):
            item = db.query(model).filter(model.id == item_id).first()
            if not item:
                raise HTTPException(status_code=404, detail=f"{tag} not found")
            item.isArchived = False
            item.archivedAt = None
            item.archivedBy = None
            db.commit()
            db.refresh(item)
            _write_audit(
                db, user_email=current_user.email, operation="restore", entity=tag,
                entity_id=item_id, old_value=None, new_value=_serialize(item),
            )
            db.commit()
            return item

        @router.delete(
            "/{item_id}/purge",
            status_code=status.HTTP_204_NO_CONTENT,
            dependencies=[Depends(require_admin)],
        )
        def purge_item(
            item_id: str,
            db: Session = Depends(get_db),
            current_user=Depends(get_current_user),
        ):
            item = db.query(model).filter(model.id == item_id).first()
            if not item:
                raise HTTPException(status_code=404, detail=f"{tag} not found")
            if not item.isArchived:
                raise HTTPException(
                    status_code=400,
                    detail=f"Archive this {tag} before permanently deleting it.",
                )
            old_value = _serialize(item)
            db.delete(item)
            _write_audit(
                db, user_email=current_user.email, operation="purge", entity=tag,
                entity_id=item_id, old_value=old_value, new_value=None,
            )
            db.commit()
            return None

    else:

        @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=dep("delete"))
        def delete_item(
            item_id: str,
            db: Session = Depends(get_db),
            current_user=Depends(get_current_user),
        ):
            item = db.query(model).filter(model.id == item_id).first()
            if not item:
                raise HTTPException(status_code=404, detail=f"{tag} not found")
            if pre_delete_check:
                pre_delete_check(db, item)
            old_value = _serialize(item)
            db.delete(item)
            _write_audit(
                db, user_email=current_user.email, operation="delete", entity=tag,
                entity_id=item_id, old_value=old_value, new_value=None,
            )
            db.commit()
            return None

    return router
