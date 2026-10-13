# Legacy / unused - Django backend attempt

This is a second, incomplete backend implementation (Django + Django REST
Framework) that duplicates `careflow-backend/app/` (the real, active FastAPI
backend). It is NOT used by the frontend, the mobile app, or anything else
in this repo.

## Why this is here instead of deleted

Moved rather than deleted on 2026-09-11 pending your explicit confirmation
- see the audit report for the evidence this is unused. If you confirm,
delete this whole `_legacy_unused/` folder and remove `Django`,
`djangorestframework`, and `django-cors-headers` from `requirements.txt`.

## Evidence this is unused (verified, not assumed)

- `api/urls.py` has zero routes for OPD, IPD, pharmacy, or lab orders -
  `grep -c "opd\|ipd\|pharmacy\|lab_orders" api/urls.py` returns 0 - so it
  cannot serve `opd.html`/`ipd.html`/`pharmacy.html`/`lab-orders.html`,
  which the frontend and mobile app both load.
- The AI assistant here is fully stubbed (`AIUnavailableView`), while
  `app/gemini_assistant.py` is the real, working implementation the
  frontend's `ai-assistant.html` calls.
- `careflow-frontend/api.js` and `careflow-mobile` only ever call the
  FastAPI route shapes (`/api/opd`, `/api/dashboard/analytics`, etc.) -
  grepped, no reference to anything Django-specific anywhere outside this
  folder and `requirements.txt`/the old `README.md`.
- No Dockerfile, docker-compose, Procfile, or CI config exists anywhere in
  the repo that would designate either backend as "the one that gets
  deployed" - both bind port 8000 by default, so only one can ever run at
  a time regardless.
- It carries the same `normalize_role()` default-to-"doctor" bug that was
  fixed in the real backend (`app/permissions.py`) - it was never patched
  here, consistent with this being abandoned rather than maintained.
