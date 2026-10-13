document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;
  var form = document.getElementById('addPatientForm');
  var doctorSelect = document.getElementById('doctor');
  var error = document.getElementById('formError');
  var saveButton = document.getElementById('savePatientBtn');

  form.elements.admissionDate.value = new Date().toISOString().slice(0, 10);
  getDoctors().filter(function (doctor) { return doctor.isActive !== false; }).forEach(function (doctor) {
    var option = document.createElement('option'); option.value = doctor.name; option.textContent = doctor.name; doctorSelect.appendChild(option);
  });

  function list(value) { return value.split(',').map(function (item) { return item.trim(); }).filter(Boolean); }
  function number(value) { return value === '' ? null : Number(value); }
  function showError(message) { error.textContent = message; error.classList.add('show'); }

  form.addEventListener('submit', async function (event) {
    event.preventDefault(); error.classList.remove('show');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var values = new FormData(form);
    var payload = {
      name: values.get('name').trim(), mrn: values.get('mrn').trim(), age: number(values.get('age')),
      gender: values.get('gender'), bloodGroup: values.get('bloodGroup') || null, doctor: values.get('doctor') || null,
      severity: values.get('severity'), triageScore: number(values.get('triageScore')), status: values.get('status'),
      admissionDate: values.get('admissionDate'), symptoms: list(values.get('symptoms')), allergies: list(values.get('allergies')),
      medicalHistory: [], currentMedications: [], avatarBg: '#4f46e5',
      vitals: { bp: values.get('bp') || null, hr: number(values.get('hr')), temp: number(values.get('temp')), spo2: number(values.get('spo2')), rr: number(values.get('rr')) }
    };
    saveButton.disabled = true; saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
      var patient = await CareFlowAPI.request('/patients', { method: 'POST', body: JSON.stringify(payload) });
      var cached = CareFlowAPI.getCached('patients') || [];
      CareFlowAPI.setCached('patients', cached.concat(patient));
      window.location.href = 'patient-details.html?id=' + encodeURIComponent(patient.id);
    } catch (requestError) {
      showError(requestError.message || 'Patient record could not be saved.');
      saveButton.disabled = false; saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Patient';
    }
  });
});
