import json

from app.database import SessionLocal
from app import models


def normalize_symptoms(value):
    """
    Always return symptoms as a Python list.

    Handles:
      ["fever", "cough"]
      '["fever", "cough"]'
      "viral fever"
      None
    """

    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, tuple):
        return list(value)

    if isinstance(value, str):
        value = value.strip()

        if not value:
            return []

        # If DB contains JSON array as text
        try:
            parsed = json.loads(value)

            if isinstance(parsed, list):
                return parsed

            if isinstance(parsed, str) and parsed.strip():
                return [parsed.strip()]

        except (json.JSONDecodeError, TypeError):
            pass

        # Plain string -> one-item list
        return [value]

    return [str(value)]


db = SessionLocal()

try:
    patients = db.query(models.Patient).all()

    changed = 0

    for patient in patients:
        old_value = patient.symptoms
        new_value = normalize_symptoms(old_value)

        if old_value != new_value:
            print(
                f"{patient.id}: "
                f"{old_value!r} -> {new_value!r}"
            )

            patient.symptoms = new_value
            changed += 1

    db.commit()

    print()
    print("======================================")
    print("PATIENT DATA REPAIR COMPLETE")
    print("Patients checked :", len(patients))
    print("Patients changed :", changed)
    print("======================================")

finally:
    db.close()