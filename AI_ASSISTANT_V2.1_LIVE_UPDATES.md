# CareFlow AI Assistant — v2.1: Live Frontend Updates After AI Writes

Adds the one thing missing from v2: when the AI assistant changes the database, the
frontend now reflects it immediately, without a manual reload.

## Why this was needed

`careflow-frontend/patients.js` (and most other list pages) call `getPatients()` etc.
**once** on page load, which returns whatever is already sitting in the client-side cache
(`CareFlowAPI.getCached(...)`, populated at login by `hydrate()`). They do **not**
independently re-fetch from the server on every visit. So if the AI updated a patient's
vitals in the chat, then you navigated to the Patients page, you'd see stale data until
the next full login — the AI's write was real, but nothing told the frontend to refresh.

## What changed

**Backend:**
- `schemas.ChatResponse` gained three additive, optional fields (old clients ignoring them
  keep working): `data_changed: bool`, `affected_entities: list[str]`,
  `affected_patient_id: str | None`.
- `gemini_assistant.py`: `chat()` and `_run_gemini_turn()` now return a small `ChatResult`
  object instead of a bare string, tracking whether any write tool actually executed
  (create/update/delete, including ones that only complete after user confirmation), which
  resource(s) it touched (`patients`, `doctors`, `appointments`, `prescriptions`,
  `labReports`, `billing` — matching the exact keys `careflow-frontend/api.js` already
  uses for its cache), and which patient (if any) was affected.
- `routers/ai_assistant.py`'s `/chat` endpoint unpacks this into the response.

**Frontend (`ai-assistant.js`):**
- After every chat reply, if `data_changed` is true, it calls the existing
  `CareFlowAPI.hydrate()` (re-fetches all 7 core resources and re-populates the shared
  cache) — the same thing that already runs at login.
- If `affected_patient_id` is present, it also fetches that specific patient and updates
  the "Patient Context" sidebar panel (previously always stuck on "No patient selected"),
  so you can see at a glance which patient the AI last touched and their current
  status/severity.

## Verified

- Full backend `py_compile` + frontend `node --check` pass.
- Re-ran the tool-declaration consistency check (26 tools, zero mismatches) to make sure
  nothing broke.
- Simulated an end-to-end turn with a fake Gemini client (function-call for
  `update_patient_vitals` → tool executes → final text) and confirmed `chat()` correctly
  returns `data_changed=True`, `affected_entities={"patients"}`, and the right
  `affected_patient_id` — the exact values the frontend now acts on.

## Known scope limit (being upfront about it)

This refreshes the cache and the AI-assistant page's own patient panel. It does **not**
push a live update into an *already-open* Patients/Appointments/etc. tab without
navigating to it — that would need WebSockets or polling, which this project doesn't have.
In practice: since those pages read from cache once on load, as soon as you (re)visit or
reload them after chatting with the AI, they'll show the fresh data — same-tab, no-reload
"instant" updates while sitting on a different already-open page are the one thing not
covered here.

## Note on the zip you uploaded this round

`careflow-ai-fixed__1_.zip` was my very first deliverable from earlier in this
conversation (before any Gemini/AI-tools work existed — no `gemini_assistant.py`, no
`ai_tools.py`). I built this round on top of my latest complete version instead, so none
of the AI assistant work would be lost. Going forward, the zip attached to this message
(`careflow-ai-gemini-v3.zip`) is the current, complete state — please use that one if you
upload again.
