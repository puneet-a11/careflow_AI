# CareFlow AI — Backend (FastAPI)

Backend for the CareFlow AI hospital-management frontend (`careflow-frontend/`).
The frontend calls this API directly (see `careflow-frontend/api.js`) - there is no
localStorage/mock-data fallback in production use; `mock-data.js` only ships a couple of
UI-only lookup lists (see that file's own comments), never patient/clinical records.

## Stack
- **FastAPI** (SQLAlchemy ORM, SQLite by default, zero config) - this is the only backend
  actually used by the frontend/mobile app. (`_legacy_unused/` contains an incomplete,
  abandoned Django REST Framework attempt at the same API - not used anywhere, see its own
  README for the evidence. Confirm and delete it, or keep it archived; either way don't
  develop against it.)
- JWT auth (python-jose) + bcrypt password hashing (passlib); tokens carry a
  `token_version` claim that's invalidated on password change, role change, or
  deactivation (see `app/security.py`)
- Auto-seeded on first run with demo data
- `/api/ai-assistant/chat` is a real, backend-connected AI assistant powered by **Google
  Gemini** (`google-genai`) with function calling — it can search/read/update patients,
  appointments, lab reports, prescriptions and billing through controlled tools (see
  `app/ai_tools.py` and `app/gemini_assistant.py`), gated by the same RBAC permission
  matrix as the regular REST endpoints (`app/permissions.py`). No OpenAI key is used
  anywhere. Without `GEMINI_API_KEY` set, it falls back to a minimal rule-based response
  and says so plainly — it will not silently pretend to be database-connected.

## Setup

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # edit SECRET_KEY, CORS_ORIGINS, GEMINI_API_KEY as needed
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Server: http://127.0.0.1:8000
API health: http://127.0.0.1:8000/api/health
Interactive docs (dev only - disabled when `DEBUG=false`): http://127.0.0.1:8000/docs

A `careflow.db` SQLite file is created automatically and pre-seeded with the same
5 patients / 5 doctors / 5 appointments / 8 departments / 4 lab reports / 2 prescriptions /
2 billing records, and 2 users, as the frontend's `mock-data.js`.

## Login (matches auth.js)

```
POST /api/auth/login
{ "email": "admin@careflow.ai", "password": "admin123" }
```
or `doctor@careflow.ai` / `doctor123`.

Returns `{ access_token, token_type, user }`. Send the token on every other request as:
`Authorization: Bearer <access_token>`

## Endpoints

All resource endpoints below support `GET` (list), `GET /{id}`, `POST`, `PUT /{id}`, `DELETE /{id}`
and are protected — send the Bearer token.

| Resource      | Base path              | Matches frontend function          |
|---------------|-------------------------|-------------------------------------|
| Patients      | `/api/patients`         | `getPatients()` in mock-data.js     |
| Doctors       | `/api/doctors`          | `getDoctors()`                      |
| Appointments  | `/api/appointments`     | `getAppointments()`                 |
| Departments   | `/api/departments`      | department list in departments.js   |
| Lab Reports   | `/api/lab-reports`      | `getLabReports()`                   |
| Prescriptions | `/api/prescriptions`    | `getPrescriptions()`                |
| Billing       | `/api/billing`          | `getBilling()` (`total` auto-calculated from consultation+lab+medicine) |
| AI Assistant  | `POST /api/ai-assistant/chat`, `POST /api/ai-assistant/analyze-report` (multipart file upload), `POST /api/ai-assistant/reset` | chat box + attach button in ai-assistant.html |
| Auth          | `/api/auth/login`, `/api/auth/me`, `PUT /api/auth/me`, `/api/auth/change-password`, `/api/auth/logout` | `Auth` object in auth.js |

### AI Assistant details

`POST /api/ai-assistant/chat` — `{ "message": "Tiwari Puneet ki details do" }` → the model
resolves the patient via `search_patient`/`get_patient_details` against the real database,
asks you to disambiguate if more than one patient matches, and replies in the same
language/style you used. Conversation memory (including "which patient are we talking
about") is kept per logged-in user, in-process — it resets if the backend restarts and is
shared across that user's tabs/devices (there's no per-tab session id in the current
frontend). Destructive actions (deleting a prescription/appointment/lab report/billing
record) are never executed on the first request — the tool returns
`confirmation_required` and the assistant asks you to explicitly confirm before it deletes
anything. Every AI-initiated write is recorded in the `audit_logs` table (`app.models.AuditLog`).

`POST /api/ai-assistant/analyze-report` — multipart form with a `file` (PDF/PNG/JPEG/WEBP/
plain text, 15 MB max) and an optional `question` field. Sends the file directly to Gemini
for analysis; it's instructed to only report values actually present in the document.

IDs are auto-generated in the same style as the mock data (`P006`, `D006`, `A006`, `L005`,
`RX003`, `B003`, `dep9`...) if you don't send one yourself.

## The frontend already talks to this API

`careflow-frontend/api.js` calls every endpoint below directly with a Bearer token; there
is no localStorage/mock-data mode to "connect" — if you're seeing mock data in the UI it
means the server isn't reachable (check `careflow-frontend/server-config.js` / the
in-app server settings page), not that the frontend needs code changes.

## Project structure

```
app/
  main.py           FastAPI app, CORS, router registration, table creation + seeding
  config.py         reads .env (SECRET_KEY, DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL, CORS_ORIGINS)
  database.py       SQLAlchemy engine/session
  models.py         ORM models (Patient, Doctor, Appointment, Department, LabReport,
                     Prescription, Billing, User, AuditLog)
  schemas.py        Pydantic request/response models
  security.py       JWT creation/verification, password hashing, get_current_user dep
  crud_factory.py   generic CRUD router builder (list/get/create/update/delete) reused
                     by every resource to avoid repeating identical code 7 times
  seed_data.py      first-run seeding with the same data as mock-data.js
  ai_tools.py        controlled, whitelisted functions the AI assistant may call
                     (search/read/update/delete against the real models) + their
                     Gemini function-declaration schemas
  gemini_assistant.py Gemini function-calling loop, system prompt, per-user
                     conversation memory, destructive-action confirmation flow,
                     report analysis
  routers/
    auth.py         /api/auth/* (login has rate limiting; see app/routers/auth.py)
    ai_assistant.py /api/ai-assistant/chat, /analyze-report, /reset
    dashboard.py    /api/dashboard/analytics - real DB aggregation, no fake/seed data
    opd.py, ipd.py, pharmacy.py, lab_orders.py, users.py, permissions.py
requirements.txt
.env.example
```

`_legacy_unused/` - see that folder's own README before touching it.

## Tested

Login (correct + wrong password), authenticated list/create/delete on patients, and
billing auto-total calculation were verified end-to-end in an earlier pass.

**The Gemini-connected AI assistant (this pass) was NOT run end-to-end** — this sandbox has
no outbound network access, so `pip install google-genai` and a live API call weren't
possible here. What *was* done:
- `python3 -m py_compile` on every new/changed backend file (`ai_tools.py`,
  `gemini_assistant.py`, `routers/ai_assistant.py`, `models.py`, `config.py`) — all pass.
- `node --check` on the changed frontend JS (`ai-assistant.js`, `api.js`) — both pass.
- Manual tracing of the tool-call loop, the confirmation flow, and the Gemini SDK calling
  conventions (`FunctionDeclaration(parameters_json_schema=...)`, `role="tool"` for function
  responses, `automatic_function_calling` disabled since the loop is handled manually)
  against the current `google-genai` SDK docs.
- Manual tracing of `ai_tools.py` against the actual `models.py` columns — no invented
  fields.

**Please do one real run before trusting this**: `pip install -r requirements.txt`, set a
real `GEMINI_API_KEY`, start the server, and try the test cases from the original request
(patient search, vitals update, delete-with-confirmation, Hindi/Hinglish, report upload).
