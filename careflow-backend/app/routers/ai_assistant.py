from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import gemini_assistant, models, schemas
from app.database import get_db
from app.security import get_current_user

router = APIRouter(prefix="/api/ai-assistant", tags=["ai-assistant"])

# Report analysis: keep this conservative - only formats Gemini can read
# natively (PDF + common image types) plus plain text.
_ALLOWED_REPORT_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
}
_MAX_REPORT_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("/chat", response_model=schemas.ChatResponse)
def chat(
    payload: schemas.ChatRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = gemini_assistant.chat(
        db, current_user, payload.message, channel=payload.channel,
    )
    return schemas.ChatResponse(
        response=result.text,
        data_changed=result.data_changed,
        affected_entities=sorted(result.affected_entities),
        affected_patient_id=result.affected_patient_id,
    )


@router.get("/history", response_model=schemas.ChatHistoryResponse)
def get_history(
    limit: int = 50,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns this user's persisted chat transcript (most recent first
    capped at `limit`, then returned in chronological order) - lets the
    frontend restore chat history after a page reload or server restart."""
    limit = max(1, min(limit, 200))
    rows = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.user_email == current_user.email)
        .order_by(models.ChatMessage.timestamp.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return schemas.ChatHistoryResponse(messages=[
        schemas.ChatHistoryItem(
            role=r.role, content=r.content, patient_id=r.patient_id,
            timestamp=r.timestamp.isoformat() if r.timestamp else "",
        )
        for r in rows
    ])


@router.delete("/history", status_code=204)
def delete_history(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.ChatMessage).filter(
        models.ChatMessage.user_email == current_user.email
    ).delete(synchronize_session=False)
    db.commit()
    gemini_assistant.reset_session(current_user.email)


@router.post("/reset")
def reset_conversation(current_user: models.User = Depends(get_current_user)):
    """Clears this user's assistant conversation memory and any pending
    confirmation - useful if the frontend adds a 'New chat' button."""
    gemini_assistant.reset_session(current_user.email)
    return {"detail": "Conversation reset."}


@router.post("/analyze-report", response_model=schemas.ChatResponse)
async def analyze_report(
    file: UploadFile = File(...),
    question: str | None = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.content_type not in _ALLOWED_REPORT_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file type '{file.content_type}'. Supported: PDF, PNG, JPEG, "
                f"WEBP, and plain text."
            ),
        )
    data = await file.read()
    if len(data) > _MAX_REPORT_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB).")
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    reply = gemini_assistant.analyze_report(
        db, current_user, data, file.content_type, file.filename or "report", question,
    )
    return schemas.ChatResponse(response=reply)
