"""
Dashboard analytics - server-side aggregation over the real database.

This exists so the dashboard doesn't have to download every patient/
appointment/lab-report/billing row to the browser just to count them
(see app/crud_factory.py's pagination note), and so there is exactly one
place that computes these numbers instead of ad-hoc JS on the frontend.

IMPORTANT: every number here comes from a real SQL COUNT/SUM against the
current database state. There is no random/seeded/fallback data anywhere
in this file - if the true count is 0, this returns 0. The frontend
(dashboard.js) must not "fill in" zeros with anything else.

Each section is only included if the current user's role has 'view'
permission on the matching RBAC module (app/permissions.py), so a user
who can't see billing in the UI doesn't get billing numbers from this
endpoint either - hiding it in the sidebar is not enough on its own.
"""
import re
from datetime import datetime, timedelta, timezone, date as date_cls

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.permissions import has_permission
from app.security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_SEVERITY_KEYS = ["Critical", "High", "Medium", "Low"]


def _time_to_minutes(value) -> int:
    """Minutes since midnight for the time formats stored in appointments:
    "09:30 AM" (seed/AI data) and "17:41" (the appointment form's time
    input). Unparseable/missing times sort to the end of their day."""
    text = str(value or "").strip().upper()
    match = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)?$", text)
    if not match:
        return 24 * 60
    hours, minutes, meridiem = int(match.group(1)), int(match.group(2)), match.group(3)
    if meridiem == "PM" and hours < 12:
        hours += 12
    elif meridiem == "AM" and hours == 12:
        hours = 0
    return hours * 60 + minutes


def _today_str() -> str:
    # Dates are stored as plain YYYY-MM-DD strings throughout this app
    # (see models.py) - matching that format (rather than converting to
    # datetime) avoids timezone-shift bugs when comparing to stored dates.
    return datetime.now(timezone.utc).date().isoformat()


@router.get("/analytics")
def get_dashboard_analytics(
    # The browser passes ITS local calendar day so "today" matches what the
    # person sees on their screen even when the server runs in another
    # timezone (e.g. a UTC server and a user in India after midnight).
    today: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = current_user.role
    try:
        today = date_cls.fromisoformat(today) if today else date_cls.today()
    except ValueError:
        today = date_cls.today()
    today_str = today.isoformat()
    data: dict = {"generated_at": datetime.now(timezone.utc).isoformat()}

    # ---------------- Patients ----------------
    if has_permission(role, "patients", "view"):
        base_q = db.query(models.Patient).filter(models.Patient.isArchived.is_(False))
        total = base_q.count()
        severity_rows = (
            db.query(models.Patient.severity, func.count(models.Patient.id))
            .filter(models.Patient.isArchived.is_(False))
            .group_by(models.Patient.severity)
            .all()
        )
        severity_counts = {k: 0 for k in _SEVERITY_KEYS}
        for severity, count in severity_rows:
            if severity in severity_counts:
                severity_counts[severity] = count
        # A Critical/High patient who has already been discharged is no
        # longer an active alert, so alerts only count patients still in care.
        in_care = or_(models.Patient.status.is_(None), models.Patient.status != "Discharged")
        active_rows = (
            db.query(models.Patient.severity, func.count(models.Patient.id))
            .filter(models.Patient.isArchived.is_(False))
            .filter(in_care)
            .group_by(models.Patient.severity)
            .all()
        )
        active_counts = {k: 0 for k in _SEVERITY_KEYS}
        for severity, count in active_rows:
            if severity in active_counts:
                active_counts[severity] = count
        discharged = (
            db.query(func.count(models.Patient.id))
            .filter(models.Patient.isArchived.is_(False))
            .filter(models.Patient.status == "Discharged")
            .scalar()
            or 0
        )
        data["patients"] = {
            "total": total,
            "critical": severity_counts["Critical"],
            "high": severity_counts["High"],
            "medium": severity_counts["Medium"],
            "low": severity_counts["Low"],
            "active": total - discharged,
            "discharged": discharged,
            "alerts_critical": active_counts["Critical"],
            "alerts_high": active_counts["High"],
            "alerts": active_counts["Critical"] + active_counts["High"],
        }

    # ---------------- Appointments ----------------
    if has_permission(role, "appointments", "view"):
        not_cancelled = models.Appointment.status != "Cancelled"

        today_count = (
            db.query(func.count(models.Appointment.id))
            .filter(models.Appointment.date == today_str)
            .filter(not_cancelled)
            .scalar()
            or 0
        )

        # Real per-day counts for the NEXT 7 days (today inclusive), soonest
        # first. A day with no appointments is reported as 0.
        window_end = today + timedelta(days=6)
        rows = (
            db.query(models.Appointment.date, func.count(models.Appointment.id))
            .filter(models.Appointment.date >= today_str)
            .filter(models.Appointment.date <= window_end.isoformat())
            .filter(not_cancelled)
            .group_by(models.Appointment.date)
            .all()
        )
        counts_by_date = {d: c for d, c in rows}
        next_7_days = [
            {
                "date": (today + timedelta(days=i)).isoformat(),
                "count": counts_by_date.get((today + timedelta(days=i)).isoformat(), 0),
            }
            for i in range(7)
        ]

        # Appointments still to happen: today or later, not finished/cancelled.
        pending_q = (
            db.query(models.Appointment)
            .filter(models.Appointment.date >= today_str)
            .filter(models.Appointment.status.notin_(["Completed", "Cancelled"]))
        )
        upcoming_rows = sorted(
            pending_q.all(),
            key=lambda a: (a.date or "", _time_to_minutes(a.time)),
        )
        upcoming = [
            {
                "id": a.id,
                "patientId": a.patientId,
                "patientName": a.patientName,
                "doctor": a.doctor,
                "type": a.type,
                "date": a.date,
                "time": a.time,
                "status": a.status,
            }
            for a in upcoming_rows[:5]
        ]

        status_rows = (
            db.query(models.Appointment.status, func.count(models.Appointment.id))
            .group_by(models.Appointment.status)
            .all()
        )

        data["appointments"] = {
            "today": today_count,
            "next_7_days": next_7_days,
            "next_7_days_total": sum(d["count"] for d in next_7_days),
            "upcoming": upcoming,
            "upcoming_total": len(upcoming_rows),
            "by_status": {status or "Unknown": count for status, count in status_rows},
        }

    # ---------------- Lab reports ----------------
    if has_permission(role, "lab-reports", "view"):
        total_labs = db.query(func.count(models.LabReport.id)).scalar() or 0
        abnormal = (
            db.query(func.count(models.LabReport.id))
            .filter(models.LabReport.status == "Abnormal")
            .scalar()
            or 0
        )
        # A report is Pending until its document has been uploaded - the
        # same rule the Lab Reports page uses. Normal/Abnormal only says how
        # the result reads, not whether the report is finished.
        pending_docs = (
            db.query(func.count(models.LabReport.id))
            .filter(or_(models.LabReport.documentFilename.is_(None), models.LabReport.documentFilename == ""))
            .scalar()
            or 0
        )
        data["labs"] = {
            "total": total_labs,
            "abnormal": abnormal,
            "pending": pending_docs,
            "uploaded": total_labs - pending_docs,
        }

    # ---------------- Billing ----------------
    if has_permission(role, "billing", "view"):
        pending_amount = (
            db.query(func.coalesce(func.sum(models.Billing.total), 0))
            .filter(models.Billing.status == "Pending")
            .scalar()
            or 0
        )
        paid_amount = (
            db.query(func.coalesce(func.sum(models.Billing.total), 0))
            .filter(models.Billing.status == "Paid")
            .scalar()
            or 0
        )
        pending_count = (
            db.query(func.count(models.Billing.id))
            .filter(models.Billing.status == "Pending")
            .scalar()
            or 0
        )
        data["billing"] = {
            "pending_amount": round(float(pending_amount), 2),
            "paid_amount": round(float(paid_amount), 2),
            "pending_count": pending_count,
        }

    return data
