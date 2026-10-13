// /* ============================================
//    CAREFLOW AI - MOCK DATA
//    Centralized demo data for all modules
//    ============================================ */

// var MOCK_PATIENTS = [
//   {
//     id: 'P001',
//     mrn: 'MRN-10042',
//     name: 'Emma Thompson',
//     age: 34,
//     gender: 'Female',
//     bloodGroup: 'O+',
//     allergies: ['Penicillin', 'Peanuts'],
//     vitals: { bp: '190/110', hr: 112, temp: 98.6, spo2: 94, rr: 22 },
//     symptoms: ['Chest pain', 'Shortness of breath', 'Hypertension'],
//     severity: 'Critical',
//     triageScore: 9,
//     doctor: 'Dr. Carter',
//     status: 'Waiting',
//     admissionDate: '2025-03-15',
//     medicalHistory: ['Hypertension (diagnosed 2020)', 'Generalized Anxiety Disorder'],
//     currentMedications: ['Lisinopril 10mg daily'],
//     avatarBg: '#ec4899'
//   },
//   {
//     id: 'P002',
//     mrn: 'MRN-10089',
//     name: 'James Wilson',
//     age: 67,
//     gender: 'Male',
//     bloodGroup: 'A+',
//     allergies: ['Sulfa drugs'],
//     vitals: { bp: '150/90', hr: 95, temp: 101.2, spo2: 96, rr: 18 },
//     symptoms: ['Abdominal pain', 'Fever', 'Dehydration'],
//     severity: 'High',
//     triageScore: 7,
//     doctor: 'Dr. Patel',
//     status: 'In Progress',
//     admissionDate: '2025-03-15',
//     medicalHistory: ['Type 2 Diabetes (diagnosed 2015)', 'GERD'],
//     currentMedications: ['Metformin 500mg twice daily', 'Omeprazole 20mg daily'],
//     avatarBg: '#3b82f6'
//   },
//   {
//     id: 'P003',
//     mrn: 'MRN-10056',
//     name: 'Sarah Chen',
//     age: 28,
//     gender: 'Female',
//     bloodGroup: 'B+',
//     allergies: [],
//     vitals: { bp: '145/92', hr: 88, temp: 98.2, spo2: 99, rr: 16 },
//     symptoms: ['Headache', 'Blurred vision', 'Nausea'],
//     severity: 'Medium',
//     triageScore: 5,
//     doctor: 'Dr. Lee',
//     status: 'Waiting',
//     admissionDate: '2025-03-15',
//     medicalHistory: ['Migraine (chronic)', 'Seasonal allergies'],
//     currentMedications: ['Sumatriptan 50mg as needed'],
//     avatarBg: '#f59e0b'
//   },
//   {
//     id: 'P004',
//     mrn: 'MRN-10033',
//     name: 'Michael Brown',
//     age: 45,
//     gender: 'Male',
//     bloodGroup: 'AB+',
//     allergies: ['Latex'],
//     vitals: { bp: '120/80', hr: 72, temp: 98.6, spo2: 99, rr: 14 },
//     symptoms: ['Ankle pain', 'Swelling'],
//     severity: 'Low',
//     triageScore: 2,
//     doctor: 'Dr. Williams',
//     status: 'Checked In',
//     admissionDate: '2025-03-15',
//     medicalHistory: ['Previous ankle sprain (2023)'],
//     currentMedications: [],
//     avatarBg: '#22c55e'
//   },
//   {
//     id: 'P005',
//     mrn: 'MRN-10012',
//     name: 'Alice Kim',
//     age: 52,
//     gender: 'Female',
//     bloodGroup: 'O-',
//     allergies: ['Aspirin', 'Ibuprofen'],
//     vitals: { bp: '160/95', hr: 102, temp: 99.1, spo2: 95, rr: 20 },
//     symptoms: ['Palpitations', 'Dizziness', 'Fatigue'],
//     severity: 'High',
//     triageScore: 6,
//     doctor: 'Dr. Johnson',
//     status: 'Triaging',
//     admissionDate: '2025-03-15',
//     medicalHistory: ['Atrial Fibrillation (diagnosed 2018)', 'Hyperlipidemia'],
//     currentMedications: ['Warfarin 5mg daily', 'Atorvastatin 20mg daily'],
//     avatarBg: '#a855f7'
//   }
// ];

// var MOCK_DOCTORS = [
//   { id: 'D001', name: 'Dr. Sarah Carter', specialization: 'Cardiology', department: 'Cardiology', availability: 'Available', appointmentsToday: 3, patientCount: 120, avatarBg: '#4f46e5' },
//   { id: 'D002', name: 'Dr. Raj Patel', specialization: 'Gastroenterology', department: 'Gastroenterology', availability: 'Busy', appointmentsToday: 5, patientCount: 95, avatarBg: '#f59e0b' },
//   { id: 'D003', name: 'Dr. Michelle Lee', specialization: 'Neurology', department: 'Neurology', availability: 'Available', appointmentsToday: 2, patientCount: 78, avatarBg: '#10b981' },
//   { id: 'D004', name: 'Dr. David Williams', specialization: 'Orthopedics', department: 'Orthopedics', availability: 'Off Duty', appointmentsToday: 0, patientCount: 150, avatarBg: '#ef4444' },
//   { id: 'D005', name: 'Dr. Emily Johnson', specialization: 'Emergency Medicine', department: 'Emergency', availability: 'Available', appointmentsToday: 7, patientCount: 200, avatarBg: '#06b6d4' }
// ];

// var MOCK_APPOINTMENTS = [
//   { id: 'A001', patientId: 'P001', patientName: 'Emma Thompson', doctor: 'Dr. Sarah Carter', type: 'Cardiology', date: '2025-03-15', time: '09:00 AM', status: 'Pending' },
//   { id: 'A002', patientId: 'P002', patientName: 'James Wilson', doctor: 'Dr. Raj Patel', type: 'Gastroenterology', date: '2025-03-15', time: '09:30 AM', status: 'In Progress' },
//   { id: 'A003', patientId: 'P003', patientName: 'Sarah Chen', doctor: 'Dr. Michelle Lee', type: 'Neurology', date: '2025-03-15', time: '10:15 AM', status: 'Pending' },
//   { id: 'A004', patientId: 'P004', patientName: 'Michael Brown', doctor: 'Dr. David Williams', type: 'Orthopedics', date: '2025-03-15', time: '10:45 AM', status: 'Checked In' },
//   { id: 'A005', patientId: 'P005', patientName: 'Alice Kim', doctor: 'Dr. Emily Johnson', type: 'Emergency', date: '2025-03-15', time: '11:00 AM', status: 'Triaging' }
// ];

// var MOCK_LAB_REPORTS = [
//   { id: 'L001', patientName: 'Emma Thompson', patientId: 'P001', test: 'Troponin I', date: '2025-03-15', doctor: 'Dr. Sarah Carter', result: '0.12 ng/mL', status: 'Abnormal', normalRange: '<0.04 ng/mL' },
//   { id: 'L002', patientName: 'James Wilson', patientId: 'P002', test: 'Complete Blood Count', date: '2025-03-15', doctor: 'Dr. Raj Patel', result: 'WBC 12.5 x10³/µL', status: 'Abnormal', normalRange: '4.5-11.0 x10³/µL' },
//   { id: 'L003', patientName: 'Sarah Chen', patientId: 'P003', test: 'MRI Brain', date: '2025-03-14', doctor: 'Dr. Michelle Lee', result: 'No acute intracranial findings', status: 'Normal', normalRange: '-' },
//   { id: 'L004', patientName: 'Michael Brown', patientId: 'P004', test: 'X-Ray Ankle (AP/Lateral)', date: '2025-03-15', doctor: 'Dr. David Williams', result: 'No fracture or dislocation', status: 'Normal', normalRange: '-' }
// ];

// var MOCK_PRESCRIPTIONS = [
//   { id: 'RX001', patientName: 'Emma Thompson', patientId: 'P001', doctor: 'Dr. Sarah Carter', diagnosis: 'Hypertensive Urgency', medicines: ['Clonidine 0.1 mg'], dosage: '1 tablet', frequency: 'Twice daily', duration: '7 days', date: '2025-03-15' },
//   { id: 'RX002', patientName: 'James Wilson', patientId: 'P002', doctor: 'Dr. Raj Patel', diagnosis: 'Acute Gastroenteritis', medicines: ['Ciprofloxacin 500 mg', 'Oral Rehydration Salts'], dosage: '1 tablet / 1 sachet', frequency: 'Twice daily / As needed', duration: '5 days', date: '2025-03-15' }
// ];

// var MOCK_BILLING = [
//   { id: 'B001', patientName: 'Emma Thompson', patientId: 'P001', consultation: 150, lab: 200, medicine: 45, total: 395, status: 'Pending', date: '2025-03-15' },
//   { id: 'B002', patientName: 'James Wilson', patientId: 'P002', consultation: 150, lab: 120, medicine: 30, total: 300, status: 'Paid', date: '2025-03-15' }
// ];

// /* Data access functions */
// function getPatients() {
//   return MOCK_PATIENTS;
// }

// function getPatientById(id) {
//   return MOCK_PATIENTS.find(function(p) { return p.id === id; });
// }

// function getDoctors() {
//   return MOCK_DOCTORS;
// }

// function getDoctorById(id) {
//   return MOCK_DOCTORS.find(function(d) { return d.id === id; });
// }

// function getAppointments() {
//   return MOCK_APPOINTMENTS;
// }

// function getAppointmentById(id) {
//   return MOCK_APPOINTMENTS.find(function(a) { return a.id === id; });
// }

// function getLabReports() {
//   return MOCK_LAB_REPORTS;
// }

// function getPrescriptions() {
//   return MOCK_PRESCRIPTIONS;
// }

// function getBilling() {
//   return MOCK_BILLING;
// }

// function addPatient(patient) {
//   patient.id = 'P' + String(MOCK_PATIENTS.length + 1).padStart(3, '0');
//   MOCK_PATIENTS.push(patient);
//   return patient;
// }

// function updatePatient(id, updates) {
//   var index = MOCK_PATIENTS.findIndex(function(p) { return p.id === id; });
//   if (index !== -1) {
//     MOCK_PATIENTS[index] = Object.assign({}, MOCK_PATIENTS[index], updates);
//     return MOCK_PATIENTS[index];
//   }
//   return null;
// }

// function deletePatient(id) {
//   var index = MOCK_PATIENTS.findIndex(function(p) { return p.id === id; });
//   if (index !== -1) {
//     MOCK_PATIENTS.splice(index, 1);
//     return true;
//   }
//   return false;
// }

/* ============================================
   CAREFLOW AI - MOCK DATA
   Centralized demo data for all modules
   ============================================ */


/* =====================================================
   PATIENTS
   ===================================================== */

var MOCK_PATIENTS = [
    {
        id: 'P001',
        mrn: 'MRN-10042',
        name: 'Emma Thompson',
        age: 34,
        gender: 'Female',
        bloodGroup: 'O+',
        allergies: ['Penicillin', 'Peanuts'],
        vitals: {
            bp: '190/110',
            hr: 112,
            temp: 98.6,
            spo2: 94,
            rr: 22
        },
        symptoms: [
            'Chest pain',
            'Shortness of breath',
            'Hypertension'
        ],
        severity: 'Critical',
        triageScore: 9,
        doctor: 'Dr. Carter',
        status: 'Waiting',
        admissionDate: '2025-03-15',
        medicalHistory: [
            'Hypertension (diagnosed 2020)',
            'Generalized Anxiety Disorder'
        ],
        currentMedications: [
            'Lisinopril 10mg daily'
        ],
        avatarBg: '#ec4899'
    },

    {
        id: 'P002',
        mrn: 'MRN-10089',
        name: 'James Wilson',
        age: 67,
        gender: 'Male',
        bloodGroup: 'A+',
        allergies: ['Sulfa drugs'],
        vitals: {
            bp: '150/90',
            hr: 95,
            temp: 101.2,
            spo2: 96,
            rr: 18
        },
        symptoms: [
            'Abdominal pain',
            'Fever',
            'Dehydration'
        ],
        severity: 'High',
        triageScore: 7,
        doctor: 'Dr. Patel',
        status: 'In Progress',
        admissionDate: '2025-03-15',
        medicalHistory: [
            'Type 2 Diabetes (diagnosed 2015)',
            'GERD'
        ],
        currentMedications: [
            'Metformin 500mg twice daily',
            'Omeprazole 20mg daily'
        ],
        avatarBg: '#3b82f6'
    },

    {
        id: 'P003',
        mrn: 'MRN-10056',
        name: 'Sarah Chen',
        age: 28,
        gender: 'Female',
        bloodGroup: 'B+',
        allergies: [],
        vitals: {
            bp: '145/92',
            hr: 88,
            temp: 98.2,
            spo2: 99,
            rr: 16
        },
        symptoms: [
            'Headache',
            'Blurred vision',
            'Nausea'
        ],
        severity: 'Medium',
        triageScore: 5,
        doctor: 'Dr. Lee',
        status: 'Waiting',
        admissionDate: '2025-03-15',
        medicalHistory: [
            'Migraine (chronic)',
            'Seasonal allergies'
        ],
        currentMedications: [
            'Sumatriptan 50mg as needed'
        ],
        avatarBg: '#f59e0b'
    },

    {
        id: 'P004',
        mrn: 'MRN-10033',
        name: 'Michael Brown',
        age: 45,
        gender: 'Male',
        bloodGroup: 'AB+',
        allergies: ['Latex'],
        vitals: {
            bp: '120/80',
            hr: 72,
            temp: 98.6,
            spo2: 99,
            rr: 14
        },
        symptoms: [
            'Ankle pain',
            'Swelling'
        ],
        severity: 'Low',
        triageScore: 2,
        doctor: 'Dr. Williams',
        status: 'Checked In',
        admissionDate: '2025-03-15',
        medicalHistory: [
            'Previous ankle sprain (2023)'
        ],
        currentMedications: [],
        avatarBg: '#22c55e'
    },

    {
        id: 'P005',
        mrn: 'MRN-10012',
        name: 'Alice Kim',
        age: 52,
        gender: 'Female',
        bloodGroup: 'O-',
        allergies: [
            'Aspirin',
            'Ibuprofen'
        ],
        vitals: {
            bp: '160/95',
            hr: 102,
            temp: 99.1,
            spo2: 95,
            rr: 20
        },
        symptoms: [
            'Palpitations',
            'Dizziness',
            'Fatigue'
        ],
        severity: 'High',
        triageScore: 6,
        doctor: 'Dr. Johnson',
        status: 'Triaging',
        admissionDate: '2025-03-15',
        medicalHistory: [
            'Atrial Fibrillation (diagnosed 2018)',
            'Hyperlipidemia'
        ],
        currentMedications: [
            'Warfarin 5mg daily',
            'Atorvastatin 20mg daily'
        ],
        avatarBg: '#a855f7'
    }
];


/* =====================================================
   ORIGINAL DOCTORS
   ===================================================== */

var MOCK_DOCTORS = [
    {
        id: 'D001',
        name: 'Dr. Sarah Carter',
        specialization: 'Cardiology',
        department: 'Cardiology',
        availability: 'Available',
        appointmentsToday: 3,
        patientCount: 120,
        avatarBg: '#4f46e5'
    },

    {
        id: 'D002',
        name: 'Dr. Raj Patel',
        specialization: 'Gastroenterology',
        department: 'Gastroenterology',
        availability: 'Busy',
        appointmentsToday: 5,
        patientCount: 95,
        avatarBg: '#f59e0b'
    },

    {
        id: 'D003',
        name: 'Dr. Michelle Lee',
        specialization: 'Neurology',
        department: 'Neurology',
        availability: 'Available',
        appointmentsToday: 2,
        patientCount: 78,
        avatarBg: '#10b981'
    },

    {
        id: 'D004',
        name: 'Dr. David Williams',
        specialization: 'Orthopedics',
        department: 'Orthopedics',
        availability: 'Off Duty',
        appointmentsToday: 0,
        patientCount: 150,
        avatarBg: '#ef4444'
    },

    {
        id: 'D005',
        name: 'Dr. Emily Johnson',
        specialization: 'Emergency Medicine',
        department: 'Emergency',
        availability: 'Available',
        appointmentsToday: 7,
        patientCount: 200,
        avatarBg: '#06b6d4'
    }
];


/* =====================================================
   DOCTOR STORAGE
   ===================================================== */

/*
   Original 5 doctors MOCK_DOCTORS me rahenge.

   New doctors localStorage me:
   careflow_doctors

   getDoctors() dono ko combine karega.
*/

function getDoctors() {
    var apiDoctors = CareFlowAPI.getCached('doctors');
    if (apiDoctors) return apiDoctors;

    var storedDoctors = [];

    try {

        storedDoctors =
            JSON.parse(
                localStorage.getItem('careflow_doctors')
            ) || [];

    } catch (error) {

        storedDoctors = [];

    }


    /*
       Duplicate IDs remove karne ke liye Map use kar rahe hain.
    */

    var allDoctors = [
        ...MOCK_DOCTORS,
        ...storedDoctors
    ];


    var uniqueDoctors = [];

    var ids = new Set();


    allDoctors.forEach(function (doctor) {

        if (!ids.has(String(doctor.id))) {

            ids.add(String(doctor.id));

            uniqueDoctors.push(doctor);

        }

    });


    return uniqueDoctors;
}


/* =====================================================
   GET DOCTOR BY ID
   ===================================================== */

function getDoctorById(id) {

    return getDoctors().find(function (doctor) {

        return String(doctor.id) === String(id);

    });

}


/* =====================================================
   APPOINTMENTS
   ===================================================== */

var MOCK_APPOINTMENTS = [
    {
        id: 'A001',
        patientId: 'P001',
        patientName: 'Emma Thompson',
        doctor: 'Dr. Sarah Carter',
        type: 'Cardiology',
        date: '2025-03-15',
        time: '09:00 AM',
        status: 'Pending'
    },

    {
        id: 'A002',
        patientId: 'P002',
        patientName: 'James Wilson',
        doctor: 'Dr. Raj Patel',
        type: 'Gastroenterology',
        date: '2025-03-15',
        time: '09:30 AM',
        status: 'In Progress'
    },

    {
        id: 'A003',
        patientId: 'P003',
        patientName: 'Sarah Chen',
        doctor: 'Dr. Michelle Lee',
        type: 'Neurology',
        date: '2025-03-15',
        time: '10:15 AM',
        status: 'Pending'
    },

    {
        id: 'A004',
        patientId: 'P004',
        patientName: 'Michael Brown',
        doctor: 'Dr. David Williams',
        type: 'Orthopedics',
        date: '2025-03-15',
        time: '10:45 AM',
        status: 'Checked In'
    },

    {
        id: 'A005',
        patientId: 'P005',
        patientName: 'Alice Kim',
        doctor: 'Dr. Emily Johnson',
        type: 'Emergency',
        date: '2025-03-15',
        time: '11:00 AM',
        status: 'Triaging'
    }
];


/* =====================================================
   LAB REPORTS
   ===================================================== */

var MOCK_LAB_REPORTS = [
    {
        id: 'L001',
        patientName: 'Emma Thompson',
        patientId: 'P001',
        test: 'Troponin I',
        date: '2025-03-15',
        doctor: 'Dr. Sarah Carter',
        result: '0.12 ng/mL',
        status: 'Abnormal',
        normalRange: '<0.04 ng/mL'
    },

    {
        id: 'L002',
        patientName: 'James Wilson',
        patientId: 'P002',
        test: 'Complete Blood Count',
        date: '2025-03-15',
        doctor: 'Dr. Raj Patel',
        result: 'WBC 12.5 x10³/µL',
        status: 'Abnormal',
        normalRange: '4.5-11.0 x10³/µL'
    },

    {
        id: 'L003',
        patientName: 'Sarah Chen',
        patientId: 'P003',
        test: 'MRI Brain',
        date: '2025-03-14',
        doctor: 'Dr. Michelle Lee',
        result: 'No acute intracranial findings',
        status: 'Normal',
        normalRange: '-'
    },

    {
        id: 'L004',
        patientName: 'Michael Brown',
        patientId: 'P004',
        test: 'X-Ray Ankle (AP/Lateral)',
        date: '2025-03-15',
        doctor: 'Dr. David Williams',
        result: 'No fracture or dislocation',
        status: 'Normal',
        normalRange: '-'
    }
];


/* =====================================================
   PRESCRIPTIONS
   ===================================================== */

var MOCK_PRESCRIPTIONS = [
    {
        id: 'RX001',
        patientName: 'Emma Thompson',
        patientId: 'P001',
        doctor: 'Dr. Sarah Carter',
        diagnosis: 'Hypertensive Urgency',
        medicines: ['Clonidine 0.1 mg'],
        dosage: '1 tablet',
        frequency: 'Twice daily',
        duration: '7 days',
        date: '2025-03-15'
    },

    {
        id: 'RX002',
        patientName: 'James Wilson',
        patientId: 'P002',
        doctor: 'Dr. Raj Patel',
        diagnosis: 'Acute Gastroenteritis',
        medicines: [
            'Ciprofloxacin 500 mg',
            'Oral Rehydration Salts'
        ],
        dosage: '1 tablet / 1 sachet',
        frequency: 'Twice daily / As needed',
        duration: '5 days',
        date: '2025-03-15'
    }
];


/* =====================================================
   BILLING
   ===================================================== */

var MOCK_BILLING = [
    {
        id: 'B001',
        patientName: 'Emma Thompson',
        patientId: 'P001',
        consultation: 150,
        lab: 200,
        medicine: 45,
        total: 395,
        status: 'Pending',
        date: '2025-03-15'
    },

    {
        id: 'B002',
        patientName: 'James Wilson',
        patientId: 'P002',
        consultation: 150,
        lab: 120,
        medicine: 30,
        total: 300,
        status: 'Paid',
        date: '2025-03-15'
    }
];


/* =====================================================
   PATIENT FUNCTIONS
   ===================================================== */

function getPatients() {
    var apiPatients = CareFlowAPI.getCached('patients');
    if (apiPatients) return apiPatients;

    var storedPatients = [];

    try {

        storedPatients =
            JSON.parse(
                localStorage.getItem('careflow_patients')
            ) || [];

    } catch (error) {

        storedPatients = [];

    }


    return [
        ...MOCK_PATIENTS,
        ...storedPatients
    ];
}


function getPatientById(id) {

    return getPatients().find(function (patient) {

        return String(patient.id) === String(id);

    });

}


/* =====================================================
   APPOINTMENT ACCESS
   ===================================================== */

function getAppointments() {
    var apiAppointments = CareFlowAPI.getCached('appointments');
    if (apiAppointments) return apiAppointments;

    var storedAppointments = [];

    try {

        storedAppointments =
            JSON.parse(
                localStorage.getItem(
                    'careflow_appointments'
                )
            ) || [];

    } catch (error) {

        storedAppointments = [];

    }


    return [
        ...MOCK_APPOINTMENTS,
        ...storedAppointments
    ];
}


function getAppointmentById(id) {

    return getAppointments().find(function (appointment) {

        return String(appointment.id) === String(id);

    });

}


/* =====================================================
   OTHER DATA ACCESS
   ===================================================== */

function getLabReports() {
    return CareFlowAPI.getCached('labReports') || MOCK_LAB_REPORTS;

}


function getPrescriptions() {
    return CareFlowAPI.getCached('prescriptions') || MOCK_PRESCRIPTIONS;

}


function getBilling() {
    return CareFlowAPI.getCached('billing') || MOCK_BILLING;

}

