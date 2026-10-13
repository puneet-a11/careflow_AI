# CareFlow AI Assistant — Gemini backend-connection upgrade

This documents the change that turned the AI Assistant chat box from a canned/OpenAI
chatbot into a real, Gemini-powered assistant with function-calling access to the
existing CareFlow database. No separate demo, no mock/fake patient data, no new
database, no changes to existing auth/CRUD/models beyond adding one audit-log table.

## 1. Files changed

**New:**
- `careflow-backend/app/ai_tools.py` — whitelisted tool functions (search/read/update/
  delete) operating on the existing SQLAlchemy models, plus their Gemini function schemas.
- `careflow-backend/app/gemini_assistant.py` — system prompt, per-user conversation
  memory, destructive-action confirmation flow, the Gemini function-calling loop, report
  analysis.
- `AI_ASSISTANT_UPGRADE.md` — this file.

**Modified:**
- `careflow-backend/app/models.py` — added `AuditLog` (no existing columns touched).
- `careflow-backend/app/routers/ai_assistant.py` — rewritten to call `gemini_assistant`
  instead of OpenAI; added `/analyze-report` and `/reset`.
- `careflow-backend/app/config.py` — added `GEMINI_API_KEY`, `GEMINI_MODEL`; removed
  `OPENAI_API_KEY` (unused anywhere now).
- `careflow-backend/requirements.txt` — removed `openai`, added `google-genai`.
- `careflow-backend/.env`, `.env.example` — removed the leaked/redacted OpenAI key,
  added `GEMINI_API_KEY` / `GEMINI_MODEL`.
- `careflow-backend/README.md` — updated setup/endpoints/limitations.
- `careflow-frontend/ai-assistant.html` — added an attach button + file input for
  report upload; updated stale "OpenAI"/"integration ready" copy.
- `careflow-frontend/ai-assistant.js` — wired the attach button to
  `CareFlowAPI.analyzeReport()`; clearer offline-fallback labeling.
- `careflow-frontend/api.js` — added `analyzeReport()`; fixed `request()` to not force
  `Content-Type: application/json` on `FormData` bodies (was previously only used for
  JSON requests, so this bug was latent until file upload was added).

**Not touched:** existing auth, CRUD routers, `crud_factory.py`, other models/schemas,
every other frontend page.

## 2. What was implemented (maps to the numbered requirements)

1. **Gemini integration** — `google-genai`, model configurable via `GEMINI_MODEL`
   (default `gemini-3.1-flash-lite`), key via `GEMINI_API_KEY`. OpenAI is not used
   anywhere in the AI assistant (or the project) anymore.
2. **Backend-connected AI / function calling** — `app/ai_tools.py` +
   `app/gemini_assistant.py`; Gemini calls real tools against the real DB.
3. **Patient search** — `search_patient` matches name/id/MRN (case-insensitive,
   partial), returns all matches and lets the model ask the user to disambiguate.
4. **Patient information** — `get_patient_details`/`get_patient_vitals` return only
   real columns; nothing is invented.
5. **Database update capability** — `update_patient`, `update_patient_vitals`,
   `update_appointment`, plus delete tools; all field-restricted allow-lists, no raw SQL.
6. **Write safety** — every writable tool checks the record exists and rejects
   unknown/protected fields before writing.
7. **Confirmation for destructive ops** — delete tools never execute on the model's
   first call; `session.pending` + a strict yes/no matcher gates execution.
8. **Authorization** — every route still requires `get_current_user`; tools receive
   the authenticated user and log under their email. No privilege escalation path added.
9. **Audit logging** — new `audit_logs` table, written by every write/delete tool
   (`user_email`, `timestamp`, `operation`, `entity`, `entity_id`, `old_value`,
   `new_value`, `ai_initiated`). No secrets ever logged.
10. **Medical questions** — system prompt explicitly frames the assistant as decision
    support, not a prescriber; asks for clinician/pharmacist review on medication.
11. **Report/document analysis** — `POST /api/ai-assistant/analyze-report` (PDF/PNG/
    JPEG/WEBP/plain text, 15 MB max) sends the file directly to Gemini; the prompt
    forbids inventing values, and a failed parse is reported as a failure, not silently.
12. **Same-language responses** — instructed in the system prompt (English vs Hindi/
    Hinglish, matched to the user's own message).
13. **Conversational context** — per-user in-memory history (kept across turns) plus
    an explicit "last patient discussed" pointer injected into the system context each
    turn, so pronouns ("uska", "this patient") resolve correctly even if history is
    trimmed.
14. **Frontend integration** — `ai-assistant.js` already posted to
    `/api/ai-assistant/chat`; that endpoint is now the real Gemini-backed one. Existing
    UI/design untouched aside from the new attach button.
15. **Error handling** — no Gemini key -> clearly labeled fallback; Gemini exception ->
    clearly labeled error (never a silent fake response); unknown/invalid tool args,
    "not found", and "multiple found" are all returned as structured tool results the
    model turns into a normal-language reply.
16. **Reused existing APIs/routers** — the AI tools call the same SQLAlchemy
    session/models the CRUD routers use; nothing is duplicated.
17. **Schemas/models inspected** — `ai_tools.py`'s allow-lists were built directly from
    `app/models.py` columns; nothing assumed.
18. **System prompt** — see `gemini_assistant.SYSTEM_PROMPT`.

## 3. Required pip packages

```
google-genai>=1.0.0
```
(`openai` removed — no longer a dependency of this project.)

## 4. Required .env variables

```
GEMINI_API_KEY=<your key from https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-3.1-flash-lite   # optional, this is the default
```

## 5. Commands to run the backend

```bash
cd careflow-backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then fill in GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

## 6. Command to sanity-check the Gemini connection directly

```bash
python3 - <<'PY'
from google import genai
client = genai.Client(api_key="YOUR_KEY")
r = client.models.generate_content(model="gemini-3.1-flash-lite", contents="Say hi in one word.")
print(r.text)
PY
```

## 7. API endpoint(s) used by the frontend

- `POST /api/ai-assistant/chat` — `{ "message": "..." }` (unchanged contract; same one
  `ai-assistant.js` already called)
- `POST /api/ai-assistant/analyze-report` — multipart `file` (+ optional `question`),
  new; wired to the paperclip button in `ai-assistant.html`
- `POST /api/ai-assistant/reset` — new, not wired to any UI yet (available for a future
  "New chat" button)

## 8. Migration / database changes

One new table, `audit_logs`, created automatically by the existing
`Base.metadata.create_all()` in `main.py` — no manual migration step, and no changes to
any existing table/column. `careflow_schema.sql` (the MySQL path) was **not** updated
with this table — if you use MySQL instead of the default SQLite, add it manually before
relying on audit logging there.

## 9. Limitations / what's not done

- **Not run end-to-end.** This sandbox has no outbound network access, so
  `pip install google-genai` and a live Gemini call could not be executed here. Every
  file was verified with `python3 -m py_compile` / `node --check`, and the Gemini
  function-calling conventions (`FunctionDeclaration(parameters_json_schema=...)`,
  `role="tool"` for function responses, manual-loop config) were checked against the
  current `google-genai` SDK docs — but **please run the 12 test cases from the original
  request yourself** before trusting this in anything resembling production.
- **Session memory is in-process and per-user**, not per-browser-tab and not persisted.
  It resets on backend restart and is shared across a user's simultaneous sessions. A
  real conversation-id/thread model would need a small schema addition and a frontend
  change (out of scope for "reuse the existing chat contract").
- **`careflow_schema.sql` (MySQL) was not updated** with the `audit_logs` table (see #8).
- **Role-based restriction is minimal** — same as the rest of the project, any
  authenticated user (both seeded roles are physician-level) can use every tool. If you
  add a lower-privilege role later, the tool layer will need its own permission checks.
- **Rate limiting / cost control for Gemini calls was not added** — worth doing before
  any real deployment, since each chat turn can involve several model calls
  (tool-calling loop).
