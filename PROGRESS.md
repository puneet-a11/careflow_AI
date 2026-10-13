# CareFlow AI - Progress

Latest pass: Billing edit completion, Lab Report edit, Prescription edit,
Doctor/Department re-verification, sidebar/navbar clipping fix, RBAC/settings/
notification/AI/security audits, legacy dependency cleanup.

Status labels: FIXED, VERIFIED STATICALLY, VERIFIED AT RUNTIME, NOT IMPLEMENTED,
OPTIONAL, MANUAL TEST REQUIRED, SECURITY ACTION REQUIRED.

## Phase status

| Phase | Outcome | Status |
| --- | --- | --- |
| 1. Billing edit flow | Completed; POST vs PUT, no duplicates, full error handling, payment status wired to the real enum; discount/tax/line items out of scope | FIXED |
| 2. Lab Report edit | Implemented with RBAC and document preservation; dead page script repaired | FIXED |
| 3. Prescription edit | Implemented with RBAC; medicines structure preserved | FIXED |
| 4. Doctor + Department check | No regressions found | VERIFIED STATICALLY |
| 5. Sidebar/navbar clipping | Root causes fixed; measured clean at all 8 breakpoints | FIXED / VERIFIED AT RUNTIME |
| 6. RBAC UI consistency | Buttons aligned with backend policy | FIXED |
| 7. Settings and profile | Real vs local-only persistence documented honestly | VERIFIED STATICALLY |
| 8. Notification/profile dropdown | No notification backend exists - marked not implemented | NOT IMPLEMENTED / OPTIONAL |
| 9. API and error handling | describeError added and adopted in the modules changed | FIXED |
| 10. AI assistant | Static security review passed; live testing not done | VERIFIED STATICALLY / MANUAL TEST REQUIRED |
| 11. Legacy cleanup | Misleading Django dependencies removed | FIXED |
| 12. Security hardening | Findings S1-S16 recorded; 4 items need action | SECURITY ACTION REQUIRED |
| 13. Testing | Headless browser + syntax checks done; backend not run | VERIFIED AT RUNTIME / MANUAL TEST REQUIRED |
| 14. Reports and ZIP | Three reports updated; project rezipped | FIXED |

## Changed files in this pass

- careflow-frontend/api.js - describeError() + STATUS_FALLBACKS
- careflow-frontend/billing.js - edit flow, in-flight guard, RBAC, error handling
- careflow-frontend/billing.html - removed unsupported Overdue status and Notes field
- careflow-frontend/lab-reports.js - dead-code fix, edit + delete actions, error handling
- careflow-frontend/lab-reports.html - new edit modal
- careflow-frontend/prescriptions.js - edit mode, RBAC, error handling
- careflow-frontend/style.css - sidebar/header clipping fixes + breakpoint pass
- careflow-frontend/components.css - body scroll lock for the open drawer
- careflow-frontend/app.js - drawer open/close helpers, Escape, nav tooltips
- careflow-frontend/settings.html - now loads app.js
- careflow-backend/requirements.txt - Django pins and misleading comment removed
- FINAL_CONSOLIDATED_REPORT.md, FUNCTIONALITY_AUDIT_REPORT.md, PROGRESS.md

## Not finished / next up

1. Run the backend and execute the manual test checklist (report section 17).
2. Roll describeError out to the remaining modules.
3. Decide whether lab reports and prescriptions need a real void-and-reissue model.
4. Address security items S3, S11, S12, S16 before production.
5. Implement a notification backend, or remove the header dropdown.

## Session: 2026-09-14 — Itemized billing, discount/tax, void/reissue, prescription instructions

Note: this session started from a freshly re-uploaded project zip that had
diverged from what was last delivered (Django deps already removed from
requirements.txt with its own explanatory comment, billing.js/api.js
larger) - continued from that actual uploaded state rather than assuming
my last known state was still current.

### 1. Billing — itemized line items (IMPLEMENTED)
- New `BillingItem` model/table (`billing_items`), auto-created via the
  existing `Base.metadata.create_all()` on startup - no migration entry
  needed for the new table itself, only for new columns on existing
  tables.
- `Billing.consultation/lab/medicine` kept as legacy fields (never
  removed) so old bills keep displaying exactly as before; new bills use
  `items` instead.
- Frontend: New/Edit Invoice modal now has a dynamic item table (add/
  remove rows, description/qty/unit price, live-calculated amount per
  row) instead of the three flat charge fields (hidden, not deleted, for
  backward compatibility).
- Invoice view/print shows itemized rows when `bill.items` exists,
  falling back to the old consultation/lab/medicine rows for legacy bills
  with no items - one template, both cases handled.

### 2. Billing — discount & tax (IMPLEMENTED)
- Backend: `Billing.subtotal/discountType/discountValue/discountAmount/
  taxType/taxValue/taxAmount` + a single `_compute_totals()` function in
  the new `routers/billing.py` that is the ONLY place these are ever
  computed. **The server always recalculates on create and update -
  client-sent totals are never trusted or stored.** Discount is capped at
  the subtotal (can't go negative); tax is calculated on the
  post-discount amount (documented as the convention used, since "before
  or after discount" is a real, sometimes contractual choice this project
  never specified).
- Backend validation: percentage values >100% rejected at the schema
  level (Pydantic validator), independent of frontend checks.
- Frontend: mirrors the exact same calculation client-side for a live
  preview (Subtotal / Discount / Tax / Grand Total), but this is a
  preview only - confirmed by design, not by accident, since the backend
  recomputes independently regardless of what's sent.
- **Runtime-verified**, not just reviewed: ran the real calculation logic
  with concrete numbers (10% discount, flat-amount discount exceeding
  subtotal correctly capped, combined discount+tax, zero-subtotal edge
  case) - all correct. Then ran a full lifecycle simulation against a
  copy of the real database: create a 3-item bill with 10% discount + ₹50
  flat tax -> subtotal 1150, discount 115, tax 50, total 1085, all
  arithmetically confirmed.

### 3. Prescriptions — instructions field (IMPLEMENTED)
- `Prescription.instructions` (nullable - existing rows load fine with
  no value, real backward compatibility, not just "doesn't crash").
- Added to the create form, the existing reissue-style pre-fill flow, the
  view/print detail section, and CSV export. Left out of the compact
  table row by design (would clutter a fixed-width list column; the
  detail view is where the full text belongs).
- Found while working on this: prescriptions.js already has a real
  PUT-based edit flow (`editingPrescriptionId`) that wasn't there in an
  earlier audit pass - instructions was wired into that path too, so
  editing an existing prescription can also set/change it.

### 4. Billing — immutable void-and-reissue workflow (IMPLEMENTED)
- Billing promoted out of the generic CRUD factory into its own
  dedicated router (`routers/billing.py`) - it outgrew "generic resource"
  once items/discount/tax/void needed real business logic the generic
  factory shouldn't have to know about.
- `POST /billing/{id}/void` - reason required (min 3 chars, enforced by
  the request schema, not just the UI), sets status=Void + voidedAt/By,
  rejects if already void, audit-logged.
- Direct edit (PUT) and hard delete both now return 409 once a bill is
  Paid or Void - "finalized" bills are immutable; the only way to change
  one is void + issue a new bill that references it.
- Reissue: creating a new bill with `replacesBillId` set validates
  server-side that the referenced bill exists, is actually Void, and
  hasn't already been replaced by something else - then links both
  bills' `replacesBillId`/`replacedByBillId` fields bidirectionally.
- Frontend: "Void Invoice" (prompts for reason) and "Issue Corrected
  Bill" (pre-fills a new invoice from the voided one's items/discount/
  tax) actions in the invoice view modal. Void/Paid bills no longer show
  Edit/Delete icons in the table row, and `openEditInvoice()` shows a
  clear message instead of opening the form if somehow triggered anyway.
- RBAC: void requires `billing:edit` (same as who can already modify
  pending bills - admin + receptionist), not more restrictive, since it's
  a normal correction workflow action, not a higher-privilege one; hard
  delete stays `billing:delete` (admin-only), unchanged.
- **Runtime-verified** end-to-end against a copy of the real database:
  created an itemized bill, voided it with a reason, issued a replacement
  referencing it, confirmed the bidirectional link, confirmed the
  original's status would correctly block further edits.
- Own mistake caught and fixed during this work: an early version of the
  view-modal wiring accidentally deleted the `closeViewInvoice()`
  function declaration during a find-and-replace - caught immediately by
  `node --check` failing, fixed before moving on.

### 5. Notifications backend
Explicitly deferred by the user ("Later" / not in this sprint) - not
touched.

### Regression checks (same method as every prior session)
- Full `node --check` sweep, full backend `py_compile` sweep, `html.parser`
  well-formedness on every touched page, repo-wide ID-mismatch scan
  (only known dynamic-creation false positives remain, all individually
  verified), fake-data/credential grep sweep - all clean.
