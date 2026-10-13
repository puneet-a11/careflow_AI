# CareFlow AI - Functionality Audit Report

This file records the functional (non-security) audit of the current pass.
Full detail, including security findings and the deployment checklist, lives in
FINAL_CONSOLIDATED_REPORT.md.

Status labels: FIXED, VERIFIED STATICALLY, VERIFIED AT RUNTIME, NOT IMPLEMENTED,
OPTIONAL, MANUAL TEST REQUIRED, SECURITY ACTION REQUIRED.

## Module summary

| Module | Finding | Status |
| --- | --- | --- |
| Billing | Edit flow completed: separate create/edit modes, POST vs PUT /billing/{id}, no duplicate on edit, in-flight guard, status-aware errors, table re-read after save | FIXED |
| Billing | Payment status is backend-supported (Pending/Paid); UI control validated and RBAC-gated; server already audits updates | FIXED |
| Billing | "Overdue" status option and "Notes" textarea removed - neither exists in the backend schema | FIXED |
| Billing | Line items, discount, tax - no columns in the model | NOT IMPLEMENTED (out of scope) |
| Lab Reports | Stray top-level code above the IIFE threw a ReferenceError and disabled the entire page script | FIXED |
| Lab Reports | Delete button was missing from rendered rows | FIXED |
| Lab Reports | Edit feature added (PUT /lab-reports/{id}), reusing existing modal styles; documents untouched by edit | FIXED |
| Lab Reports | Document upload/replace/remove/download preserved unchanged | VERIFIED STATICALLY |
| Lab Reports | No void-and-reissue model exists in the schema; final behaviour is RBAC-restricted, audited direct editing | VERIFIED STATICALLY |
| Prescriptions | Edit feature added (PUT /prescriptions/{id}) reusing the existing modal; medicines list structure preserved | FIXED |
| Prescriptions | "Instructions" field does not exist in the backend schema | NOT IMPLEMENTED |
| Prescriptions | No void field exists; direct editing with RBAC + audit is the final behaviour | VERIFIED STATICALLY |
| Doctors | active/inactive toggle, admin-only RBAC, exclusion from new pickers, historical preservation, CSV export | VERIFIED STATICALLY |
| Departments | Server-side 409 delete guard with a useful message surfaced in the UI | VERIFIED STATICALLY |
| Sidebar/Navbar | Heading and label clipping root causes fixed in CSS; tooltips added | FIXED |
| Sidebar/Navbar | 5 pages x 8 widths in headless Chromium: 0 clipped labels, 0 overflow, 0 JS errors | VERIFIED AT RUNTIME |
| Mobile drawer | Escape / overlay / nav-item close via one path; body scroll lock always released | FIXED |
| settings.html | Was the only sidebar page not loading app.js | FIXED |
| RBAC UI | Action buttons aligned with app/permissions.py; Permissions fails closed | FIXED / VERIFIED STATICALLY |
| Settings | Profile save and password change hit real endpoints; notification prefs are local-only | VERIFIED STATICALLY |
| Notifications | No backend notification model or route exists; header list is static | NOT IMPLEMENTED / OPTIONAL |
| AI Assistant | Key server-side only, per-tool RBAC, destructive-action confirmation, audit logging | VERIFIED STATICALLY |
| AI Assistant | Live Gemini call and prompt-injection testing | MANUAL TEST REQUIRED |
| API errors | describeError() covers 400/401/403/404/409/413/415/422/429/5xx/network | FIXED |
| API errors | Not yet adopted by Patients, Appointments, OPD, IPD, Pharmacy, Lab Orders, Doctors | OPTIONAL |
| Legacy cleanup | Django pins and the misleading "primary backend runtime" comment removed from requirements.txt | FIXED |
| Legacy cleanup | mock-data.js arrays remain commented out; not used to mask backend failures | VERIFIED STATICALLY |
| Runtime | Backend not started (FastAPI not installed in the audit environment) | MANUAL TEST REQUIRED |

## Bug list

See FINAL_CONSOLIDATED_REPORT.md section 2 (B1-B10) for the exact cause and fix
of each bug found in this pass.

---

## Addendum — September 14, 2026: Itemized billing, discount/tax, void/reissue, prescription instructions

Started from a freshly re-uploaded project that had diverged from the last delivered state (independently continued elsewhere) - inspected fresh rather than assuming continuity.

| Item | Status | Notes |
|---|---|---|
| Billing line items | FIXED / IMPLEMENTED | New `BillingItem` table, dynamic add/remove UI, itemized invoice view/print. MANUAL TEST REQUIRED in a real browser. |
| Billing discount & tax | FIXED / IMPLEMENTED | Server is authoritative - `_compute_totals()` recalculates on every create/update regardless of client input. VERIFIED AT RUNTIME (see below), MANUAL TEST REQUIRED for the actual UI. |
| Prescription instructions field | FIXED / IMPLEMENTED | Nullable field, backward compatible; also wired into an existing PUT-based edit flow discovered during this work. MANUAL TEST REQUIRED. |
| Billing void-and-reissue | FIXED / IMPLEMENTED | Dedicated router, mandatory-reason void, 409 on editing/deleting finalized bills, bidirectional replaces/replacedBy linkage. VERIFIED AT RUNTIME (full lifecycle). |
| Notifications backend | NOT IMPLEMENTED (deferred) | Explicitly out of scope this sprint per your instruction. |

### Runtime verification actually performed

Two genuine runtime checks against a copy of the real database (not just source review):

1. **Calculation engine** - ran the literal `_compute_totals` logic with concrete numbers: 10% discount alone, flat discount exceeding the subtotal (correctly capped, doesn't go negative), combined discount+tax, zero-subtotal edge case. All correct.
2. **Full bill lifecycle** - created a 3-item bill (Consultation ×1, X-Ray ×2, Paracetamol ×10) with 10% discount + ₹50 flat tax against a copy of the actual bundled database, confirmed subtotal=1150/discount=115/tax=50/total=1085 arithmetically, voided it with a reason, issued a replacement bill referencing the void, confirmed the bidirectional `replacesBillId`/`replacedByBillId` link, confirmed the original's `Void` status would correctly trigger the 409 rejection path for further edits.

### A mistake made and caught during this session

While wiring the Void/Reissue buttons into the invoice view modal, a find-and-replace edit accidentally deleted the `closeViewInvoice()` function's own declaration line. This was caught immediately by `node --check` failing before moving to the next step, and fixed in the same turn. Noting this not to bury it, but because it's a useful data point: automated syntax checking after every edit is what caught this, not the edit being careful enough the first time - the process worked as intended.
