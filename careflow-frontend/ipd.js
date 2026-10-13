/* ============================================
   CAREFLOW AI - IPD / ADMISSIONS MODULE
   Ward/bed occupancy overview + admit & discharge workflow.
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;

  var admissions = [];
  var wards = [];
  var beds = [];
  var activeStatus = 'Admitted';
  var dischargingId = null;

  var wardGrid = document.getElementById('wardGrid');
  var tableBody = document.getElementById('admissionsTableBody');
  var searchInput = document.getElementById('admissionSearch');
  var admitBtn = document.getElementById('admitBtn');

  var admitModal = document.getElementById('admitModal');
  var admitModalClose = document.getElementById('admitModalClose');
  var admitModalCancel = document.getElementById('admitModalCancel');
  var admitModalSave = document.getElementById('admitModalSave');
  var patientSelect = document.getElementById('admitPatientSelect');
  var wardSelect = document.getElementById('admitWardSelect');
  var bedSelect = document.getElementById('admitBedSelect');
  var doctorSelect = document.getElementById('admitDoctorSelect');
  var expectedDischargeInput = document.getElementById('admitExpectedDischarge');
  var diagnosisInput = document.getElementById('admitDiagnosis');

  var dischargeModal = document.getElementById('dischargeModal');
  var dischargeModalClose = document.getElementById('dischargeModalClose');
  var dischargeModalCancel = document.getElementById('dischargeModalCancel');
  var dischargeModalSave = document.getElementById('dischargeModalSave');
  var dischargeSummaryInput = document.getElementById('dischargeSummary');

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
  }

  function formatDate(value) {
    if (!value) return '-';
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function bedLabel(bedId) {
    var bed = beds.find(function (b) { return b.id === bedId; });
    if (!bed) return '-';
    var ward = wards.find(function (w) { return w.id === bed.wardId; });
    return (ward ? ward.name : '') + ' - ' + bed.bedNumber;
  }

  function renderWardGrid() {
    if (!wards.length) {
      wardGrid.innerHTML = '<p style="color:var(--color-gray-500);">No wards configured yet.</p>';
      return;
    }
    wardGrid.innerHTML = wards.map(function (ward) {
      var wardBeds = beds.filter(function (b) { return b.wardId === ward.id; });
      var occupied = wardBeds.filter(function (b) { return b.status === 'Occupied'; }).length;
      var total = wardBeds.length;
      var pct = total ? Math.round((occupied / total) * 100) : 0;
      var color = pct >= 90 ? 'var(--color-danger)' : (pct >= 60 ? 'var(--color-warning)' : 'var(--color-success)');
      return '<div class="stat-card">' +
        '<div class="stat-card-icon" style="background:var(--color-primary-light);color:var(--color-primary);"><i class="fa-solid fa-bed"></i></div>' +
        '<div class="stat-card-value">' + occupied + ' / ' + total + '</div>' +
        '<div class="stat-card-label">' + escapeHtml(ward.name) + ' (' + escapeHtml(ward.type) + ')</div>' +
        '<div style="height:6px;border-radius:3px;background:var(--color-gray-100);margin-top:0.6rem;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + color + ';"></div></div>' +
        '</div>';
    }).join('');
  }

  function renderAdmissions() {
    var query = (searchInput.value || '').toLowerCase();
    var filtered = admissions.filter(function (a) {
      if (activeStatus && a.status !== activeStatus) return false;
      if (!query) return true;
      return (a.patientName || '').toLowerCase().indexOf(query) !== -1 ||
        (a.admittingDoctor || '').toLowerCase().indexOf(query) !== -1;
    });

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--color-gray-500);padding:2rem;">No admissions found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(function (a) {
      var actions = '-';
      if (a.status === 'Admitted' && Permissions.can('ipd', 'edit')) {
        actions = '<button class="btn btn-sm btn-success" data-action="discharge" data-id="' + escapeHtml(a.id) + '"><i class="fa-solid fa-right-from-bracket"></i> Discharge</button>';
      }
      var badge = a.status === 'Admitted' ? 'badge-info' : 'badge-neutral';
      return '<tr>' +
        '<td><strong>' + escapeHtml(a.patientName) + '</strong></td>' +
        '<td>' + escapeHtml(bedLabel(a.bedId)) + '</td>' +
        '<td>' + escapeHtml(a.admittingDoctor || '-') + '</td>' +
        '<td>' + escapeHtml(a.diagnosis || '-') + '</td>' +
        '<td>' + escapeHtml(formatDate(a.admissionDate)) + '</td>' +
        '<td><span class="badge ' + badge + ' badge-dot">' + escapeHtml(a.status) + '</span></td>' +
        '<td><div class="table-actions">' + actions + '</div></td>' +
        '</tr>';
    }).join('');
  }

  async function loadAll() {
    try {
      var results = await Promise.all([
        CareFlowAPI.request('/admissions'),
        CareFlowAPI.request('/wards'),
        CareFlowAPI.request('/beds')
      ]);
      admissions = results[0];
      wards = results[1];
      beds = results[2];
    } catch (error) {
      alert(error.message || 'Unable to load IPD data.');
      admissions = []; wards = []; beds = [];
    }
    renderWardGrid();
    renderAdmissions();
  }

  function populateAdmitSelects() {
    var patients = CareFlowAPI.getCached('patients') || [];
    var doctors = (CareFlowAPI.getCached('doctors') || []).filter(function (d) { return d.isActive !== false; });

    patientSelect.innerHTML = '<option value="">Select patient</option>' +
      patients.map(function (p) { return '<option value="' + escapeHtml(p.id) + '" data-name="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</option>'; }).join('');

    doctorSelect.innerHTML = '<option value="">Select doctor</option>' +
      doctors.map(function (d) { return '<option value="' + escapeHtml(d.name) + '">' + escapeHtml(d.name) + '</option>'; }).join('');

    wardSelect.innerHTML = '<option value="">Select ward</option>' +
      wards.map(function (w) { return '<option value="' + escapeHtml(w.id) + '">' + escapeHtml(w.name) + ' (' + escapeHtml(w.type) + ')</option>'; }).join('');

    bedSelect.innerHTML = '<option value="">Select ward first</option>';
  }

  wardSelect.addEventListener('change', function () {
    var availableBeds = beds.filter(function (b) { return b.wardId === wardSelect.value && b.status === 'Available'; });
    if (!availableBeds.length) {
      bedSelect.innerHTML = '<option value="">No beds available in this ward</option>';
      return;
    }
    bedSelect.innerHTML = availableBeds.map(function (b) { return '<option value="' + escapeHtml(b.id) + '">' + escapeHtml(b.bedNumber) + '</option>'; }).join('');
  });

  function openAdmitModal() {
    populateAdmitSelects();
    expectedDischargeInput.value = '';
    diagnosisInput.value = '';
    admitModal.classList.add('active');
  }

  function closeAdmitModal() { admitModal.classList.remove('active'); }

  async function admitPatient() {
    var patientId = patientSelect.value;
    var patientOption = patientSelect.options[patientSelect.selectedIndex];
    if (!patientId) { patientSelect.focus(); return; }

    var payload = {
      patientId: patientId,
      patientName: patientOption.dataset.name,
      wardId: wardSelect.value || null,
      bedId: bedSelect.value || null,
      admittingDoctor: doctorSelect.value || null,
      diagnosis: diagnosisInput.value.trim() || null,
      expectedDischargeDate: expectedDischargeInput.value || null
    };

    admitModalSave.disabled = true;
    admitModalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Admitting...';

    try {
      var saved = await CareFlowAPI.request('/admissions', { method: 'POST', body: JSON.stringify(payload) });
      admissions.unshift(saved);
      if (saved.bedId) {
        var bed = beds.find(function (b) { return b.id === saved.bedId; });
        if (bed) bed.status = 'Occupied';
      }
      renderWardGrid();
      renderAdmissions();
      closeAdmitModal();
    } catch (error) {
      alert(error.message || 'Could not admit this patient.');
    } finally {
      admitModalSave.disabled = false;
      admitModalSave.innerHTML = '<i class="fa-solid fa-check"></i> Admit';
    }
  }

  function openDischargeModal(id) {
    dischargingId = id;
    dischargeSummaryInput.value = '';
    dischargeModal.classList.add('active');
  }

  function closeDischargeModal() {
    dischargingId = null;
    dischargeModal.classList.remove('active');
  }

  async function confirmDischarge() {
    if (!dischargingId) return;
    var payload = { dischargeSummary: dischargeSummaryInput.value.trim() || null };

    dischargeModalSave.disabled = true;
    try {
      var updated = await CareFlowAPI.request('/admissions/' + encodeURIComponent(dischargingId) + '/discharge', { method: 'POST', body: JSON.stringify(payload) });
      var index = admissions.findIndex(function (a) { return a.id === dischargingId; });
      if (index !== -1) admissions[index] = updated;
      var bed = beds.find(function (b) { return b.id === updated.bedId; });
      if (bed) bed.status = 'Available';
      renderWardGrid();
      renderAdmissions();
      closeDischargeModal();
    } catch (error) {
      alert(error.message || 'Could not discharge this patient.');
    } finally {
      dischargeModalSave.disabled = false;
    }
  }

  admitBtn.addEventListener('click', openAdmitModal);
  admitModalClose.addEventListener('click', closeAdmitModal);
  admitModalCancel.addEventListener('click', closeAdmitModal);
  admitModalSave.addEventListener('click', admitPatient);
  admitModal.addEventListener('click', function (e) { if (e.target === admitModal) closeAdmitModal(); });

  dischargeModalClose.addEventListener('click', closeDischargeModal);
  dischargeModalCancel.addEventListener('click', closeDischargeModal);
  dischargeModalSave.addEventListener('click', confirmDischarge);
  dischargeModal.addEventListener('click', function (e) { if (e.target === dischargeModal) closeDischargeModal(); });

  searchInput.addEventListener('input', renderAdmissions);

  document.querySelectorAll('.table-filter-left .tab-item').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.table-filter-left .tab-item').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeStatus = tab.dataset.status || '';
      renderAdmissions();
    });
  });

  tableBody.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action="discharge"]');
    if (btn) openDischargeModal(btn.dataset.id);
  });

  Permissions.ensureLoaded().then(function () {
    if (!Permissions.can('ipd', 'create')) Permissions.hide(admitBtn);
    loadAll();
  });

  setInterval(loadAll, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadAll(); });
});
