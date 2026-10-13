# CareFlow AI Assistant — v2: Bug Fix + Feature Expansion

This documents the second round of work on the Gemini-connected AI assistant: fixing the
recurring "Sorry, I hit an error talking to the AI service" failure, and expanding tool
coverage to the full 18-feature list you asked for. Nothing about the existing
architecture (Gemini function-calling loop, audit log, existing CRUD/auth) was replaced
— this builds on top of it.

## 1. The recurring error — root cause and fix

**What was happening:** your screenshot showed the assistant answering fine when it could
reply with plain text, but failing with a generic error the moment it needed to call a
tool (e.g. "mujhe patients ka data dikha").

**Root cause:** `gemini_assistant.py` read the model's answer with
`getattr(response, "text", None)`. Across every generation of the Gemini Python SDK,
`response.text` is a convenience accessor that **raises `ValueError`** (not
`AttributeError`, so `getattr(..., default)` does not protect against it) whenever the
response isn't a single simple text part — which happens whenever the reply is cut off,
filtered, or contains a mix of part types. `gemini-3.1-flash-lite` is a reasoning
("thinking") model, so a normal turn can come back with an internal "thought" part
alongside the real answer — exactly the shape that trips this bug. This is a
well-documented issue across `google-generativeai` and `google-genai` (see
`github.com/googleapis/python-genai/issues/359`, `google-gemini/...#280`, `#593`, `#170`,
among others) — it's a very common gotcha, not something specific to this project's code.

**Fix (`app/gemini_assistant.py`):** added `_extract_text(response)`, which:
1. Tries `response.text` inside its own `try/except` that catches *any* exception.
2. Falls back to manually walking `response.candidates[0].content.parts`, keeping only
   real text parts and explicitly skipping `part.thought` parts.
3. Never raises — returns `""` in the worst case, which the caller then turns into a
   clear "try rephrasing" message instead of a scary generic error.

I verified this fix works correctly with a simulated SDK failure (a fake response object
whose `.text` property raises, mixed with a `thought=True` part and a real answer part) —
`_extract_text` correctly ignored the thought part and returned only the real answer. Both
call sites (`_run_gemini_turn` and `analyze_report`) now go through this helper — no more
direct `.text` access anywhere in the file.

**Other reliability fixes in the same file:**
- One automatic retry (`_generate_content_with_retry`) with a short backoff before giving
  up on a Gemini call — network blips and momentary rate limits shouldn't surface as a
  user-facing error on the first hiccup.
- The confirmation-execution branch in `chat()` (running the actual delete after the user
  says "yes") is now wrapped in `try/except` — previously an unexpected DB error there
  would propagate out unhandled instead of degrading gracefully.
- In `DEBUG` mode (`.env`, default on), the generic error message now includes the
  exception *class name* (never the message or a traceback, and never secrets) so you can
  tell "rate limited" from "bad API key" from "network error" at a glance without digging
  through server logs.

## 2. New tools (closing the 18-feature list)

`app/ai_tools.py` gained 9 new whitelisted tool functions, each Pydantic-schema-validated
against the *existing* request schemas (`app/schemas.py`) — no parallel data model, same
ID-generation scheme as the REST API (`crud_factory._next_id`), same audit logging as
every other write.

| Tool | Feature(s) covered |
|---|---|
| `list_patients` | #12 Natural language search / #9 triage-risk overview — filter by status/severity/doctor/department, capped and sorted by triage score. This is also what fixes "mujhe patients ka data dikha": previously there was no tool for a *broad* listing, only `search_patient` (which needs a name/id/MRN and would return nothing useful for a vague request). |
| `create_patient` | #4 Create |
| `create_doctor` | #4 Create (Senior Physician only — see §3) |
| `create_appointment` | #4 Create |
| `create_prescription` | #4 Create / #8 Prescription management |
| `update_prescription` | #8 Prescription management |
| `delete_patient`, `delete_doctor` | #6 Delete, with confirmation (joins the existing `delete_appointment` / `delete_lab_report` / `delete_prescription` / `delete_billing_record`) |
| `get_patient_summary` | #11 Automatic patient summary — one call bundling record + latest lab + latest prescription + upcoming appointments, instead of the model needing 4 separate round-trips |
| `add_clinical_note` | #14 Clinical notes — appends a timestamped, attributed note to `medicalHistory`; additive only, never overwrites existing history |

Feature coverage for the rest of the list, using tools that already existed:
- **#1 Chat, #15 Context-aware chat** — already implemented (per-user session, last-patient
  tracking for pronouns like "iske"/"uska").
- **#2 Read & analysis, #10 Vitals analysis** — `search_patient`, `get_patient_details`,
  `get_patient_vitals`, `get_patient_summary` + Gemini's own clinical reasoning.
- **#3 Modification** — `update_patient`, `update_patient_vitals`.
- **#5 Appointment update & cancel** — `update_appointment` (set `status` to
  `Cancelled` for a soft cancel; `delete_appointment` for a hard delete).
- **#7 Lab report analysis** — `get_lab_reports` for in-chat reasoning over stored
  results, plus the existing `/analyze-report` endpoint for uploaded PDFs/images.
- **#13 Hospital data management** — the combined tool surface (patients, doctors,
  departments, appointments, labs, prescriptions, billing).
- **#17 Permission & confirmation** — see §3.
- **#18 Audit log** — every write tool (existing and new) calls `_write_audit`, including
  the new creates.

A static consistency check confirms every declared tool's JSON-schema parameters match
its Python function signature exactly (no name typos, no missing/extra required args) —
26 tools total, zero mismatches.

## 3. Permission system (feature #17)

This project's `User.role` only has two values in the seed data (`Senior Physician`,
`Physician`) — there's no existing admin/staff distinction to build on, so rather than
invent new roles, the assistant now enforces: **deleting a patient/doctor/appointment/lab
report/prescription/billing record, and adding a new doctor, requires the `Senior
Physician` role.** Any authenticated user can still read everything they could before,
and perform ordinary clinical writes (vitals, notes, prescriptions, patient/appointment
updates, creating patients/appointments/prescriptions).

This is enforced **server-side** in `gemini_assistant.py` (`_check_permission`), checked
before a destructive tool is even staged for confirmation — not just left to the system
prompt asking the model to self-police. A `Physician`-role user attempting one of these
gets a clear "not authorized, ask a Senior Physician" message instead of a silent failure
or the model inventing an excuse.

## 4. Chat history persistence (feature #16)

Previously, conversation memory was entirely in-process (`_SESSIONS` dict) and vanished
on server restart. Added:
- `models.ChatMessage` — a new table (`user_email`, `role`, `content`, `patient_id`,
  `timestamp`). Auto-created on next server start, same as the existing `AuditLog` table
  — no migration needed for SQLite.
- Every user message and assistant reply is now persisted (best-effort — a logging
  failure never breaks the actual chat response).
- `GET /api/ai-assistant/history?limit=50` — returns the durable transcript.
- `careflow-frontend/api.js` — added `CareFlowAPI.getChatHistory()`.
- `careflow-frontend/ai-assistant.js` — on page load, silently restores prior messages
  into the chat panel before the user types anything (falls back to just the existing
  welcome message if there's no history yet, or the call fails).

Note: this is the *transcript* (what was said). The live multi-turn Gemini conversation
state (function-call/response parts, needed for the model's short-term memory) still
lives in the in-memory `_SESSIONS` and resets on restart, same documented limitation as
before — restoring that fully would mean replaying tool calls, which is out of scope here.

## 5. Files changed this round

**New:**
- `AI_ASSISTANT_V2_FIXES_AND_FEATURES.md` — this file

**Modified:**
- `careflow-backend/app/gemini_assistant.py` — robust text extraction, retry, RBAC,
  chat-history persistence, expanded system prompt
- `careflow-backend/app/ai_tools.py` — 9 new tools + declarations (see §2)
- `careflow-backend/app/models.py` — added `ChatMessage`
- `careflow-backend/app/schemas.py` — added `ChatHistoryItem`, `ChatHistoryResponse`
- `careflow-backend/app/config.py` — added `DEBUG`
- `careflow-backend/app/routers/ai_assistant.py` — added `GET /history`
- `careflow-frontend/api.js` — added `getChatHistory()`
- `careflow-frontend/ai-assistant.js` — restores chat history on load

## 6. Verification performed

I don't have a live Gemini API key or outbound network access in this environment, so I
could not run a real end-to-end chat. What I *did* verify:
- `python3 -m py_compile` on every changed backend file — all pass.
- A stub-import test (fake `sqlalchemy`/`pydantic`/`app.*` modules) that actually imports
  `ai_tools.py` and `gemini_assistant.py` and exercises real Python logic — confirmed:
  - Every one of the 26 declared tools matches its Python function's required/optional
    parameters exactly.
  - Every destructive tool is wired through `CONFIRM_EXECUTORS`.
  - `_extract_text()` correctly recovers the real answer from a response object whose
    `.text` raises `ValueError` and which mixes a "thought" part with the real text part
    — reproducing the exact failure mode from your screenshot.
- `node --check` on the two changed frontend files.

Please do one real run with your (rotated) `GEMINI_API_KEY` before relying on this —
static checks catch structural bugs but can't fully substitute for hitting the live API.

## 7. How to run (unchanged)

```bash
cd careflow-backend
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Put a real key in .env: GEMINI_API_KEY=...
uvicorn app.main:app --reload --port 8000
```
```bash
cd careflow-frontend
python3 -m http.server 5500
```
The `chat_messages` and `audit_logs` tables are created automatically on the next
backend start (`Base.metadata.create_all`) — no manual migration needed.
