"""
Lightweight, idempotent startup migrations.

`Base.metadata.create_all()` (in main.py) only CREATES tables that don't
exist yet - it never ALTERs a table that's already there. That's fine
for a brand new database, but if you already have a running CareFlow
instance with real patient data in careflow.db and you pull in code that
adds a new column (like Patient.isArchived below), create_all() silently
does nothing and every query against that column breaks.

This module checks the actual columns present on each table at startup
and ALTERs in anything missing, then gets out of the way. It's deliberately
tiny and dependency-free (no Alembic) because this project's schema
churn is still small. If/when this file starts accumulating many
one-off column additions, that's the signal to move to Alembic-managed
versioned migrations instead - noted here so it isn't forgotten.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# table -> [(column_name, DDL_type_and_default), ...]
_PENDING_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "patients": [
        ("isArchived", 'BOOLEAN NOT NULL DEFAULT 0'),
        ("archivedAt", 'VARCHAR'),
        ("archivedBy", 'VARCHAR'),
    ],
    "users": [
        ("is_active", 'BOOLEAN NOT NULL DEFAULT 1'),
        ("token_version", 'INTEGER NOT NULL DEFAULT 0'),
    ],
    "doctors": [
        ("isActive", 'BOOLEAN NOT NULL DEFAULT 1'),
    ],
    "lab_reports": [
        ("documentFilename", 'VARCHAR'),
        ("documentContentType", 'VARCHAR'),
        ("documentUploadedAt", 'VARCHAR'),
        ("documentUploadedBy", 'VARCHAR'),
    ],
    "lab_orders": [
        ("sampleType", 'VARCHAR'),
        ("fastingRequired", 'BOOLEAN NOT NULL DEFAULT 0'),
        ("expectedTurnaround", 'VARCHAR'),
        ("clinicalNotes", 'VARCHAR'),
    ],
    "prescriptions": [
        ("instructions", 'VARCHAR'),
    ],
    "billing": [
        ("subtotal", 'FLOAT NOT NULL DEFAULT 0'),
        ("discountType", 'VARCHAR'),
        ("discountValue", 'FLOAT NOT NULL DEFAULT 0'),
        ("discountAmount", 'FLOAT NOT NULL DEFAULT 0'),
        ("taxType", 'VARCHAR'),
        ("taxValue", 'FLOAT NOT NULL DEFAULT 0'),
        ("taxAmount", 'FLOAT NOT NULL DEFAULT 0'),
        ("voidReason", 'VARCHAR'),
        ("voidedAt", 'VARCHAR'),
        ("voidedBy", 'VARCHAR'),
        ("replacesBillId", 'VARCHAR'),
        ("replacedByBillId", 'VARCHAR'),
    ],
}


def run_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, columns in _PENDING_COLUMNS.items():
            if table not in existing_tables:
                # Table doesn't exist yet -> create_all() will make it
                # with the up-to-date schema already. Nothing to do.
                continue

            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            for column_name, ddl_type in columns:
                if column_name in existing_columns:
                    continue
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN "{column_name}" {ddl_type}'))
                print(f"[migrations] Added column {table}.{column_name}")

        _backfill_billing_subtotal(conn, existing_tables)


def _backfill_billing_subtotal(conn, existing_tables) -> None:
    """One-time data fix, not just a schema change: existing bills (from
    before itemized billing/discount/tax existed) got `subtotal` added as
    a new column above, which starts at 0 for every existing row. A bill
    with subtotal=0 but a real total looks broken in the new itemized
    breakdown UI. Backfill subtotal = consultation+lab+medicine (their
    original charge fields) for exactly the rows this applies to, and
    only once - rows that already have a non-zero subtotal (new-style
    bills, or ones already backfilled) are left alone.
    """
    if "billing" not in existing_tables:
        return
    result = conn.execute(
        text(
            "UPDATE billing SET subtotal = COALESCE(consultation, 0) + COALESCE(lab, 0) + COALESCE(medicine, 0) "
            "WHERE (subtotal IS NULL OR subtotal = 0) "
            "AND (COALESCE(consultation, 0) + COALESCE(lab, 0) + COALESCE(medicine, 0)) > 0"
        )
    )
    if result.rowcount:
        print(f"[migrations] Backfilled billing.subtotal for {result.rowcount} existing bill(s)")
