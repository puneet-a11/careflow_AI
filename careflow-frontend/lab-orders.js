/* ============================================
   CAREFLOW AI - LAB ORDERS MODULE
   Full pipeline: Ordered -> Sample Collected -> Processing -> Verified.
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;

  var orders = [];
  var activeStatus = '';
  var verifyTargetId = null;
  var reportsById = {};   // lab reports by id - used to show "Report pending / uploaded" per order
  var ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  var MAX_DOC_BYTES = 15 * 1024 * 1024;

  var tableBody = document.getElementById('labOrdersTableBody');
  var searchInput = document.getElementById('labOrderSearch');
  var orderTestBtn = document.getElementById('orderTestBtn');

  var orderModal = document.getElementById('orderModal');
  var orderModalClose = document.getElementById('orderModalClose');
  var orderModalCancel = document.getElementById('orderModalCancel');
  var orderModalSave = document.getElementById('orderModalSave');
  var patientSelect = document.getElementById('orderPatientSelect');
  var testInput = document.getElementById('orderTest');
  var prioritySelect = document.getElementById('orderPriority');
  var sampleTypeSelect = document.getElementById('orderSampleType');
  var turnaroundSelect = document.getElementById('orderTurnaround');
  var fastingRequiredInput = document.getElementById('orderFastingRequired');
  var fastingStatus = document.getElementById('orderFastingStatus');
  var clinicalNotesInput = document.getElementById('orderClinicalNotes');
  var doctorSelect = document.getElementById('orderDoctorSelect');

  var verifyModal = document.getElementById('verifyModal');
  var verifyModalClose = document.getElementById('verifyModalClose');
  var verifyModalCancel = document.getElementById('verifyModalCancel');
  var verifyModalSave = document.getElementById('verifyModalSave');
  var verifyResultInput = document.getElementById('verifyResult');
  var verifyNormalRangeInput = document.getElementById('verifyNormalRange');
  var verifyResultStatusSelect = document.getElementById('verifyResultStatus');
  var verifyReportFileInput = document.getElementById('verifyReportFile');

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
  }

  function statusBadge(status) {
    var map = {
      'Ordered': 'badge-neutral',
      'Sample Collected': 'badge-info',
      'Processing': 'badge-warning',
      'Verified': 'badge-success',
      'Cancelled': 'badge-danger'
    };
    return map[status] || 'badge-neutral';
  }

  function priorityBadge(priority) {
    if (priority === 'STAT') return 'badge-danger';
    if (priority === 'Urgent') return 'badge-warning';
    return 'badge-neutral';
  }

  function renderOrders() {
    var query = (searchInput.value || '').toLowerCase();
    var filtered = orders.filter(function (o) {
      if (activeStatus && o.status !== activeStatus) return false;
      if (!query) return true;
      return (o.patientName || '').toLowerCase().indexOf(query) !== -1 || (o.test || '').toLowerCase().indexOf(query) !== -1;
    });

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--color-gray-500);padding:2rem;">No lab orders found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(function (o) {
      var actions = '';
      var canEdit = Permissions.can('lab-orders', 'edit');
      if (o.status === 'Ordered') {
        if (canEdit) actions += '<button class="btn btn-sm btn-outline" data-action="collect" data-id="' + escapeHtml(o.id) + '"><i class="fa-solid fa-vial"></i> Collect Sample</button>';
        if (Permissions.can('lab-orders', 'delete')) actions += ' <button class="btn btn-sm btn-ghost text-danger" data-action="cancel" data-id="' + escapeHtml(o.id) + '" title="Cancel"><i class="fa-solid fa-xmark"></i></button>';
      } else if (o.status === 'Sample Collected') {
        if (canEdit) actions += '<button class="btn btn-sm btn-outline" data-action="process" data-id="' + escapeHtml(o.id) + '"><i class="fa-solid fa-gears"></i> Start Processing</button>';
      } else if (o.status === 'Processing') {
        if (canEdit) actions += '<button class="btn btn-sm btn-success" data-action="verify" data-id="' + escapeHtml(o.id) + '"><i class="fa-solid fa-check-double"></i> Verify Result</button>';
      } else if (o.status === 'Verified') {
        var linked = o.labReportId ? reportsById[o.labReportId] : null;
        var hasDoc = !!(linked && linked.documentFilename);
        if (hasDoc) {
          actions = '<span class="text-success" style="font-weight:600;"><i class="fa-solid fa-file-circle-check"></i> Report uploaded</span> ' +
            '<a class="btn btn-sm btn-outline" href="lab-reports.html?report=' + encodeURIComponent(o.labReportId) + '"><i class="fa-solid fa-eye"></i> View Report</a>';
        } else {
          actions = '<span class="lab-pending" style="font-weight:600;"><i class="fa-solid fa-hourglass-half"></i> Report pending</span>';
          if (o.labReportId && Permissions.can('lab-reports', 'edit')) {
            actions += ' <button class="btn btn-sm btn-primary" data-action="upload" data-report="' + escapeHtml(o.labReportId) + '"><i class="fa-solid fa-upload"></i> Upload Report</button>';
          }
        }
      } else {
        actions = '<span style="color:var(--color-gray-400);">-</span>';
      }

      return '<tr>' +
        '<td><strong>' + escapeHtml(o.patientName) + '</strong></td>' +
        '<td><strong>' + escapeHtml(o.test) + '</strong>' +
          (o.sampleType ? '<br><small class="text-muted">' + escapeHtml(o.sampleType) + (o.fastingRequired ? ' · Fasting' : '') + '</small>' : '') +
        '</td>' +
        '<td>' + escapeHtml(o.orderedBy || '-') + '</td>' +
        '<td><span class="badge ' + priorityBadge(o.priority) + '">' + escapeHtml(o.priority) + '</span></td>' +
        '<td>' + escapeHtml(o.orderedDate) + '</td>' +
        '<td><span class="badge ' + statusBadge(o.status) + ' badge-dot">' + escapeHtml(o.status) + '</span></td>' +
        '<td><div class="table-actions">' + actions + '</div></td>' +
        '</tr>';
    }).join('');
  }

  async function loadReportDocs() {
    // Best effort: without this the Verified rows simply show "Report pending".
    if (!Permissions.can('lab-reports', 'view')) return;
    try {
      var list = await CareFlowAPI.request('/lab-reports');
      var map = {};
      (list || []).forEach(function (r) { map[r.id] = r; });
      reportsById = map;
    } catch (error) { /* keep previous map */ }
  }

  async function loadOrders() {
    try {
      orders = await CareFlowAPI.request('/lab-orders');
    } catch (error) {
      alert(error.message || 'Unable to load lab orders.');
      orders = [];
    }
    await loadReportDocs();
    renderOrders();
  }

  function pickFile(onPick) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.webp';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (file) onPick(file);
    });
    document.body.appendChild(input);
    input.click();
  }

  function validateDocFile(file) {
    if (ALLOWED_DOC_TYPES.indexOf(file.type) === -1) return 'Unsupported file type. Please choose a PDF, PNG, JPG or WEBP file.';
    if (!file.size) return 'The selected file is empty.';
    if (file.size > MAX_DOC_BYTES) return 'File is too large. Maximum size is 15 MB.';
    return null;
  }

  async function uploadReportDocument(reportId, file) {
    var problem = validateDocFile(file);
    if (problem) { alert(problem); return false; }
    var formData = new FormData();
    formData.append('file', file);
    try {
      var updated = await CareFlowAPI.uploadLabReportDocument(reportId, formData);
      reportsById[reportId] = Object.assign({}, reportsById[reportId] || {}, updated);
      CareFlowAPI.removeCached('labReports');
      renderOrders();
      return true;
    } catch (error) {
      alert(error.message || 'Could not upload the report document.');
      return false;
    }
  }

  function populateOrderSelects() {
    var patients = CareFlowAPI.getCached('patients') || [];
    var doctors = (CareFlowAPI.getCached('doctors') || []).filter(function (d) { return d.isActive !== false; });

    patientSelect.innerHTML = '<option value="">Select patient</option>' +
      patients.map(function (p) { return '<option value="' + escapeHtml(p.id) + '" data-name="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</option>'; }).join('');

    doctorSelect.innerHTML = '<option value="">Select doctor</option>' +
      doctors.map(function (d) { return '<option value="' + escapeHtml(d.name) + '">' + escapeHtml(d.name) + '</option>'; }).join('');
  }

  function openOrderModal() {
    populateOrderSelects();
    testInput.value = '';
    prioritySelect.value = 'Routine';
    sampleTypeSelect.value = 'Blood';
    turnaroundSelect.value = 'Within 24 hours';
    fastingRequiredInput.checked = false;
    updateFastingStatus();
    clinicalNotesInput.value = '';
    orderModal.classList.add('active');
  }

  function updateFastingStatus() {
    if (!fastingStatus) return;
    fastingStatus.textContent = fastingRequiredInput.checked ? 'Fasting required' : 'No fasting required';
    fastingStatus.classList.toggle('is-required', fastingRequiredInput.checked);
  }

  fastingRequiredInput.addEventListener('change', updateFastingStatus);

  // Keep the turnaround suggestion aligned with the selected urgency;
  // staff can still manually choose a different time when needed.
  prioritySelect.addEventListener('change', function () {
    var suggestedTurnaround = {
      'Routine': 'Within 24 hours',
      'Urgent': 'Within 6 hours',
      'STAT': 'Within 1 hour'
    };
    if (suggestedTurnaround[prioritySelect.value]) {
      turnaroundSelect.value = suggestedTurnaround[prioritySelect.value];
    }
  });

  function closeOrderModal() { orderModal.classList.remove('active'); }

  async function placeOrder() {
    var patientId = patientSelect.value;
    var patientOption = patientSelect.options[patientSelect.selectedIndex];
    var test = testInput.value.trim();
    if (!patientId) { patientSelect.focus(); return; }
    if (!test) { testInput.focus(); return; }

    var payload = {
      patientId: patientId,
      patientName: patientOption.dataset.name,
      test: test,
      priority: prioritySelect.value,
      orderedBy: doctorSelect.value || null,
      sampleType: sampleTypeSelect.value || null,
      fastingRequired: fastingRequiredInput.checked,
      expectedTurnaround: turnaroundSelect.value || null,
      clinicalNotes: clinicalNotesInput.value.trim() || null
    };

    orderModalSave.disabled = true;
    orderModalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Placing order...';

    try {
      var saved = await CareFlowAPI.request('/lab-orders', { method: 'POST', body: JSON.stringify(payload) });
      orders.unshift(saved);
      renderOrders();
      closeOrderModal();
    } catch (error) {
      alert(error.message || 'Could not place this order.');
    } finally {
      orderModalSave.disabled = false;
      orderModalSave.innerHTML = '<i class="fa-solid fa-check"></i> Place Order';
    }
  }

  function replaceOrder(updated) {
    var index = orders.findIndex(function (o) { return o.id === updated.id; });
    if (index !== -1) orders[index] = updated;
    renderOrders();
  }

  async function collectSample(id) {
    try {
      var updated = await CareFlowAPI.request('/lab-orders/' + encodeURIComponent(id) + '/collect-sample', { method: 'POST', body: JSON.stringify({}) });
      replaceOrder(updated);
    } catch (error) {
      alert(error.message || 'Could not record sample collection.');
    }
  }

  async function startProcessing(id) {
    try {
      var updated = await CareFlowAPI.request('/lab-orders/' + encodeURIComponent(id) + '/start-processing', { method: 'POST' });
      replaceOrder(updated);
    } catch (error) {
      alert(error.message || 'Could not start processing.');
    }
  }

  function openVerifyModal(id) {
    verifyTargetId = id;
    verifyResultInput.value = '';
    verifyNormalRangeInput.value = '';
    verifyResultStatusSelect.value = 'Normal';
    if (verifyReportFileInput) verifyReportFileInput.value = '';
    verifyModal.classList.add('active');
    setTimeout(function () { verifyResultInput.focus(); }, 100);
  }

  function closeVerifyModal() {
    verifyTargetId = null;
    verifyModal.classList.remove('active');
  }

  async function saveVerification() {
    if (!verifyTargetId) return;
    var result = verifyResultInput.value.trim();
    if (!result) { verifyResultInput.focus(); return; }

    var payload = {
      result: result,
      normalRange: verifyNormalRangeInput.value.trim() || null,
      resultStatus: verifyResultStatusSelect.value
    };

    var reportFile = verifyReportFileInput && verifyReportFileInput.files[0];
    if (reportFile) {
      var problem = validateDocFile(reportFile);
      if (problem) { alert(problem); return; }
    }

    verifyModalSave.disabled = true;
    try {
      var updated = await CareFlowAPI.request('/lab-orders/' + encodeURIComponent(verifyTargetId) + '/verify', { method: 'POST', body: JSON.stringify(payload) });
      replaceOrder(updated);
      CareFlowAPI.removeCached('labReports');
      closeVerifyModal();
      if (reportFile && updated.labReportId) {
        var ok = await uploadReportDocument(updated.labReportId, reportFile);
        if (!ok) alert('The result was verified, but the report document was not uploaded. Use "Upload Report" on the order to try again.');
      } else {
        await loadReportDocs();
        renderOrders();
      }
    } catch (error) {
      alert(error.message || 'Could not verify this result.');
    } finally {
      verifyModalSave.disabled = false;
    }
  }

  async function cancelOrder(id) {
    if (!confirm('Cancel this lab order?')) return;
    try {
      await CareFlowAPI.request('/lab-orders/' + encodeURIComponent(id), { method: 'DELETE' });
      var order = orders.find(function (o) { return o.id === id; });
      if (order) order.status = 'Cancelled';
      renderOrders();
    } catch (error) {
      alert(error.message || 'Could not cancel this order.');
    }
  }

  orderTestBtn.addEventListener('click', openOrderModal);
  orderModalClose.addEventListener('click', closeOrderModal);
  orderModalCancel.addEventListener('click', closeOrderModal);
  orderModalSave.addEventListener('click', placeOrder);
  orderModal.addEventListener('click', function (e) { if (e.target === orderModal) closeOrderModal(); });

  verifyModalClose.addEventListener('click', closeVerifyModal);
  verifyModalCancel.addEventListener('click', closeVerifyModal);
  verifyModalSave.addEventListener('click', saveVerification);
  verifyModal.addEventListener('click', function (e) { if (e.target === verifyModal) closeVerifyModal(); });

  searchInput.addEventListener('input', renderOrders);

  document.querySelectorAll('.table-filter-left .tab-item').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.table-filter-left .tab-item').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeStatus = tab.dataset.status || '';
      renderOrders();
    });
  });

  tableBody.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'upload') {
      var reportId = btn.dataset.report;
      pickFile(async function (file) {
        btn.disabled = true;
        var ok = await uploadReportDocument(reportId, file);
        if (!ok) btn.disabled = false;
      });
      return;
    }
    var id = btn.dataset.id;
    if (btn.dataset.action === 'collect') collectSample(id);
    if (btn.dataset.action === 'process') startProcessing(id);
    if (btn.dataset.action === 'verify') openVerifyModal(id);
    if (btn.dataset.action === 'cancel') cancelOrder(id);
  });

  Permissions.ensureLoaded().then(function () {
    if (!Permissions.can('lab-orders', 'create')) Permissions.hide(orderTestBtn);
    loadOrders();
    // Lab Reports sends users here to start a new request in the complete
    // order → collection → processing → verification workflow.
    if (Permissions.can('lab-orders', 'create') && new URLSearchParams(window.location.search).get('new') === '1') {
      openOrderModal();
    }
  });

  setInterval(loadOrders, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadOrders(); });
});
