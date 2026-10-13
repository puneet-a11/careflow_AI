"""
Lab report document attachment (upload/download/delete a scanned PDF or
image of the physical lab result).

Kept as its own small router, separate from the generic CRUD router that
already handles /api/lab-reports/* (see app/crud_factory.py), because
file upload/streaming needs UploadFile/StreamingResponse handling the
generic factory doesn't (and shouldn't) know about. Mounted at the same
prefix in main.py so from the outside it's just more routes under
/api/lab-reports/{id}/document.

Document metadata (filename/content-type/uploaded-by/at) is intentionally
NOT part of LabReportCreate/LabReportUpdate (see schemas.py) - it can
only be set through the upload endpoint below, which validates file type/
size and writes an audit log entry, the same way every other sensitive
write in this app does.
"""
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.permissions import require_permission
from app.security import get_current_user

router = APIRouter(prefix="/api/lab-reports", tags=["lab-reports"])

# Same whitelist/size limit as the AI assistant's report-analysis upload
# (app/routers/ai_assistant.py) - one consistent policy for "a scan of a
# lab result" across the app, rather than two different limits.
_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
}
_MAX_BYTES = 15 * 1024 * 1024  # 15 MB

_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "lab_reports")


def _ensure_upload_dir() -> None:
    os.makedirs(_UPLOAD_DIR, exist_ok=True)


def _extension_for(content_type: str) -> str:
    return {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }.get(content_type, "")


def _storage_path(report_id: str, content_type: str) -> str:
    # Filename is derived entirely from the report's own (already-
    # validated, server-generated) id and a fixed extension list - never
    # from the client-supplied filename - so there's no path-traversal
    # surface here regardless of what the uploader names their file.
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", report_id)
    return os.path.join(_UPLOAD_DIR, f"{safe_id}{_extension_for(content_type)}")


def _get_report_or_404(db: Session, report_id: str) -> models.LabReport:
    report = db.query(models.LabReport).filter(models.LabReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Lab report not found")
    return report


@router.post(
    "/{report_id}/document",
    response_model=None,
    dependencies=[Depends(require_permission("lab-reports", "edit"))],
)
async def upload_document(
    report_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    report = _get_report_or_404(db, report_id)

    if file.content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{file.content_type}'. Supported: PDF, PNG, JPEG, WEBP.",
        )

    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large. Maximum size is 15 MB.",
        )
    if not data:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    _ensure_upload_dir()
    path = _storage_path(report_id, file.content_type)

    # Replace any previous document for this report (a re-upload/
    # correction) rather than accumulating orphaned files.
    if report.documentFilename:
        old_path = _storage_path(report_id, report.documentContentType or "")
        if old_path != path and os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    with open(path, "wb") as f:
        f.write(data)

    report.documentFilename = file.filename or f"{report_id}{_extension_for(file.content_type)}"
    report.documentContentType = file.content_type
    report.documentUploadedAt = datetime.now(timezone.utc).isoformat()
    report.documentUploadedBy = current_user.email

    db.add(
        models.AuditLog(
            timestamp=datetime.now(timezone.utc),
            user_email=current_user.email,
            operation="upload_document",
            entity="lab-reports",
            entity_id=report_id,
            old_value=None,
            new_value={"documentFilename": report.documentFilename, "documentContentType": file.content_type},
            ai_initiated=False,
        )
    )
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "documentFilename": report.documentFilename,
        "documentContentType": report.documentContentType,
        "documentUploadedAt": report.documentUploadedAt,
        "documentUploadedBy": report.documentUploadedBy,
    }


@router.get(
    "/{report_id}/document",
    dependencies=[Depends(require_permission("lab-reports", "view"))],
)
def download_document(report_id: str, db: Session = Depends(get_db)):
    report = _get_report_or_404(db, report_id)
    if not report.documentFilename or not report.documentContentType:
        raise HTTPException(status_code=404, detail="This lab report has no attached document.")

    path = _storage_path(report_id, report.documentContentType)
    if not os.path.exists(path):
        # Metadata says a document should exist but the file is missing
        # (e.g. disk cleared, volume not persisted) - tell the truth
        # rather than a generic 404 that looks like "never uploaded".
        raise HTTPException(status_code=410, detail="The attached document file is no longer available on the server.")

    with open(path, "rb") as f:
        data = f.read()

    safe_name = re.sub(r'[\r\n"]', "", report.documentFilename)
    return Response(
        content=data,
        media_type=report.documentContentType,
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.delete(
    "/{report_id}/document",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("lab-reports", "edit"))],
)
def delete_document(report_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    report = _get_report_or_404(db, report_id)
    if not report.documentFilename:
        raise HTTPException(status_code=404, detail="This lab report has no attached document.")

    path = _storage_path(report_id, report.documentContentType or "")
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass

    db.add(
        models.AuditLog(
            timestamp=datetime.now(timezone.utc),
            user_email=current_user.email,
            operation="delete_document",
            entity="lab-reports",
            entity_id=report_id,
            old_value={"documentFilename": report.documentFilename},
            new_value=None,
            ai_initiated=False,
        )
    )

    report.documentFilename = None
    report.documentContentType = None
    report.documentUploadedAt = None
    report.documentUploadedBy = None
    db.commit()
    return None
