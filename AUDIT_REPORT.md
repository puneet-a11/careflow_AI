# CareFlow AI — Full Project Audit & Fix Report

## 1. Existing architecture
A real full-stack app, further along than expected — most of it was **not** fake:

```
Frontend (vanilla JS, static HTML/CSS)
        ↕  fetch() + JWT
Backend  (FastAPI)
        ↕  SQLAlchemy ORM
Database (SQLite, file-based)
```

- **Frontend:** `careflow-frontend/` — plain HTML/CSS/JS (no framework/bundler), one `.js` file per page.
- **Backend:** `careflow-backend/` — FastAPI + SQLAlchemy 2.0, JWT auth (`python-jose`), bcrypt password hashing (`passlib`).
- **Database:** SQLite (`careflow.db`), auto-created and auto-seeded on first run via `Base.metadata.create_all()` + `seed_if_empty()`. A MySQL path also exists (`PyMySQL` is in requirements, `.env.example` documents the connection string), but SQLite is the default and what's configured.
- **API structure:** `/api/auth/*` for auth, plus a generic CRUD-router factory (`crud_factory.py`) mounted at `/api/patients`, `/api/doctors`, `/api/appointments`, `/api/departments`, `/api/lab-reports`, `/api/prescriptions`, `/api/billing` — all real, all JWT-protected.
- **Authentication:** Real — login checks a bcrypt hash, issues a JWT, `get_current_user` dependency guards every CRUD route.

## 2. Problems found — and fixed

| # | Problem | Where | Fix |
|---|---|---|---|
| 1 | **Appointments, Prescriptions, Billing pages never talked to the backend.** Each page declared its own local `getX()/saveX()` helpers that shadowed the real API-backed functions and read/wrote only `localStorage`. Creating, editing, or deleting an appointment/prescription/invoice appeared to work but was never persisted — it vanished on refresh or on another device. | `appointments.js`, `prescriptions.js`, `billing.js` | Rewired all create/edit/delete handlers to call the real `/api/appointments`, `/api/prescriptions`, `/api/billing` endpoints via `CareFlowAPI.request()`, matching the pattern already used correctly in `doctors.js`. |
| 2 | **Missing auth guard.** `appointments.js` never called `Auth.requireAuth()`; `doctors.js` had it commented out. Both pages were reachable without being logged in. | `appointments.js`, `doctors.js` | Added `if (!Auth.requireAuth()) return;` to both. |
| 3 | **Departments page was read-only** with a hardcoded fallback array, despite the backend fully supporting department CRUD. | `departments.js`, `departments.html` | Added a real Add/Edit/Delete modal (mirroring the doctors page) wired to `/api/departments`. |
| 4 | **Fake password change.** "Change Password" validated only client-side, cleared the fields, and showed "success" — nothing was ever checked or saved. | `settings.js` | Added `POST /api/auth/change-password` (verifies the current bcrypt hash, re-hashes the new password) and wired the button to it for real. |
| 5 | **Profile name changes never left the browser.** Only written to `localStorage`. | `settings.js` | Added `PUT /api/auth/me` (updates the `name` column) and wired "Save Profile" to it. Phone/department/email remain browser-local — the `User` model intentionally has no columns for those, so persisting them would need a schema change (see Limitations). |
| 6 | **Dashboard's "today's appointments" stat was permanently hardcoded** to `2025-03-15`, so any appointment booked for the real current date would never count toward it. | `dashboard.js` | Now filters by the real current date, falling back to the seed date only when there's nothing booked for today (keeps the demo populated out of the box). |
| 7 | **Three orphaned/dead files** — `data-manager.js` (a `CFStore` fake-persistence layer) and `billing-init.js` were never referenced by any HTML page; `assistant.js` was superseded by `ai-assistant.js` and also unreferenced. Left in place, they're confusing dead code that does exactly the "fake backend behavior" the brief warned about. | frontend root | Deleted all three. |
| 8 | **Unused fake CRUD functions in `mock-data.js`** (`addPatient`, `updatePatient`, `deletePatient`, `addDoctor`, `updateDoctor`, `deleteDoctor`) wrote only to `localStorage` and had zero call sites anywhere in the app — a leftover trap for future development. | `mock-data.js` | Removed. |
| 9 | **A live-looking OpenAI API key was committed in `careflow-backend/.env`**, inside the zip you uploaded. `.env` is correctly `.gitignore`'d, so it wasn't meant to be shared, but it was present in this project archive. | `.env` | **Redacted** in the delivered copy. **You should rotate/revoke this key immediately** — treat it as compromised since it left your machine. |
| 10 | **A 54 MB Windows-only `.venv` was bundled inside the zip** (`python-3.14-win_amd64`, `.pyd` binaries) — can't run on Linux/Mac, shouldn't ship in a project archive at all. | `careflow-backend/.venv` | Removed from the delivered copy. |
| 11 | Appointment edit/delete referenced a `doctorId`/`doctorName` shape that the backend doesn't produce (backend stores the doctor as a `doctor` name string). | `appointments.js` | Fixed the read/write mapping so edit pre-selects the right doctor and saves the correct field. |

## 3. Verified but already correct (no changes needed)
- `auth.js`, `api.js`, `storage.js` — real login/session/token handling.
- `add-patient.js`, `doctors.js` (aside from the auth guard), `lab-reports.js` — already call the real API and persist to the database.
- `ai-assistant.js` — calls the real `/api/ai/*` backend endpoint with a clearly-labeled offline fallback when the backend is unreachable (not a fake chatbot pretending to be real).
- `crud_factory.py` — every CRUD route is JWT-protected; create/update correctly recompute `billing.total`; sensible auto-generated IDs.
- Password storage uses bcrypt via `passlib`, never plaintext.
- CORS is configured from `.env`, not hardcoded; frontend's API base URL (`127.0.0.1:8000`) matches the documented `uvicorn --port 8000`.

## 4. Files created
- `careflow-backend/app/routers/auth.py` — added `PUT /me` and `POST /change-password`
- `careflow-backend/app/schemas.py` — added `UserUpdate`, `PasswordChangeRequest`
- `careflow-frontend/departments.js` — full rewrite with real CRUD (was read-only)
- `AUDIT_REPORT.md` — this file

## 5. Files modified
`appointments.js`, `prescriptions.js`, `billing.js`, `doctors.js`, `dashboard.js`, `settings.js`, `mock-data.js`, `departments.html`, `.env` (redacted)

## 6. Files deleted
`data-manager.js`, `billing-init.js`, `assistant.js`, `.venv/` (Windows-only, unusable, shouldn't be in the repo)

## 7. API endpoints (all pre-existing and real; new ones marked)
```
POST   /api/auth/login
GET    /api/auth/me
PUT    /api/auth/me                 ← new
POST   /api/auth/change-password    ← new
POST   /api/auth/logout

GET/POST            /api/{patients|doctors|appointments|departments|lab-reports|prescriptions|billing}
GET/PUT/DELETE       .../{id}
POST   /api/ai/chat  (or similar — see ai_assistant.py)
GET    /api/health
```

## 8. Remaining limitations (not fixed — documented, not faked)
- **Patients page has no Edit/Delete UI.** The backend fully supports `PUT/DELETE /api/patients/{id}`, but the frontend only exposes Create (via Add Patient) and Read (list/detail). Building that UI is a genuine feature addition, not a bug fix, so I've left it as a known gap rather than bolt on a new modal unprompted.
- **Notifications** has no backend model and no frontend UI beyond a decorative bell icon. Building this is a new feature, not a fix.
- **Profile fields beyond name** (phone, department, email) aren't backed by columns on the `User` model, so "Save Profile" still only writes those to `localStorage`. Persisting them for real needs a schema change I didn't make unprompted.
- **I could not actually run the servers in this sandbox** — no outbound network access for `pip install`, and the bundled `.venv` is Windows-only. Every fix here was verified statically: `python3 -m py_compile` on all backend files, `node --check` on all frontend JS, and manual tracing of each data flow (frontend call → route → schema → model → DB column). You should do one real end-to-end run before trusting this in anything resembling production.

## 9. Exact commands to run the project

**Backend** (from `careflow-backend/`):
```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
The database is created and seeded automatically on first run (SQLite file `careflow.db`, via `Base.metadata.create_all()` + `seed_if_empty()` in `main.py`) — no separate migrate/seed command is needed. To reseed from scratch, stop the server and delete `careflow.db`.

**Frontend** (from `careflow-frontend/`) — any static file server works, e.g.:
```bash
python3 -m http.server 5500
```

**URLs:**
- Backend API: `http://127.0.0.1:8000` (docs at `http://127.0.0.1:8000/docs`)
- Frontend: `http://127.0.0.1:5500` (open `login.html`)

Before first login, check `careflow-backend/app/seed_data.py` for the seeded demo user's email/password.

## 10. Security note — action required
An OpenAI API key was found live in `careflow-backend/.env` inside the uploaded project. It has been **redacted** in the delivered copy, but since it existed in a file that left your machine, **please rotate it now** in your OpenAI dashboard regardless of what you do with this project going forward.
