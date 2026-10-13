
"""
Gemini-powered, backend-connected CareFlow AI assistant.

Responsibilities
----------------
- Gemini system prompt
- Per-user conversation context
- Gemini function calling
- Dynamic loading of ALL tools from app.ai_tools
- Permission enforcement
- Destructive-action confirmation
- Patient conversation context
- Persistent chat logging
- Frontend data-refresh metadata
- Uploaded report analysis

IMPORTANT:
- This module does NOT use OpenAI.
- Gemini never receives raw SQL access.
- Gemini can only call functions declared by app.ai_tools.
- All database operations are executed server-side.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app import ai_tools, models
from app.config import settings
from app.permissions import has_permission


logger = logging.getLogger("careflow.ai_assistant")


# ============================================================================
# CONFIG
# ============================================================================

MAX_TOOL_ITERATIONS = 8
MAX_HISTORY_TURNS = 40
MAX_GEMINI_RETRIES = 2

# Only these classes of actions require confirmation before they execute
# (handled by the pending-confirmation flow in chat()).
DESTRUCTIVE_TOOLS = set(
    getattr(ai_tools, "DESTRUCTIVE_TOOLS", set()) or set()
)

# Every AI tool the model can call, mapped to the same (module, action)
# keys used by app/permissions.py for the regular REST endpoints. This is
# what makes the AI assistant subject to the SAME RBAC rules as the rest
# of the app instead of a separate, weaker set of hardcoded checks - a
# receptionist can no more edit a prescription through the AI chat than
# they can through prescriptions.html, and an admin/doctor can still do
# through the AI exactly what they could do through the UI.
TOOL_PERMISSIONS: dict[str, tuple[str, str]] = {
    # Patients
    "search_patient": ("patients", "view"),
    "list_patients": ("patients", "view"),
    "get_patient_details": ("patients", "view"),
    "get_patient_vitals": ("patients", "view"),
    "get_patient_summary": ("patients", "view"),
    "create_patient": ("patients", "create"),
    "update_patient": ("patients", "edit"),
    "update_patient_vitals": ("patients", "edit"),
    "add_clinical_note": ("patients", "edit"),
    "delete_patient": ("patients", "delete"),
    # Doctors
    "list_doctors": ("doctors", "view"),
    "search_doctor": ("doctors", "view"),
    "create_doctor": ("doctors", "create"),
    "update_doctor": ("doctors", "edit"),
    "delete_doctor": ("doctors", "delete"),
    # Appointments
    "list_appointments": ("appointments", "view"),
    "search_appointments": ("appointments", "view"),
    "create_appointment": ("appointments", "create"),
    "update_appointment": ("appointments", "edit"),
    "delete_appointment": ("appointments", "delete"),
    # Lab reports
    "list_lab_reports": ("lab-reports", "view"),
    "get_patient_lab_reports": ("lab-reports", "view"),
    "create_lab_report": ("lab-reports", "create"),
    "update_lab_report": ("lab-reports", "edit"),
    "delete_lab_report": ("lab-reports", "delete"),
    # Prescriptions
    "list_prescriptions": ("prescriptions", "view"),
    "get_patient_prescriptions": ("prescriptions", "view"),
    "create_prescription": ("prescriptions", "create"),
    "update_prescription": ("prescriptions", "edit"),
    "delete_prescription": ("prescriptions", "delete"),
    # Billing
    "list_billing": ("billing", "view"),
    "get_patient_billing": ("billing", "view"),
    "create_bill": ("billing", "create"),
    "update_bill": ("billing", "edit"),
    "delete_billing": ("billing", "delete"),
    "delete_billing_record": ("billing", "delete"),
    # Departments
    "list_departments": ("departments", "view"),
    "create_department": ("departments", "create"),
    "update_department": ("departments", "edit"),
    "delete_department": ("departments", "delete"),
}


# ============================================================================
# TOOL / RESOURCE MAPPING
# ============================================================================

# Known frontend cache resources.
# New tools do NOT necessarily need to be added here because the helper
# below can infer a resource from the tool name.
TOOL_ENTITY_MAP: dict[str, str] = {
    "create_patient": "patients",
    "update_patient": "patients",
    "update_patient_vitals": "patients",
    "add_clinical_note": "patients",
    "delete_patient": "patients",

    "create_doctor": "doctors",
    "update_doctor": "doctors",
    "delete_doctor": "doctors",

    "create_appointment": "appointments",
    "update_appointment": "appointments",
    "delete_appointment": "appointments",
    "cancel_appointment": "appointments",

    "create_prescription": "prescriptions",
    "update_prescription": "prescriptions",
    "delete_prescription": "prescriptions",

    "create_lab_report": "labReports",
    "update_lab_report": "labReports",
    "delete_lab_report": "labReports",

    "create_billing_record": "billing",
    "update_billing_record": "billing",
    "delete_billing_record": "billing",

    "create_department": "departments",
    "update_department": "departments",
    "delete_department": "departments",
}


# Read-only prefixes.
# Anything clearly outside these prefixes is treated as potentially
# mutating when determining frontend refresh metadata.
READ_ONLY_PREFIXES = (
    "list_",
    "search_",
    "get_",
    "find_",
    "check_",
    "view_",
    "fetch_",
    "count_",
    "summarize_",
)


def _all_tool_names() -> set[str]:
    """
    Dynamically obtain every tool name from ai_tools.

    This means adding a new function to ai_tools.py + TOOL_DECLARATIONS
    automatically makes it available to Gemini.
    """
    names = getattr(ai_tools, "ALL_TOOL_NAMES", None)

    if names:
        return set(names)

    declarations = getattr(ai_tools, "TOOL_DECLARATIONS", []) or []

    result: set[str] = set()

    for declaration in declarations:
        name = declaration.get("name")

        if name:
            result.add(name)

    return result


ALL_TOOL_NAMES = _all_tool_names()


def _is_write_tool(tool_name: str) -> bool:
    """
    Determine whether a tool potentially changes database state.

    Explicit destructive tools are always writes.

    For new tools, create/update/delete/add/assign/cancel/record/complete/
    schedule/etc. are treated as writes automatically.
    """

    if tool_name in DESTRUCTIVE_TOOLS:
        return True

    if tool_name in TOOL_ENTITY_MAP:
        return True

    lower = tool_name.lower()

    if lower.startswith(READ_ONLY_PREFIXES):
        return False

    write_keywords = (
        "create",
        "update",
        "delete",
        "add",
        "remove",
        "assign",
        "unassign",
        "cancel",
        "schedule",
        "reschedule",
        "record",
        "save",
        "set_",
        "change",
        "modify",
        "complete",
        "mark_",
        "prescribe",
    )

    return lower.startswith(write_keywords)


WRITE_TOOLS = {
    name for name in ALL_TOOL_NAMES
    if _is_write_tool(name)
}


def _infer_entity(tool_name: str) -> str | None:
    """
    Infer frontend cache resource for new tools.

    Explicit mappings always win.
    """

    if tool_name in TOOL_ENTITY_MAP:
        return TOOL_ENTITY_MAP[tool_name]

    name = tool_name.lower()

    if "patient" in name:
        return "patients"

    if "doctor" in name:
        return "doctors"

    if "appointment" in name:
        return "appointments"

    if "prescription" in name:
        return "prescriptions"

    if "lab" in name or "report" in name:
        return "labReports"

    if "billing" in name or "bill" in name:
        return "billing"

    if "department" in name:
        return "departments"

    return None


# ============================================================================
# SYSTEM PROMPT
# ============================================================================

SYSTEM_PROMPT = """
You are CareFlow AI, an intelligent hospital workflow and clinical
decision-support assistant embedded inside the CareFlow hospital management
dashboard.

You are connected to the real authenticated CareFlow backend.

Your job is to understand the user's intent naturally and use the available
backend tools when database information or database actions are required.

IMPORTANT:
The user does NOT need to know tool names.

Never tell the user:
"call search_patient"
"call list_patients"
"call get_patient_details"

Instead understand the request and select the correct tool yourself.

==================================================
CORE RULES
==================================================

1. DATABASE FACTS
- Never invent hospital database information.
- Never guess patient, doctor, appointment, prescription, lab, billing,
  department, or other record values.
- If the answer requires database information, use the appropriate backend
  tool.
- Only state database facts that were actually returned by a tool.

2. NATURAL LANGUAGE
Understand:
- English
- Hindi
- Hinglish
- spelling mistakes
- short messages
- incomplete sentences
- conversational follow-ups
- pronouns
- natural variations of the same request

Examples:

"patients dikha"
"show patients"
"patient list"
"saare patients batao"

should all be understood as a request for patient records.

"critical patients"
"kaun critical hai"
"critical wale patients dikhao"

should be understood as a filtered patient request.

"puneet ki details"
"show puneet"
"puneet patient ka complete data"
"uski report dikhao"

should be resolved using context and appropriate patient tools.

3. PATIENT CONTEXT
When a patient has been identified during the conversation, remember that
patient for follow-up requests.

Examples:
- "uski lab report dikhao"
- "iska appointment kab hai?"
- "show more"
- "prescription batao"

Use the previously resolved patient when it is unambiguous.

If multiple patients match, DO NOT randomly choose one.

Show the matching candidates and ask the user which patient they mean.

4. BROAD PATIENT REQUESTS
For requests such as:
- show patients
- all patients
- critical patients
- waiting patients
- admitted patients
- today's patients

use a list/filter tool when available.

Do not use a name-based search tool when there is no specific patient identity.

5. COMPLETE PATIENT INFORMATION
If the user asks for:
- complete information
- full details
- poori jankari
- complete summary
- everything about this patient

prefer get_patient_summary if available.

Otherwise use the relevant available patient/detail tools.

6. DOCTOR REQUESTS
Understand natural doctor queries:
- show doctors
- available doctors
- find cardiologist
- doctors in cardiology
- doctor details

Use the appropriate doctor tools.

7. APPOINTMENT REQUESTS
Understand:
- today's appointments
- Puneet appointment
- upcoming appointments
- cancel appointment
- reschedule appointment
- appointment with Dr X
- kal ka appointment

Resolve the required patient/doctor/appointment before modifying anything.

8. LAB REQUESTS
Understand:
- show lab reports
- Puneet ki reports
- latest report
- abnormal lab values
- patient's lab history

Use available lab tools.

LAB REPORT STATUS RULE:
A lab report is "Pending" until its report document has been uploaded
(document_uploaded is false). That is what the Lab Reports screen shows.
Always report `status` exactly as the tool returns it - never call a Pending
report "completed" or "done". `result_flag` (Normal/Abnormal) is only how the
entered result reads; mention it separately (e.g. "Pending - document not
uploaded yet; entered result reads Abnormal").

9. PRESCRIPTION REQUESTS
Understand:
- show prescription
- current medicines
- patient's prescription
- medicine history

Use available prescription tools.

10. BILLING REQUESTS
Understand:
- bill
- billing details
- pending bill
- patient billing history
- payment information

Use available billing tools.

11. CREATION / UPDATE
Before creating or updating a record:
- identify the correct record when required
- do not invent required values
- ask for missing required information
- validate that the requested operation makes sense

12. CLINICAL NOTES
Use add_clinical_note for saving a note.

It appends to history and must not silently overwrite previous clinical history.

If the user asks for a note but does NOT ask to save it:
- draft it in the response
- clearly label it as AI-generated draft
- do not persist it automatically

13. DESTRUCTIVE OPERATIONS
Deletion/cancellation/destructive operations require explicit confirmation.

NEVER execute a destructive action immediately.

First explain what will happen and ask for confirmation.

Accepted confirmation examples include:
yes
haan
confirm
kar do
kardo
proceed
go ahead

Cancellation examples:
no
nahi
cancel
stop
rehne do
mat karo

14. PERMISSIONS
Respect the authenticated user's role.

Never claim elevated privileges.

Only the Senior Physician can perform Senior-only operations.

If the backend says the current user is unauthorized:
- clearly tell the user
- do not retry the same unauthorized action

15. MEDICAL SAFETY
For medical questions provide decision-support/educational information.

Do not pretend to be a licensed prescribing clinician.

For medication questions:
- mention relevant safety considerations
- recommend clinician/pharmacist review

For emergencies:
- recommend immediate clinician assessment
- follow the facility's emergency protocol

16. REPORT ANALYSIS
When analyzing an uploaded report:
- only use information actually present
- do not invent missing values
- do not estimate values
- clearly state if the document cannot be read

17. SECURITY
Never reveal:
- API keys
- passwords
- tokens
- credentials
- authentication secrets
- internal security configuration

Never execute arbitrary SQL.

Never claim SQL access.

18. TOOL SELECTION
Select tools based on meaning, not exact keywords.

Do not rely on fixed prompts or canned keyword responses for database questions.

19. FOLLOW-UP QUESTIONS
If the request is genuinely ambiguous, ask a short clarification.

Do not make a risky guess.

20. RESPONSE STYLE
Reply in the same language/style as the user.

If the user speaks Hinglish, use Hinglish.

Keep normal responses concise but useful.

Clearly distinguish:
- database facts
- tool results
- medical/general reasoning
- AI-generated drafts
"""


# ============================================================================
# CONFIRMATION WORDS
# ============================================================================

_CONFIRM_WORDS = re.compile(
    r"^\s*("
    r"yes|yeah|yep|yup|sure|confirm|confirmed|proceed|go ahead|do it|"
    r"okay|ok|"
    r"haan|han|ha|theek hai|thik hai|sahi hai|kar do|kardo|karo"
    r")\s*[.!]?\s*$",
    re.IGNORECASE,
)

_CANCEL_WORDS = re.compile(
    r"^\s*("
    r"no|nope|nah|cancel|stop|don't|dont|"
    r"nahi|nahin|mat karo|rehne do"
    r")\s*[.!]?\s*$",
    re.IGNORECASE,
)


# ============================================================================
# SESSION
# ============================================================================

class _Session:
    __slots__ = (
        "history",
        "last_patient_id",
        "last_patient_name",
        "pending",
    )

    def __init__(self) -> None:
        self.history: list[dict[str, Any]] = []
        self.last_patient_id: str | None = None
        self.last_patient_name: str | None = None

        # {
        #   "tool": str,
        #   "args": dict,
        #   "description": str
        # }
        self.pending: dict[str, Any] | None = None


_SESSIONS: dict[str, _Session] = {}


def _get_session(user_email: str) -> _Session:
    return _SESSIONS.setdefault(user_email, _Session())


def reset_session(user_email: str, channel: str = "assistant") -> None:
    _SESSIONS.pop(f"{user_email}:{channel}", None)


# ============================================================================
# FALLBACK
# ============================================================================

_BOT_RESPONSES = {
    "triage": (
        "Gemini is not connected right now. Please provide the patient's "
        "chief complaint, vital signs and relevant history."
    ),
    "critical": (
        "Gemini is not connected right now, so I cannot query the live "
        "patient database."
    ),
    "symptoms": (
        "Please provide the symptoms and relevant patient information."
    ),
    "department": (
        "Please provide the patient's symptoms/complaint so I can suggest "
        "appropriate routing."
    ),
    "risk": (
        "Gemini is not connected right now, so live patient risk analysis "
        "is unavailable."
    ),
    "vitals": (
        "Please provide BP, HR, temperature, SpO2 and RR if you want "
        "general interpretation."
    ),
}


def _fallback_response(db: Session, message: str) -> str:
    """Provide safe, useful dashboard answers while Gemini is unavailable.

    These responses are deliberately read-only: they make the dashboard widget
    useful with the demo setup (which has no API key) without pretending that
    an AI model can modify or clinically assess patient records.
    """
    lower = message.lower()

    if any(term in lower for term in ("critical", "high priority", "urgent")):
        patients = (
            db.query(models.Patient)
            .filter(models.Patient.severity.in_(("Critical", "High")))
            .order_by(models.Patient.triageScore.desc())
            .limit(10)
            .all()
        )
        if not patients:
            return "There are currently no critical or high-priority patients in the live record."
        lines = [
            f"{patient.name} ({patient.id}) — {patient.severity}, triage {patient.triageScore or 'N/A'}, {patient.status or 'Unknown status'}"
            for patient in patients
        ]
        return "Live priority patient list:\n" + "\n".join(lines)

    if any(term in lower for term in ("wait", "waiting", "queue")):
        patients = (
            db.query(models.Patient)
            .filter(models.Patient.status == "Waiting")
            .order_by(models.Patient.triageScore.desc())
            .limit(10)
            .all()
        )
        if not patients:
            return "There are currently no patients marked as Waiting in the live record."
        lines = [
            f"{patient.name} ({patient.id}) — triage {patient.triageScore or 'N/A'}"
            for patient in patients
        ]
        return (
            f"{len(patients)} waiting patient(s) in the live queue:\n"
            + "\n".join(lines)
            + "\n\nThis system does not store arrival times, so it cannot calculate an exact wait duration."
        )

    if any(term in lower for term in ("start new triage", "new triage")):
        return (
            "To begin triage, send the patient's name or ID, chief complaint, "
            "BP, heart rate, temperature, SpO2, respiratory rate, and any relevant history."
        )

    for key, response in _BOT_RESPONSES.items():
        if key in lower:
            return response

    return (
        "Gemini is not connected. I can still show the live critical-patient "
        "list or waiting queue; configure GEMINI_API_KEY for full AI chat and "
        "record-management assistance."
    )


# ============================================================================
# GEMINI CLIENT
# ============================================================================

def _get_client():
    """
    Lazily create the Google Gemini client.
    """

    from google import genai

    return genai.Client(
        api_key=settings.GEMINI_API_KEY
    )


# ============================================================================
# TOOL DECLARATIONS
# ============================================================================

def _build_function_declarations():
    """
    Convert every declaration from ai_tools.py into Gemini declarations.

    IMPORTANT:
    This is intentionally dynamic.

    If you add a new tool to:
        ai_tools.TOOL_DECLARATIONS

    Gemini automatically receives it.
    """

    from google.genai import types

    declarations = []

    for declaration in getattr(ai_tools, "TOOL_DECLARATIONS", []):
        try:
            declarations.append(
                types.FunctionDeclaration(
                    name=declaration["name"],
                    description=declaration.get(
                        "description",
                        f"CareFlow operation: {declaration['name']}",
                    ),
                    parameters_json_schema=declaration.get(
                        "parameters",
                        {
                            "type": "object",
                            "properties": {},
                        },
                    ),
                )
            )
        except Exception:
            logger.exception(
                "Failed to build Gemini declaration for tool %r",
                declaration,
            )

    return declarations


# ============================================================================
# HISTORY
# ============================================================================

def _history_to_contents(history: list[dict[str, Any]]):
    """
    Convert our lightweight text history into Gemini Content objects.

    IMPORTANT DESIGN CHANGE:

    We do NOT reconstruct old Gemini function-call parts with manually
    fabricated thought signatures.

    Gemini 3 thought signatures are tied to the original model response.
    Replaying fabricated functionCall objects later can cause INVALID_ARGUMENT
    errors.

    Therefore:
    - function-call execution inside the current turn is handled directly
      using native SDK Content objects
    - persistent session history stores safe textual summaries
    """

    from google.genai import types

    contents = []

    for turn in history:
        role = turn.get("role", "user")
        text = turn.get("text")

        if not text:
            continue

        contents.append(
            types.Content(
                role=role,
                parts=[
                    types.Part.from_text(text=text)
                ],
            )
        )

    return contents


def _trim_history(session: _Session) -> None:
    if len(session.history) <= MAX_HISTORY_TURNS:
        return

    session.history = session.history[-MAX_HISTORY_TURNS:]


def _add_history(
    session: _Session,
    role: str,
    text: str,
) -> None:
    if not text:
        return

    session.history.append(
        {
            "role": role,
            "text": text,
        }
    )

    _trim_history(session)


# ============================================================================
# RESPONSE HELPERS
# ============================================================================

def _extract_text(response) -> str:
    """
    Safely extract visible text from Gemini.

    Never blindly use response.text because Gemini responses containing
    thoughts/function calls can make the convenience property raise.
    """

    try:
        text = response.text

        if text:
            return text.strip()

    except Exception:
        pass

    try:
        candidates = getattr(response, "candidates", None) or []

        if not candidates:
            return ""

        content = getattr(candidates[0], "content", None)

        if not content:
            return ""

        parts = getattr(content, "parts", None) or []

        pieces: list[str] = []

        for part in parts:
            part_text = getattr(part, "text", None)

            if not part_text:
                continue

            if bool(getattr(part, "thought", False)):
                continue

            pieces.append(part_text)

        return "\n".join(pieces).strip()

    except Exception as exc:
        logger.warning(
            "Could not extract Gemini response text: %s",
            exc,
        )

        return ""


def _finish_reason_note(response) -> str | None:
    try:
        candidates = getattr(response, "candidates", None) or []

        if candidates:
            reason = getattr(
                candidates[0],
                "finish_reason",
                None,
            )

            if reason:
                return str(reason)

    except Exception:
        pass

    return None


# ============================================================================
# GEMINI RETRY
# ============================================================================

def _generate_content_with_retry(client, **kwargs):
    """
    Retry transient Gemini failures.

    Deterministic 400 errors are NOT retried.
    """

    last_exc: Exception | None = None

    for attempt in range(MAX_GEMINI_RETRIES + 1):
        try:
            return client.models.generate_content(**kwargs)

        except Exception as exc:
            last_exc = exc

            status_code = getattr(
                exc,
                "status_code",
                None,
            )

            if status_code is None:
                status_code = getattr(
                    exc,
                    "code",
                    None,
                )

            if str(status_code) == "400":
                raise

            if attempt < MAX_GEMINI_RETRIES:
                logger.warning(
                    "Gemini request failed. retry=%s error=%s",
                    attempt + 1,
                    exc,
                )

                time.sleep(
                    0.5 * (attempt + 1)
                )

            else:
                raise

    raise last_exc or RuntimeError(
        "Gemini request failed."
    )


# ============================================================================
# PERMISSIONS
# ============================================================================

def _check_permission(
    tool_name: str,
    current_user: models.User,
) -> str | None:
    """Gate every AI tool call behind the same RBAC matrix that protects
    the regular REST endpoints (app/permissions.py). Returns an error
    string if the call is not allowed, or None if it's fine to proceed.

    Fails CLOSED: a tool name we don't recognize (e.g. a new tool added
    to ai_tools.py without a matching TOOL_PERMISSIONS entry) is denied
    rather than silently allowed.
    """

    role = getattr(current_user, "role", None)

    mapping = TOOL_PERMISSIONS.get(tool_name)
    if mapping is None:
        return (
            f"This action ('{tool_name.replace('_', ' ')}') isn't recognized "
            f"by the permission system and has been blocked as a precaution."
        )

    module, action = mapping
    if not has_permission(role, module, action):
        return (
            f"Your role ({role or 'unknown'}) does not have '{action}' access "
            f"to {module}. This action was not performed."
        )

    return None


# ============================================================================
# DATABASE CHAT LOG
# ============================================================================

def _persist_chat_message(
    db: Session,
    user_email: str,
    role: str,
    content: str,
    patient_id: str | None,
) -> None:

    if not content:
        return

    try:
        db.add(
            models.ChatMessage(
                user_email=user_email,
                role=role,
                content=content,
                patient_id=patient_id,
                timestamp=datetime.now(timezone.utc),
            )
        )

        db.commit()

    except Exception as exc:
        logger.warning(
            "Could not persist chat message: %s",
            exc,
        )

        db.rollback()


def _persist_chat_message_if_enabled(
    enabled: bool,
    db: Session,
    user_email: str,
    role: str,
    content: str,
    patient_id: str | None,
) -> None:
    """Persist only the dedicated AI Assistant transcript.

    The compact Dashboard chatbot intentionally stays ephemeral and uses a
    separate Gemini session, so it cannot leak into the AI Assistant history.
    """
    if enabled:
        _persist_chat_message(db, user_email, role, content, patient_id)


# ============================================================================
# CONTEXT
# ============================================================================

def _context_note(
    session: _Session,
    current_user: models.User,
) -> str:

    user_name = getattr(
        current_user,
        "name",
        "User",
    )

    user_email = getattr(
        current_user,
        "email",
        "",
    )

    role = getattr(
        current_user,
        "role",
        "",
    )

    lines = [
        f"Authenticated user: {user_name} <{user_email}> ({role})."
    ]

    if session.last_patient_id:
        lines.append(
            "Current patient context: "
            f"{session.last_patient_name or 'Unknown'} "
            f"(id={session.last_patient_id}). "
            "If the user says 'uska', 'iska', 'this patient', "
            "'that patient', 'their', etc., use this patient unless "
            "the user clearly refers to another patient."
        )

    if session.pending:
        lines.append(
            "PENDING CONFIRMATION: "
            f"{session.pending['description']}. "
            "Do not execute it unless the user explicitly confirms."
        )

    return "\n".join(lines)


# ============================================================================
# PATIENT CONTEXT UPDATE
# ============================================================================

def _update_patient_context(
    session: _Session,
    tool_name: str,
    args: dict[str, Any],
    result: Any,
) -> None:

    if not isinstance(result, dict):
        return

    if result.get("error"):
        return

    # Direct patient_id
    if result.get("patient_id"):
        session.last_patient_id = str(
            result["patient_id"]
        )

        if result.get("name"):
            session.last_patient_name = str(
                result["name"]
            )

        return

    # Patient object
    patient = result.get("patient")

    if isinstance(patient, dict):
        pid = patient.get("id")

        if pid:
            session.last_patient_id = str(pid)
            session.last_patient_name = patient.get(
                "name",
                session.last_patient_name,
            )

        return

    # Search results
    if tool_name == "search_patient":
        patients = result.get("patients") or []

        if result.get("found") == 1 and len(patients) == 1:
            patient = patients[0]

            if patient.get("id"):
                session.last_patient_id = str(
                    patient["id"]
                )

            session.last_patient_name = patient.get(
                "name",
                session.last_patient_name,
            )

            return

    # Some tools may return a nested appointment/prescription.
    for key in (
        "appointment",
        "prescription",
        "lab_report",
        "billing",
    ):
        nested = result.get(key)

        if not isinstance(nested, dict):
            continue

        pid = (
            nested.get("patient_id")
            or nested.get("patientId")
        )

        if pid:
            session.last_patient_id = str(pid)

            if nested.get("patient_name"):
                session.last_patient_name = nested[
                    "patient_name"
                ]

            return

    # Finally use patient_id supplied to tool.
    if args.get("patient_id"):
        session.last_patient_id = str(
            args["patient_id"]
        )


# ============================================================================
# PATIENT ID EXTRACTION
# ============================================================================

def _extract_patient_id(
    tool_name: str,
    args: dict[str, Any],
    tool_result: Any,
) -> str | None:

    if args.get("patient_id"):
        return str(args["patient_id"])

    if not isinstance(tool_result, dict):
        return None

    if tool_result.get("patient_id"):
        return str(
            tool_result["patient_id"]
        )

    patient = tool_result.get("patient")

    if isinstance(patient, dict) and patient.get("id"):
        return str(patient["id"])

    for key in (
        "appointment",
        "prescription",
        "lab_report",
        "billing",
    ):
        nested = tool_result.get(key)

        if isinstance(nested, dict):
            pid = (
                nested.get("patient_id")
                or nested.get("patientId")
            )

            if pid:
                return str(pid)

    return None


# ============================================================================
# CHAT RESULT
# ============================================================================

class ChatResult:
    __slots__ = (
        "text",
        "data_changed",
        "affected_entities",
        "affected_patient_id",
    )

    def __init__(
        self,
        text: str,
        data_changed: bool = False,
        affected_entities: set[str] | None = None,
        affected_patient_id: str | None = None,
    ) -> None:

        self.text = text
        self.data_changed = data_changed
        self.affected_entities = (
            affected_entities or set()
        )
        self.affected_patient_id = (
            affected_patient_id
        )

    def merge(self, other: "ChatResult") -> None:
        self.data_changed = (
            self.data_changed
            or other.data_changed
        )

        self.affected_entities |= (
            other.affected_entities
        )

        self.affected_patient_id = (
            other.affected_patient_id
            or self.affected_patient_id
        )


# ============================================================================
# TOOL RESULT SUMMARY FOR HISTORY
# ============================================================================

def _safe_tool_summary(
    tool_name: str,
    result: Any,
) -> str:

    """
    Convert a tool result to a textual history entry.

    This prevents old Gemini functionCall/thought_signature objects from
    being reconstructed on later turns.

    Current-turn tool calls still use the native Gemini response Content.
    """

    try:
        return (
            f"Backend tool '{tool_name}' returned:\n"
            f"{result}"
        )
    except Exception:
        return (
            f"Backend tool '{tool_name}' completed."
        )


# ============================================================================
# MAIN CHAT ENTRY
# ============================================================================

def chat(
    db: Session,
    current_user: models.User,
    message: str,
    channel: str = "assistant",
) -> ChatResult:

    message = (message or "").strip()

    if not message:
        return ChatResult(
            "Please type a message."
        )

    email = getattr(
        current_user,
        "email",
        "",
    )
    persist_history = channel == "assistant"

    # ------------------------------------------------------------
    # Gemini unavailable
    # ------------------------------------------------------------

    if not settings.GEMINI_API_KEY:
        reply = _fallback_response(db, message)

        _persist_chat_message_if_enabled(
            persist_history,
            db,
            email,
            "user",
            message,
            None,
        )

        _persist_chat_message_if_enabled(
            persist_history,
            db,
            email,
            "assistant",
            reply,
            None,
        )

        return ChatResult(reply)

    # Dashboard and full-page AI Assistant never share short-term context,
    # confirmation state, or chat history.
    session = _get_session(f"{email}:{channel}")

    _persist_chat_message_if_enabled(
        persist_history,
        db,
        email,
        "user",
        message,
        session.last_patient_id,
    )

    # ------------------------------------------------------------
    # Pending destructive action
    # ------------------------------------------------------------

    if session.pending:

        if _CONFIRM_WORDS.match(message):

            pending = session.pending

            session.pending = None

            write_result = ChatResult("")

            permission_error = _check_permission(
                pending["tool"],
                current_user,
            )

            if permission_error:
                result = {
                    "error": permission_error,
                    "authorized": False,
                }

            else:
                try:
                    executor = getattr(
                        ai_tools,
                        "CONFIRM_EXECUTORS",
                        {},
                    ).get(
                        pending["tool"]
                    )

                    if not executor:
                        result = {
                            "error": (
                                "Could not find the executor "
                                f"for '{pending['tool']}'."
                            )
                        }

                    else:
                        result = executor(
                            db,
                            current_user,
                            **pending["args"],
                        )

                    if (
                        isinstance(result, dict)
                        and "error" not in result
                    ):
                        entity = _infer_entity(
                            pending["tool"]
                        )

                        write_result = ChatResult(
                            "",
                            data_changed=True,
                            affected_entities=(
                                {entity}
                                if entity
                                else set()
                            ),
                            affected_patient_id=(
                                _extract_patient_id(
                                    pending["tool"],
                                    pending["args"],
                                    result,
                                )
                            ),
                        )

                        _update_patient_context(
                            session,
                            pending["tool"],
                            pending["args"],
                            result,
                        )

                except Exception as exc:
                    logger.exception(
                        "Confirmed action failed: %s",
                        pending["tool"],
                    )

                    db.rollback()

                    result = {
                        "error": (
                            "The action could not be completed: "
                            f"{exc}"
                        )
                    }

            # IMPORTANT:
            # Do not fabricate a Gemini function_call here.
            #
            # We only store a textual event in history.
            _add_history(
                session,
                "user",
                (
                    f"I confirmed the pending action "
                    f"'{pending['tool']}'. "
                    f"The backend result was: {result}"
                ),
            )

            turn_result = _run_gemini_turn(
                db,
                current_user,
                session,
            )

            turn_result.merge(
                write_result
            )

            _persist_chat_message_if_enabled(
                persist_history,
                db,
                email,
                "assistant",
                turn_result.text,
                session.last_patient_id,
            )

            return turn_result

        # --------------------------------------------------------
        # Cancel
        # --------------------------------------------------------

        if _CANCEL_WORDS.match(message):

            session.pending = None

            reply = (
                "Okay, cancelled — no changes were made."
            )

            _add_history(
                session,
                "user",
                message,
            )

            _add_history(
                session,
                "model",
                reply,
            )

            _persist_chat_message_if_enabled(
                persist_history,
                db,
                email,
                "assistant",
                reply,
                session.last_patient_id,
            )

            return ChatResult(reply)

        # Anything else:
        # Let Gemini see pending state and decide whether to remind
        # the user or handle the new request.

    # ------------------------------------------------------------
    # Normal message
    # ------------------------------------------------------------

    _add_history(
        session,
        "user",
        message,
    )

    turn_result = _run_gemini_turn(
        db,
        current_user,
        session,
    )

    _persist_chat_message_if_enabled(
        persist_history,
        db,
        email,
        "assistant",
        turn_result.text,
        session.last_patient_id,
    )

    return turn_result


# ============================================================================
# GEMINI TOOL-CALL LOOP
# ============================================================================

def _run_gemini_turn(
    db: Session,
    current_user: models.User,
    session: _Session,
) -> ChatResult:

    from google.genai import types

    data_changed = False
    affected_entities: set[str] = set()
    affected_patient_id: str | None = None

    try:
        client = _get_client()

        function_declarations = (
            _build_function_declarations()
        )

        tools = []

        if function_declarations:
            tools.append(
                types.Tool(
                    function_declarations=function_declarations
                )
            )

        # ------------------------------------------------------------
        # CRITICAL DESIGN:
        #
        # We keep a native `contents` list for the CURRENT Gemini turn.
        #
        # When Gemini returns a function call, we append the EXACT native
        # model Content object returned by Gemini.
        #
        # Therefore Gemini 3 thought signatures are preserved.
        #
        # We then append the function response as USER content.
        #
        # Old turns are only textual history.
        # ------------------------------------------------------------

        contents = _history_to_contents(
            session.history
        )

        final_text: str | None = None

        for iteration in range(
            MAX_TOOL_ITERATIONS
        ):

            logger.debug(
                "Gemini tool loop iteration=%d",
                iteration + 1,
            )

            config = types.GenerateContentConfig(
                system_instruction=(
                    SYSTEM_PROMPT
                    + "\n\n"
                    + _context_note(
                        session,
                        current_user,
                    )
                ),
                tools=tools or None,
                automatic_function_calling=(
                    types.AutomaticFunctionCallingConfig(
                        disable=True
                    )
                ),
            )

            response = _generate_content_with_retry(
                client,
                model=settings.GEMINI_MODEL,
                contents=contents,
                config=config,
            )

            # --------------------------------------------------------
            # Extract function calls
            # --------------------------------------------------------

            try:
                function_calls = (
                    response.function_calls
                    or []
                )
            except Exception:
                function_calls = []

            # --------------------------------------------------------
            # NORMAL TEXT RESPONSE
            # --------------------------------------------------------

            if not function_calls:

                final_text = _extract_text(
                    response
                )

                if not final_text:

                    reason = _finish_reason_note(
                        response
                    )

                    logger.warning(
                        "Gemini returned no usable text. "
                        "finish_reason=%s",
                        reason,
                    )

                    final_text = (
                        "I wasn't able to generate a complete "
                        "response that time. Please try again."
                    )

                # Store only visible text in persistent session history.
                _add_history(
                    session,
                    "model",
                    final_text,
                )

                break

            # --------------------------------------------------------
            # EXACT MODEL CONTENT
            # --------------------------------------------------------

            model_content = None

            try:
                candidates = (
                    getattr(
                        response,
                        "candidates",
                        None,
                    )
                    or []
                )

                if candidates:
                    model_content = (
                        getattr(
                            candidates[0],
                            "content",
                            None,
                        )
                    )

            except Exception:
                model_content = None

            if model_content is not None:
                # Keep exact Gemini-generated model Content.
                contents.append(
                    model_content
                )

            # --------------------------------------------------------
            # Execute function calls
            # --------------------------------------------------------

            function_response_parts = []

            destructive_staged = False

            for fc in function_calls:

                tool_name = getattr(
                    fc,
                    "name",
                    None,
                )

                args = dict(
                    getattr(
                        fc,
                        "args",
                        None,
                    )
                    or {}
                )

                if not tool_name:
                    continue

                logger.info(
                    "Gemini requested tool=%s args=%s",
                    tool_name,
                    args,
                )

                # ----------------------------------------------------
                # Unknown tool
                # ----------------------------------------------------

                if tool_name not in ALL_TOOL_NAMES:

                    tool_result = {
                        "error": (
                            f"Unknown tool '{tool_name}'. "
                            "The requested operation is not available."
                        )
                    }

                else:

                    # ------------------------------------------------
                    # Permission
                    # ------------------------------------------------

                    permission_error = (
                        _check_permission(
                            tool_name,
                            current_user,
                        )
                    )

                    if permission_error:

                        tool_result = {
                            "error": permission_error,
                            "authorized": False,
                        }

                    # ------------------------------------------------
                    # Destructive operation
                    # ------------------------------------------------

                    elif tool_name in DESTRUCTIVE_TOOLS:

                        # Do not execute.
                        #
                        # IMPORTANT:
                        # Stop processing additional function calls from
                        # this Gemini response. If Gemini somehow requested
                        # multiple deletes, only the first is staged.
                        #
                        # This avoids overwriting session.pending.
                        if not destructive_staged:

                            description = (
                                f"{tool_name.replace('_', ' ')}"
                            )

                            if args:
                                description += (
                                    f" with {args}"
                                )

                            session.pending = {
                                "tool": tool_name,
                                "args": args,
                                "description": description,
                            }

                            destructive_staged = True

                        tool_result = {
                            "confirmation_required": True,
                            "message": (
                                "This destructive operation was NOT "
                                "executed. The user must explicitly "
                                "confirm it first."
                            ),
                        }

                    # ------------------------------------------------
                    # Normal tool
                    # ------------------------------------------------

                    else:

                        try:

                            tool_result = (
                                ai_tools.run_tool(
                                    tool_name,
                                    args,
                                    db,
                                    current_user,
                                )
                            )

                        except Exception as tool_exc:

                            logger.exception(
                                "Tool '%s' failed",
                                tool_name,
                            )

                            db.rollback()

                            tool_result = {
                                "error": (
                                    f"Tool '{tool_name}' "
                                    f"failed: {tool_exc}"
                                )
                            }

                        # --------------------------------------------
                        # Context update
                        # --------------------------------------------

                        _update_patient_context(
                            session,
                            tool_name,
                            args,
                            tool_result,
                        )

                        # --------------------------------------------
                        # Write tracking
                        # --------------------------------------------

                        if (
                            _is_write_tool(
                                tool_name
                            )
                            and isinstance(
                                tool_result,
                                dict,
                            )
                            and "error"
                            not in tool_result
                        ):

                            data_changed = True

                            entity = _infer_entity(
                                tool_name
                            )

                            if entity:
                                affected_entities.add(
                                    entity
                                )

                            pid = (
                                _extract_patient_id(
                                    tool_name,
                                    args,
                                    tool_result,
                                )
                            )

                            if pid:
                                affected_patient_id = pid

                # ----------------------------------------------------
                # Gemini function response
                # ----------------------------------------------------

                function_response_parts.append(
                    types.Part.from_function_response(
                        name=tool_name,
                        response=tool_result,
                    )
                )

                # ----------------------------------------------------
                # If destructive action is pending, don't execute
                # any additional model-requested tools.
                # ----------------------------------------------------

                if destructive_staged:
                    break

            # --------------------------------------------------------
            # Add function response immediately after MODEL content.
            # --------------------------------------------------------

            if function_response_parts:

                user_tool_content = types.Content(
                    role="user",
                    parts=function_response_parts,
                )

                contents.append(
                    user_tool_content
                )

            # --------------------------------------------------------
            # Destructive confirmation must stop this Gemini loop.
            # Otherwise Gemini could continue and accidentally create
            # another call before the user confirms.
            # --------------------------------------------------------

            if destructive_staged:

                final_text = (
                    "This action requires your confirmation before I "
                    "can execute it."
                )

                _add_history(
                    session,
                    "model",
                    final_text,
                )

                break

        # ------------------------------------------------------------
        # Tool loop exhausted
        # ------------------------------------------------------------

        if final_text is None:

            final_text = (
                "I looked into that but couldn't finish the request "
                "within the allowed number of steps. Please narrow "
                "down the request and try again."
            )

            _add_history(
                session,
                "model",
                final_text,
            )

        return ChatResult(
            final_text,
            data_changed,
            affected_entities,
            affected_patient_id,
        )

    except Exception as exc:

        logger.exception(
            "Gemini call failed"
        )

        detail = (
            f" ({exc.__class__.__name__})"
            if settings.DEBUG
            else ""
        )

        text = (
            "Sorry, I hit an error talking to the AI service "
            "and couldn't complete that request"
            f"{detail}. Please try again in a moment. "
            "If this keeps happening, check the backend logs, "
            "GEMINI_API_KEY and GEMINI_MODEL configuration."
        )

        return ChatResult(
            text,
            data_changed,
            affected_entities,
            affected_patient_id,
        )


# ============================================================================
# REPORT ANALYSIS
# ============================================================================

def analyze_report(
    db: Session,
    current_user: models.User,
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    question: str | None,
) -> str:

    """
    Analyze uploaded PDF/image/text using Gemini native multimodal input.
    """

    if not settings.GEMINI_API_KEY:
        return (
            "The AI assistant isn't connected to Gemini, "
            "so I can't analyze this report right now."
        )

    from google.genai import types

    question = (
        question.strip()
        if question
        else ""
    )

    prompt = question or """
Analyze this hospital report carefully.

Tasks:
1. Summarize the report.
2. Extract values that are actually present.
3. Identify values that appear outside the reference range when the
   reference range is explicitly available.
4. Mention clinically important findings.
5. Clearly separate reported facts from general interpretation.
6. Do NOT invent, estimate or assume missing values.
7. If the document is unreadable, explicitly say that it could not
   be reliably read.
8. This is clinical decision support, not a final diagnosis.
"""

    try:

        client = _get_client()

        response = _generate_content_with_retry(
            client,
            model=settings.GEMINI_MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(
                            data=file_bytes,
                            mime_type=mime_type,
                        ),
                        types.Part.from_text(
                            text=prompt
                        ),
                    ],
                )
            ],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
            ),
        )

        text = _extract_text(
            response
        )

        if not text:

            reason = _finish_reason_note(
                response
            )

            logger.warning(
                "Report analysis returned no text. "
                "finish_reason=%s",
                reason,
            )

            text = (
                f"I couldn't extract readable content from "
                f"'{filename}'. Please check the file and try again."
            )

        session = _get_session(
            current_user.email
        )

        _persist_chat_message(
            db,
            current_user.email,
            "user",
            (
                f"[Report attached: {filename}] "
                f"{question}"
            ).strip(),
            session.last_patient_id,
        )

        _persist_chat_message(
            db,
            current_user.email,
            "assistant",
            text,
            session.last_patient_id,
        )

        return text

    except Exception as exc:

        logger.exception(
            "Gemini report analysis failed"
        )

        detail = (
            f" ({exc.__class__.__name__})"
            if settings.DEBUG
            else ""
        )

        return (
            f"Sorry, I couldn't analyze '{filename}'"
            f"{detail}. The file may be unreadable or "
            "the Gemini service may be unavailable."
        )


# ============================================================================
# DEBUG / HEALTH HELPERS
# ============================================================================

def get_available_tools() -> list[str]:
    """
    Useful for debugging the backend.

    Returns the tools currently exposed to Gemini.
    """

    return sorted(
        _all_tool_names()
    )


def get_session_info(
    user_email: str,
) -> dict[str, Any]:

    """
    Safe debugging helper.
    Does NOT expose credentials or internal secrets.
    """

    session = _SESSIONS.get(
        user_email
    )

    if not session:
        return {
            "exists": False,
            "history_turns": 0,
            "patient_id": None,
            "patient_name": None,
            "pending": False,
        }

    return {
        "exists": True,
        "history_turns": len(
            session.history
        ),
        "patient_id": session.last_patient_id,
        "patient_name": session.last_patient_name,
        "pending": bool(
            session.pending
        ),
    }
