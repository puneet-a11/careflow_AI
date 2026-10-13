import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, SessionLocal
from app import models, schemas
from app.seed_data import seed_if_empty
from app.migrations import run_migrations
from app.crud_factory import make_crud_router
from app.routers import auth as auth_router
from app.routers import ai_assistant as ai_router
from app.routers import permissions as permissions_router
from app.routers import users as users_router
from app.routers import opd as opd_router
from app.routers import ipd as ipd_router
from app.routers import pharmacy as pharmacy_router
from app.routers import lab_orders as lab_orders_router
from app.routers import dashboard as dashboard_router
from app.routers import lab_report_documents as lab_report_documents_router
from app.routers import billing as billing_router

Base.metadata.create_all(bind=engine)
run_migrations(engine)

with SessionLocal() as db:
    seed_if_empty(db)

# In production (DEBUG=false) the interactive API docs and raw OpenAPI
# schema are disabled by default, since they enumerate every endpoint,
# field, and internal shape to anyone who finds the URL. Re-enable
# explicitly if you want them (e.g. behind your own auth/proxy) by
# setting ENABLE_DOCS=true.
_enable_docs = settings.DEBUG or os.getenv("ENABLE_DOCS", "false").lower() in ("1", "true", "yes")

app = FastAPI(
    title="CareFlow AI - Backend API",
    description="REST API backing the CareFlow AI hospital management frontend.",
    version="1.0.0",
    docs_url="/docs" if _enable_docs else None,
    redoc_url="/redoc" if _enable_docs else None,
    openapi_url="/openapi.json" if _enable_docs else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Adds standard defensive headers to every response.

    Kept deliberately conservative so it doesn't break the app:
    - No 'Content-Security-Policy: default-src none' style lockdown that
      would break the Chart.js / FontAwesome CDN assets the frontend
      already uses in production.
    - HSTS is only sent when the request actually arrived over HTTPS
      (sending it over plain HTTP is a no-op in browsers, but skipping it
      also avoids misleadingly implying HTTPS is configured when it may
      not be, e.g. in local dev).
    """
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(auth_router.router)
app.include_router(ai_router.router)
app.include_router(permissions_router.router)
app.include_router(users_router.router)
app.include_router(opd_router.router)
app.include_router(ipd_router.router)
app.include_router(pharmacy_router.router)
app.include_router(lab_orders_router.router)
app.include_router(dashboard_router.router)
app.include_router(lab_report_documents_router.router)
app.include_router(billing_router.router)

app.include_router(make_crud_router(
    model=models.Patient, schema_out=schemas.PatientOut, schema_create=schemas.PatientCreate,
    schema_update=schemas.PatientUpdate, prefix="/api/patients", tag="patients", id_prefix="P",
    permission_module="patients", soft_delete=True,
))
app.include_router(make_crud_router(
    model=models.Doctor, schema_out=schemas.DoctorOut, schema_create=schemas.DoctorCreate,
    schema_update=schemas.DoctorUpdate, prefix="/api/doctors", tag="doctors", id_prefix="D",
    permission_module="doctors",
))
app.include_router(make_crud_router(
    model=models.Appointment, schema_out=schemas.AppointmentOut, schema_create=schemas.AppointmentCreate,
    schema_update=schemas.AppointmentUpdate, prefix="/api/appointments", tag="appointments", id_prefix="A",
    permission_module="appointments",
))


def _department_delete_guard(db, department) -> None:
    """Refuse to delete a department that doctors are still assigned to.

    `Doctor.department` is a free-text name match, not a foreign key (see
    models.py), so there's no database-level ON DELETE protection - this
    is the only thing standing between deleting a department and leaving
    doctors pointing at a department that no longer exists.
    """
    linked_doctors = (
        db.query(models.Doctor)
        .filter(models.Doctor.department == department.name)
        .count()
    )
    if linked_doctors:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete '{department.name}' - {linked_doctors} doctor"
                f"{'s are' if linked_doctors != 1 else ' is'} still assigned to it. "
                "Reassign or remove those doctors first."
            ),
        )


app.include_router(make_crud_router(
    model=models.Department, schema_out=schemas.DepartmentOut, schema_create=schemas.DepartmentCreate,
    schema_update=schemas.DepartmentUpdate, prefix="/api/departments", tag="departments", id_prefix="dep",
    permission_module="departments",
    pre_delete_check=_department_delete_guard,
))
app.include_router(make_crud_router(
    model=models.LabReport, schema_out=schemas.LabReportOut, schema_create=schemas.LabReportCreate,
    schema_update=schemas.LabReportUpdate, prefix="/api/lab-reports", tag="lab-reports", id_prefix="L",
    permission_module="lab-reports",
))
app.include_router(make_crud_router(
    model=models.Prescription, schema_out=schemas.PrescriptionOut, schema_create=schemas.PrescriptionCreate,
    schema_update=schemas.PrescriptionUpdate, prefix="/api/prescriptions", tag="prescriptions", id_prefix="RX",
    permission_module="prescriptions",
))
# Billing has its own dedicated router (app/routers/billing.py), not the
# generic crud_factory - it outgrew "generic resource" once itemized
# lines, server-computed discount/tax, and the void/reissue workflow
# were added. See that file for why.


@app.get("/")
def root():
    return {"status": "ok", "service": "CareFlow AI backend", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}
