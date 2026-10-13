from sqlalchemy.orm import Session

from app import models
from app.security import hash_password


def seed_if_empty(db: Session) -> None:
    if not db.query(models.User).first():
        db.add_all(
            [
                models.User(
                    email="admin@careflow.ai",
                    password_hash=hash_password("admin123"),
                    name="Dr. Rachel Green",
                    role="Senior Physician",
                    avatar="DR",
                ),
                models.User(
                    email="doctor@careflow.ai",
                    password_hash=hash_password("doctor123"),
                    name="Dr. John Smith",
                    role="Physician",
                    avatar="JS",
                ),
            ]
        )

    if not db.query(models.Patient).first():
        db.add_all(
            [
                models.Patient(
                    id="P001", mrn="MRN-10042", name="Emma Thompson", age=34, gender="Female",
                    bloodGroup="O+", allergies=["Penicillin", "Peanuts"],
                    vitals={"bp": "190/110", "hr": 112, "temp": 98.6, "spo2": 94, "rr": 22},
                    symptoms=["Chest pain", "Shortness of breath", "Hypertension"],
                    severity="Critical", triageScore=9, doctor="Dr. Carter", status="Waiting",
                    admissionDate="2025-03-15",
                    medicalHistory=["Hypertension (diagnosed 2020)", "Generalized Anxiety Disorder"],
                    currentMedications=["Lisinopril 10mg daily"], avatarBg="#ec4899",
                ),
                models.Patient(
                    id="P002", mrn="MRN-10089", name="James Wilson", age=67, gender="Male",
                    bloodGroup="A+", allergies=["Sulfa drugs"],
                    vitals={"bp": "150/90", "hr": 95, "temp": 101.2, "spo2": 96, "rr": 18},
                    symptoms=["Abdominal pain", "Fever", "Dehydration"],
                    severity="High", triageScore=7, doctor="Dr. Patel", status="In Progress",
                    admissionDate="2025-03-15",
                    medicalHistory=["Type 2 Diabetes (diagnosed 2015)", "GERD"],
                    currentMedications=["Metformin 500mg twice daily", "Omeprazole 20mg daily"],
                    avatarBg="#3b82f6",
                ),
                models.Patient(
                    id="P003", mrn="MRN-10056", name="Sarah Chen", age=28, gender="Female",
                    bloodGroup="B+", allergies=[],
                    vitals={"bp": "145/92", "hr": 88, "temp": 98.2, "spo2": 99, "rr": 16},
                    symptoms=["Headache", "Blurred vision", "Nausea"],
                    severity="Medium", triageScore=5, doctor="Dr. Lee", status="Waiting",
                    admissionDate="2025-03-15",
                    medicalHistory=["Migraine (chronic)", "Seasonal allergies"],
                    currentMedications=[], avatarBg="#8b5cf6",
                ),
                models.Patient(
                    id="P004", mrn="MRN-10033", name="Michael Brown", age=45, gender="Male",
                    bloodGroup="AB+", allergies=[],
                    vitals={"bp": "128/82", "hr": 78, "temp": 98.4, "spo2": 98, "rr": 16},
                    symptoms=["Ankle pain", "Swelling"],
                    severity="Low", triageScore=2, doctor="Dr. Williams", status="Checked In",
                    admissionDate="2025-03-15", medicalHistory=[], currentMedications=[],
                    avatarBg="#f59e0b",
                ),
                models.Patient(
                    id="P005", mrn="MRN-10012", name="Alice Kim", age=52, gender="Female",
                    bloodGroup="O-", allergies=[],
                    vitals={"bp": "138/88", "hr": 102, "temp": 98.1, "spo2": 97, "rr": 18},
                    symptoms=["Palpitations", "Dizziness", "Fatigue"],
                    severity="High", triageScore=6, doctor="Dr. Johnson", status="Triaging",
                    admissionDate="2025-03-15", medicalHistory=[], currentMedications=[],
                    avatarBg="#10b981",
                ),
            ]
        )

    if not db.query(models.Doctor).first():
        db.add_all(
            [
                models.Doctor(id="D001", name="Dr. Sarah Carter", specialization="Cardiology",
                               department="Cardiology", availability="Available", appointmentsToday=3,
                               patientCount=120, phone="+1 555-0101", email="sarah.carter@careflow.ai",
                               avatarBg="#4f46e5"),
                models.Doctor(id="D002", name="Dr. Raj Patel", specialization="Gastroenterology",
                               department="Gastroenterology", availability="Busy", appointmentsToday=5,
                               patientCount=95, phone="+1 555-0102", email="raj.patel@careflow.ai",
                               avatarBg="#f59e0b"),
                models.Doctor(id="D003", name="Dr. Michelle Lee", specialization="Neurology",
                               department="Neurology", availability="Available", appointmentsToday=2,
                               patientCount=78, phone="+1 555-0103", email="michelle.lee@careflow.ai",
                               avatarBg="#10b981"),
                models.Doctor(id="D004", name="Dr. David Williams", specialization="Orthopedics",
                               department="Orthopedics", availability="Off Duty", appointmentsToday=0,
                               patientCount=150, phone="+1 555-0104", email="david.williams@careflow.ai",
                               avatarBg="#ef4444"),
                models.Doctor(id="D005", name="Dr. Emily Johnson", specialization="Emergency Medicine",
                               department="Emergency", availability="Available", appointmentsToday=7,
                               patientCount=200, phone="+1 555-0105", email="emily.johnson@careflow.ai",
                               avatarBg="#06b6d4"),
            ]
        )

    if not db.query(models.Appointment).first():
        db.add_all(
            [
                models.Appointment(id="A001", patientId="P001", patientName="Emma Thompson",
                                     doctor="Dr. Sarah Carter", type="Cardiology", date="2025-03-15",
                                     time="09:00 AM", status="Pending"),
                models.Appointment(id="A002", patientId="P002", patientName="James Wilson",
                                     doctor="Dr. Raj Patel", type="Gastroenterology", date="2025-03-15",
                                     time="09:30 AM", status="In Progress"),
                models.Appointment(id="A003", patientId="P003", patientName="Sarah Chen",
                                     doctor="Dr. Michelle Lee", type="Neurology", date="2025-03-15",
                                     time="10:15 AM", status="Pending"),
                models.Appointment(id="A004", patientId="P004", patientName="Michael Brown",
                                     doctor="Dr. David Williams", type="Orthopedics", date="2025-03-15",
                                     time="10:45 AM", status="Checked In"),
                models.Appointment(id="A005", patientId="P005", patientName="Alice Kim",
                                     doctor="Dr. Emily Johnson", type="Emergency", date="2025-03-15",
                                     time="11:00 AM", status="Triaging"),
            ]
        )

    if not db.query(models.Department).first():
        db.add_all(
            [
                models.Department(id="dep1", name="Emergency", icon="fa-kit-medical", color="red",
                                    doctors=5, beds=20, patients=35,
                                    description="24/7 emergency care and trauma center"),
                models.Department(id="dep2", name="Cardiology", icon="fa-heart-pulse", color="indigo",
                                    doctors=4, beds=15, patients=22,
                                    description="Heart and vascular system care"),
                models.Department(id="dep3", name="Neurology", icon="fa-brain", color="teal",
                                    doctors=3, beds=10, patients=15,
                                    description="Brain and nervous system disorders"),
                models.Department(id="dep4", name="Orthopedics", icon="fa-bone", color="amber",
                                    doctors=3, beds=12, patients=18,
                                    description="Bone, joint, and muscle treatment"),
                models.Department(id="dep5", name="Pediatrics", icon="fa-child", color="green",
                                    doctors=4, beds=18, patients=30,
                                    description="Medical care for infants and children"),
                models.Department(id="dep6", name="General Medicine", icon="fa-stethoscope", color="blue",
                                    doctors=6, beds=25, patients=40,
                                    description="Primary care and general health"),
                models.Department(id="dep7", name="Radiology", icon="fa-x-ray", color="purple",
                                    doctors=2, beds=0, patients=50,
                                    description="Medical imaging and diagnostics"),
                models.Department(id="dep8", name="Pathology", icon="fa-flask", color="pink",
                                    doctors=2, beds=0, patients=60,
                                    description="Laboratory testing and analysis"),
            ]
        )

    if not db.query(models.LabReport).first():
        db.add_all(
            [
                models.LabReport(id="L001", patientId="P001", patientName="Emma Thompson",
                                   test="Troponin I", date="2025-03-15", doctor="Dr. Sarah Carter",
                                   result="0.12 ng/mL", status="Abnormal", normalRange="<0.04 ng/mL"),
                models.LabReport(id="L002", patientId="P002", patientName="James Wilson",
                                   test="Complete Blood Count", date="2025-03-15", doctor="Dr. Raj Patel",
                                   result="WBC 12.5 x10\u00b3/\u00b5L", status="Abnormal",
                                   normalRange="4.5-11.0 x10\u00b3/\u00b5L"),
                models.LabReport(id="L003", patientId="P003", patientName="Sarah Chen",
                                   test="MRI Brain", date="2025-03-14", doctor="Dr. Michelle Lee",
                                   result="No acute intracranial findings", status="Normal",
                                   normalRange="-"),
                models.LabReport(id="L004", patientId="P004", patientName="Michael Brown",
                                   test="X-Ray Ankle (AP/Lateral)", date="2025-03-15",
                                   doctor="Dr. David Williams", result="No fracture or dislocation",
                                   status="Normal", normalRange="-"),
            ]
        )

    if not db.query(models.Prescription).first():
        db.add_all(
            [
                models.Prescription(id="RX001", patientId="P001", patientName="Emma Thompson",
                                      doctor="Dr. Sarah Carter", diagnosis="Hypertensive Urgency",
                                      medicines=["Clonidine 0.1 mg"], dosage="1 tablet",
                                      frequency="Twice daily", duration="7 days", date="2025-03-15"),
                models.Prescription(id="RX002", patientId="P002", patientName="James Wilson",
                                      doctor="Dr. Raj Patel", diagnosis="Acute Gastroenteritis",
                                      medicines=["Ciprofloxacin 500 mg", "Oral Rehydration Salts"],
                                      dosage="1 tablet / 1 sachet", frequency="Twice daily / As needed",
                                      duration="5 days", date="2025-03-15"),
            ]
        )

    if not db.query(models.Billing).first():
        db.add_all(
            [
                models.Billing(id="B001", patientId="P001", patientName="Emma Thompson",
                                 consultation=150, lab=200, medicine=45, total=395,
                                 status="Pending", date="2025-03-15"),
                models.Billing(id="B002", patientId="P002", patientName="James Wilson",
                                 consultation=150, lab=120, medicine=30, total=300,
                                 status="Paid", date="2025-03-15"),
            ]
        )

    if not db.query(models.Ward).first():
        db.add_all(
            [
                models.Ward(id="W001", name="General Ward A", department="General Medicine", type="General"),
                models.Ward(id="W002", name="ICU", department="Cardiology", type="ICU"),
                models.Ward(id="W003", name="Private Rooms", department="General Medicine", type="Private"),
            ]
        )
        db.flush()
        db.add_all(
            [
                models.Bed(id="BED001", wardId="W001", bedNumber="A-01", status="Available"),
                models.Bed(id="BED002", wardId="W001", bedNumber="A-02", status="Available"),
                models.Bed(id="BED003", wardId="W001", bedNumber="A-03", status="Occupied"),
                models.Bed(id="BED004", wardId="W002", bedNumber="ICU-1", status="Available"),
                models.Bed(id="BED005", wardId="W002", bedNumber="ICU-2", status="Available"),
                models.Bed(id="BED006", wardId="W003", bedNumber="P-101", status="Available"),
            ]
        )

    if not db.query(models.Admission).first():
        db.add(
            models.Admission(
                id="ADM001", patientId="P001", patientName="Emma Thompson", wardId="W001",
                bedId="BED003", admittingDoctor="Dr. Carter", diagnosis="Hypertensive urgency, observation",
                admissionDate="2025-03-15", expectedDischargeDate="2025-03-18", status="Admitted",
            )
        )

    if not db.query(models.Medicine).first():
        db.add_all(
            [
                models.Medicine(id="MED001", name="Paracetamol 500mg", category="Analgesic", unit="tablet",
                                  batchNumber="PB-2401", quantity=500, reorderLevel=100,
                                  expiryDate="2027-06-30", pricePerUnit=1.5, supplier="MedSupply Co."),
                models.Medicine(id="MED002", name="Amoxicillin 250mg", category="Antibiotic", unit="capsule",
                                  batchNumber="AX-2312", quantity=40, reorderLevel=50,
                                  expiryDate="2026-11-15", pricePerUnit=4.0, supplier="MedSupply Co."),
                models.Medicine(id="MED003", name="Metformin 500mg", category="Antidiabetic", unit="tablet",
                                  batchNumber="MF-2405", quantity=300, reorderLevel=80,
                                  expiryDate="2027-01-20", pricePerUnit=2.0, supplier="Pharma Direct"),
                models.Medicine(id="MED004", name="Oral Rehydration Salts", category="Electrolyte", unit="sachet",
                                  batchNumber="ORS-2310", quantity=25, reorderLevel=30,
                                  expiryDate="2026-09-10", pricePerUnit=8.0, supplier="Pharma Direct"),
                models.Medicine(id="MED005", name="Cefixime 200mg", category="Antibiotic", unit="tablet",
                                  batchNumber="CF-2209", quantity=15, reorderLevel=40,
                                  expiryDate="2025-10-01", pricePerUnit=12.0, supplier="MedSupply Co."),
            ]
        )

    if not db.query(models.LabOrder).first():
        db.add(
            models.LabOrder(
                id="LO001", patientId="P002", patientName="James Wilson", test="Liver Function Test",
                orderedBy="Dr. Raj Patel", priority="Routine", status="Sample Collected",
                orderedDate="2025-03-15", sampleCollectedAt="2025-03-15T09:30:00+00:00",
                sampleCollectedBy="lab_tech@careflow.ai",
            )
        )

    db.commit()
