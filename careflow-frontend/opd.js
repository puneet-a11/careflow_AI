/* ============================================
   CAREFLOW AI - OPD QUEUE MODULE
   Walk-in registration + daily consultation queue.
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;

  var visits = [];
  var activeStatus = '';

  var tableBody = document.getElementById('opdTableBody');
  var searchInput = document.getElementById('opdSearch');
  var checkInBtn = document.getElementById('checkInBtn');

  var modal = document.getElementById('opdModal');
  var modalClose = document.getElementById('opdModalClose');
  var modalCancel = document.getElementById('opdModalCancel');
  var modalSave = document.getElementById('opdModalSave');

  var patientSelect = document.getElementById('opdPatientSelect');
  var nameInput = document.getElementById('opdPatientName');
  var departmentSelect = document.getElementById('opdDepartment');
  var doctorSelect = document.getElementById('opdDoctor');
  var visitTypeSelect = document.getElementById('opdVisitType');
  var reasonInput = document.getElementById('opdReason');

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
  }

  function statusBadge(status) {
    var map = {
      'Waiting': 'badge-warning',
      'In Consultation': 'badge-info',
      'Completed': 'badge-success',
      'Cancelled': 'badge-danger'
    };
    return map[status] || 'badge-neutral';
  }

  function populateSelects() {
    var departments = CareFlowAPI.getCached('departments') || [];
    var doctors = (CareFlowAPI.getCached('doctors') || []).filter(function (d) { return d.isActive !== false; });
    var patients = CareFlowAPI.getCached('patients') || [];

    departmentSelect.innerHTML = '<option value="">Select department</option>' +
      departments.map(function (d) { return '<option value="' + escapeHtml(d.name) + '">' + escapeHtml(d.name) + '</option>'; }).join('');

    doctorSelect.innerHTML = '<option value="">Select doctor</option>' +
      doctors.map(function (d) { return '<option value="' + escapeHtml(d.name) + '">' + escapeHtml(d.name) + '</option>'; }).join('');

    patientSelect.innerHTML = '<option value="">Walk-in / not registered yet</option>' +
      patients.map(function (p) { return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>'; }).join('');
  }

  function updateStats(todayVisits) {
    document.getElementById('statWaiting').textContent = todayVisits.filter(function (v) { return v.status === 'Waiting'; }).length;
    document.getElementById('statInConsultation').textContent = todayVisits.filter(function (v) { return v.status === 'In Consultation'; }).length;
    document.getElementById('statCompleted').textContent = todayVisits.filter(function (v) { return v.status === 'Completed'; }).length;
    document.getElementById('statTotal').textContent = todayVisits.length;
  }

  function renderVisits() {
    var today = new Date().toISOString().slice(0, 10);
    var todayVisits = visits.filter(function (v) { return v.date === today; });
    updateStats(todayVisits);

    var query = (searchInput.value || '').toLowerCase();
    var filtered = visits.filter(function (v) {
      if (activeStatus && v.status !== activeStatus) return false;
      if (!query) return true;
      return (v.patientName || '').toLowerCase().indexOf(query) !== -1 ||
        (v.doctor || '').toLowerCase().indexOf(query) !== -1 ||
        (v.department || '').toLowerCase().indexOf(query) !== -1;
    });

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--color-gray-500);padding:2rem;">No OPD visits found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(function (v) {
      var actions = '';
      if (v.status === 'Waiting') {
        if (Permissions.can('opd', 'edit')) {
          actions += '<button class="btn btn-sm btn-primary" data-action="call" data-id="' + escapeHtml(v.id) + '"><i class="fa-solid fa-bullhorn"></i> Call</button>';
        }
        if (Permissions.can('opd', 'delete')) {
          actions += ' <button class="btn btn-sm btn-ghost text-danger" data-action="cancel" data-id="' + escapeHtml(v.id) + '" title="Cancel"><i class="fa-solid fa-xmark"></i></button>';
        }
      } else if (v.status === 'In Consultation') {
        if (Permissions.can('opd', 'edit')) {
          actions += '<button class="btn btn-sm btn-success" data-action="complete" data-id="' + escapeHtml(v.id) + '"><i class="fa-solid fa-check"></i> Complete</button>';
        }
      } else {
        actions = '<span style="color:var(--color-gray-400);">-</span>';
      }

      return '<tr>' +
        '<td><strong>#' + escapeHtml(v.tokenNumber) + '</strong></td>' +
        '<td>' + escapeHtml(v.patientName) + '</td>' +
        '<td>' + escapeHtml(v.department || '-') + '</td>' +
        '<td>' + escapeHtml(v.doctor || '-') + '</td>' +
        '<td>' + escapeHtml(v.visitType) + '</td>' +
        '<td>' + escapeHtml(v.reason || '-') + '</td>' +
        '<td><span class="badge ' + statusBadge(v.status) + ' badge-dot">' + escapeHtml(v.status) + '</span></td>' +
        '<td><div class="table-actions">' + actions + '</div></td>' +
        '</tr>';
    }).join('');
  }

  async function loadVisits() {
    try {
      visits = await CareFlowAPI.request('/opd');
    } catch (error) {
      alert(error.message || 'Unable to load the OPD queue.');
      visits = [];
    }
    renderVisits();
  }

  function openModal() {
    nameInput.value = '';
    patientSelect.value = '';
    departmentSelect.value = '';
    doctorSelect.value = '';
    visitTypeSelect.value = 'New';
    reasonInput.value = '';
    populateSelects();
    modal.classList.add('active');
    setTimeout(function () { nameInput.focus(); }, 100);
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  patientSelect.addEventListener('change', function () {
    if (!patientSelect.value) return;
    var patients = CareFlowAPI.getCached('patients') || [];
    var patient = patients.find(function (p) { return p.id === patientSelect.value; });
    if (patient) nameInput.value = patient.name;
  });

  async function checkIn() {
    var name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    var payload = {
      patientId: patientSelect.value || null,
      patientName: name,
      department: departmentSelect.value || null,
      doctor: doctorSelect.value || null,
      visitType: visitTypeSelect.value,
      reason: reasonInput.value.trim() || null
    };

    modalSave.disabled = true;
    modalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking in...';

    try {
      var saved = await CareFlowAPI.request('/opd', { method: 'POST', body: JSON.stringify(payload) });
      visits.unshift(saved);
      renderVisits();
      closeModal();
    } catch (error) {
      alert(error.message || 'Could not check in this patient.');
    } finally {
      modalSave.disabled = false;
      modalSave.innerHTML = '<i class="fa-solid fa-check"></i> Check In';
    }
  }

  async function callNext(id) {
    try {
      var updated = await CareFlowAPI.request('/opd/' + encodeURIComponent(id) + '/call', { method: 'POST' });
      var index = visits.findIndex(function (v) { return v.id === id; });
      if (index !== -1) visits[index] = updated;
      renderVisits();
    } catch (error) {
      alert(error.message || 'Could not call this patient in.');
    }
  }

  async function completeVisit(id) {
    try {
      var updated = await CareFlowAPI.request('/opd/' + encodeURIComponent(id) + '/complete', { method: 'POST' });
      var index = visits.findIndex(function (v) { return v.id === id; });
      if (index !== -1) visits[index] = updated;
      renderVisits();
    } catch (error) {
      alert(error.message || 'Could not complete this visit.');
    }
  }

  async function cancelVisit(id) {
    if (!confirm('Cancel this OPD visit?')) return;
    try {
      await CareFlowAPI.request('/opd/' + encodeURIComponent(id), { method: 'DELETE' });
      var visit = visits.find(function (v) { return v.id === id; });
      if (visit) visit.status = 'Cancelled';
      renderVisits();
    } catch (error) {
      alert(error.message || 'Could not cancel this visit.');
    }
  }

  checkInBtn.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSave.addEventListener('click', checkIn);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('active')) closeModal(); });

  searchInput.addEventListener('input', renderVisits);

  document.querySelectorAll('.table-filter-left .tab-item').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.table-filter-left .tab-item').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeStatus = tab.dataset.status || '';
      renderVisits();
    });
  });

  tableBody.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var id = btn.dataset.id;
    if (btn.dataset.action === 'call') callNext(id);
    if (btn.dataset.action === 'complete') completeVisit(id);
    if (btn.dataset.action === 'cancel') cancelVisit(id);
  });

  Permissions.ensureLoaded().then(function () {
    if (!Permissions.can('opd', 'create')) Permissions.hide(checkInBtn);
    loadVisits();
  });

  setInterval(loadVisits, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadVisits(); });
});
