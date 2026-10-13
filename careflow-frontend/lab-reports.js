/* CareFlow lab reports — connected to the FastAPI lab_reports table. */
document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;
  var tbody = document.getElementById('labTableBody');
  var search = document.getElementById('labSearch');
  var orderModal = document.getElementById('newLabModal');
  var viewModal = document.getElementById('viewLabModal');
  var viewContent = document.getElementById('labViewContent');
  var newLabOrderBtn = document.getElementById('newLabOrderBtn');
  var reports = [];
  var currentReport = null;

  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]; }); }
  function open(modal) { modal.classList.add('active'); }
  function close(modal) { modal.classList.remove('active'); }
  function formatDate(value) { return value || '-'; }
  function formatDateTime(value) { if (!value) return '-'; var d = new Date(value); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }
  function isAbnormal(report) { return report.status === 'Abnormal'; }

  // ---- Document-driven report state --------------------------------------
  // The report a doctor sees is the file the lab actually uploaded. Until a
  // document exists, the report is shown as "Pending" (no system-generated
  // report is displayed).
  var ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  var MAX_DOC_BYTES = 15 * 1024 * 1024;
  var PENDING_MESSAGE = 'This report is still pending - no document has been uploaded yet.';
  var viewToken = 0;
  var viewerUrl = null;
  var docCache = { key: null, blob: null };
  var deepLinkId = new URLSearchParams(window.location.search).get('report');

  function hasDocument(report) { return !!(report && report.documentFilename && report.documentContentType); }
  function statusLabel(report) { return hasDocument(report) ? (report.status || 'Normal') : 'Pending'; }
  function statusBadgeClass(report) { return !hasDocument(report) ? 'badge-warning' : (isAbnormal(report) ? 'badge-danger' : 'badge-success'); }

  function render() {
    var term = (search.value || '').toLowerCase().trim();
    var visible = reports.filter(function (report) { return !term || [report.patientName, report.test, report.doctor, statusLabel(report)].join(' ').toLowerCase().indexOf(term) >= 0; });
    tbody.innerHTML = visible.length ? '' : '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:2rem;">No lab reports found.</td></tr>';
    var canEdit = Permissions.can('lab-reports', 'edit');
    visible.forEach(function (report) {
      var doc = hasDocument(report);
      var id = escapeHtml(report.id);
      var docStatus = doc
        ? '<span class="lab-completed"><i class="fa-solid fa-file-circle-check"></i> Report Uploaded</span>'
        : '<span class="lab-pending"><i class="fa-solid fa-hourglass-half"></i> Pending</span>';
      var actions =
        '<button class="btn btn-sm btn-ghost" data-action="view" data-id="' + id + '" title="View Report"><i class="fa-solid fa-eye"></i></button>' +
        (doc ? '<button class="btn btn-sm btn-ghost" data-action="print" data-id="' + id + '" title="Print"><i class="fa-solid fa-print"></i></button>' : '') +
        (!doc && canEdit ? '<button class="btn btn-sm btn-ghost" data-action="upload" data-id="' + id + '" title="Upload Report"><i class="fa-solid fa-upload"></i></button>' : '') +
        (canEdit ? '<button class="btn btn-sm btn-ghost" data-action="edit" data-id="' + id + '" title="Edit Report"><i class="fa-solid fa-pen-to-square"></i></button>' : '') +
        (Permissions.can('lab-reports', 'delete') ? '<button class="btn btn-sm btn-ghost text-danger" data-action="delete" data-id="' + id + '" title="Delete Report"><i class="fa-solid fa-trash"></i></button>' : '');
      var row = document.createElement('tr');
      row.innerHTML = '<td><strong>' + escapeHtml(report.patientName) + '</strong></td><td>' + escapeHtml(report.test) + '</td><td>' + escapeHtml(formatDate(report.date)) + '</td><td>' + escapeHtml(report.doctor) + '</td><td><span class="badge ' + statusBadgeClass(report) + ' badge-dot">' + escapeHtml(statusLabel(report)) + '</span></td><td>' + docStatus + '</td><td><div class="table-actions">' + actions + '</div></td>';
      tbody.appendChild(row);
    });
  }

  function fillOptions() {
    var patientSelect = document.getElementById('labPatient');
    var doctorSelect = document.getElementById('labDoctor');
    patientSelect.innerHTML = '<option value="">Select patient...</option>';
    doctorSelect.innerHTML = '<option value="">Select doctor...</option>';
    getPatients().forEach(function (patient) { var option = document.createElement('option'); option.value = patient.id; option.textContent = patient.name; option.dataset.name = patient.name; patientSelect.appendChild(option); });
    getDoctors().forEach(function (doctor) { var option = document.createElement('option'); option.value = doctor.name; option.textContent = doctor.name; doctorSelect.appendChild(option); });
  }

  async function loadReports() {
    try {
      reports = await CareFlowAPI.request('/lab-reports');
      CareFlowAPI.setCached('labReports', reports);
    } catch (error) {
      reports = CareFlowAPI.getCached('labReports') || [];
      if (!reports.length) alert(error.message || 'Unable to load lab reports.');
    }
    render(); fillOptions();
    // Deep link from Lab Orders: lab-reports.html?report=<id> opens that report once.
    if (deepLinkId) {
      var linked = reports.find(function (item) { return item.id === deepLinkId; });
      deepLinkId = null;
      if (linked) showReport(linked);
    }
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

  // Shared by the table row button and the report dialog.
  async function uploadDocument(report, file) {
    var problem = validateDocFile(file);
    if (problem) { alert(problem); return false; }
    var formData = new FormData();
    formData.append('file', file);
    try {
      var updated = await CareFlowAPI.uploadLabReportDocument(report.id, formData);
      Object.assign(report, updated);
      var idx = reports.findIndex(function (r) { return r.id === report.id; });
      if (idx >= 0) reports[idx] = Object.assign({}, reports[idx], updated);
      docCache = { key: null, blob: null };
      render();
      if (currentReport && currentReport.id === report.id && viewModal.classList.contains('active')) showReport(report);
      return true;
    } catch (error) {
      alert(describe(error, 'upload the document'));
      return false;
    }
  }

  async function fetchDocumentBlob(report) {
    var key = report.id + '|' + (report.documentUploadedAt || '') + '|' + report.documentFilename;
    if (docCache.key === key && docCache.blob) return docCache.blob;
    var result = await CareFlowAPI.downloadLabReportDocument(report.id);
    docCache = { key: key, blob: result.blob };
    return result.blob;
  }

  function releaseViewerUrl() {
    if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; }
  }

  function closeView() {
    viewToken++;            // ignore any document still loading
    releaseViewerUrl();
    close(viewModal);
  }

  // Header + patient details only. Test values are deliberately NOT rendered
  // here: the uploaded document is the report.
  function reportHeaderHtml(report) {
    return '<div class="lab-report-header"><div class="lab-report-brand">' +
        '<div><h1>CAREFLOW AI</h1><p>Diagnostic Laboratory Report</p></div>' +
        '<div class="lab-report-id"><strong>Report ID</strong><br>' + escapeHtml(report.id) + '</div>' +
      '</div></div>' +
      '<div class="lab-report-section"><h3 class="lab-report-section-title">Patient Information</h3>' +
        '<div class="lab-patient-grid">' +
          '<div class="lab-patient-item"><small>Patient</small><strong>' + escapeHtml(report.patientName) + '</strong></div>' +
          '<div class="lab-patient-item"><small>Test</small><strong>' + escapeHtml(report.test) + '</strong></div>' +
          '<div class="lab-patient-item"><small>Referring Doctor</small><strong>' + escapeHtml(report.doctor) + '</strong></div>' +
          '<div class="lab-patient-item"><small>Report Date</small><strong>' + escapeHtml(formatDate(report.date)) + '</strong></div>' +
          '<div class="lab-patient-item"><small>Status</small><strong>' + escapeHtml(statusLabel(report)) + '</strong></div>' +
        '</div>' +
      '</div>';
  }

  function pendingHtml() {
    return '<div class="lab-report-section" style="margin-top: var(--space-4); text-align:center; padding: var(--space-6) var(--space-4); border: 1px dashed #d1d5db; border-radius: 8px;">' +
      '<i class="fa-solid fa-hourglass-half" style="font-size:2rem; color:#b45309;"></i>' +
      '<h3 style="margin: var(--space-2) 0 0;">Report Pending</h3>' +
      '<p class="text-muted" style="margin: var(--space-1) 0 0;">The lab report has not been uploaded yet. It will appear here once it is uploaded.</p>' +
      '</div>';
  }

  function documentControlsHtml(report, canEdit) {
    var doc = hasDocument(report);
    if (!doc && !canEdit) return '';
    var html = '<div class="lab-report-section" id="labDocumentSection" style="margin-top: var(--space-4);"><h3>' + (doc ? 'Document Details' : 'Upload Report') + '</h3>';
    if (doc) {
      html += '<p style="margin:0;"><i class="fa-solid fa-paperclip"></i> ' + escapeHtml(report.documentFilename) + '</p>';
      if (report.documentUploadedBy) {
        html += '<p class="text-muted" style="margin: var(--space-1) 0 0; font-size: var(--font-size-xs);">Uploaded by: ' + escapeHtml(report.documentUploadedBy) + ' on ' + escapeHtml(formatDateTime(report.documentUploadedAt)) + '</p>';
      }
    }
    html += '<div style="margin-top: var(--space-3); display:flex; align-items:center; gap: var(--space-2); flex-wrap: wrap;">';
    if (doc) html += '<button type="button" class="btn btn-sm btn-secondary" id="openLabDocumentBtn"><i class="fa-solid fa-up-right-from-square"></i> Open in new tab</button>';
    if (canEdit) {
      html += '<button type="button" class="btn btn-sm btn-primary" id="uploadLabDocumentBtn"><i class="fa-solid fa-upload"></i> ' + (doc ? 'Replace Document' : 'Upload Document') + '</button>';
      if (doc) html += '<button type="button" class="btn btn-sm btn-ghost text-danger" id="deleteLabDocumentBtn"><i class="fa-solid fa-trash"></i> Remove</button>';
    }
    html += '<span id="labDocumentUploadStatus" style="font-size: var(--font-size-xs); color: var(--color-gray-500);"></span></div></div>';
    return html;
  }

  function wireDocumentControls(report) {
    var uploadBtn = document.getElementById('uploadLabDocumentBtn');
    var statusEl = document.getElementById('labDocumentUploadStatus');
    var deleteBtn = document.getElementById('deleteLabDocumentBtn');
    var openBtn = document.getElementById('openLabDocumentBtn');

    if (openBtn) {
      openBtn.addEventListener('click', async function () {
        openBtn.disabled = true;
        try {
          var blob = await fetchDocumentBlob(report);
          var url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        } catch (error) {
          alert(error.message || 'Could not open the document.');
        } finally {
          openBtn.disabled = false;
        }
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', function () {
        pickFile(async function (file) {
          uploadBtn.disabled = true;
          if (statusEl) statusEl.textContent = 'Uploading...';
          var ok = await uploadDocument(report, file);
          if (!ok) {            // on success the dialog is re-rendered
            uploadBtn.disabled = false;
            if (statusEl) statusEl.textContent = '';
          }
        });
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        if (!confirm('Remove the attached document from this lab report?')) return;
        deleteBtn.disabled = true;
        try {
          await CareFlowAPI.request('/lab-reports/' + encodeURIComponent(report.id) + '/document', { method: 'DELETE' });
          [report, reports.find(function (r) { return r.id === report.id; })].forEach(function (r) {
            if (!r) return;
            r.documentFilename = null; r.documentContentType = null;
            r.documentUploadedAt = null; r.documentUploadedBy = null;
          });
          docCache = { key: null, blob: null };
          render();
          showReport(report);
        } catch (error) {
          alert(error.message || 'Could not remove the document.');
          deleteBtn.disabled = false;
        }
      });
    }
  }

  async function loadViewer(report, token) {
    var box = document.getElementById('labDocumentViewer');
    if (!box) return;
    try {
      var blob = await fetchDocumentBlob(report);
      if (token !== viewToken) return;
      releaseViewerUrl();
      viewerUrl = URL.createObjectURL(blob);
      if (report.documentContentType.indexOf('image/') === 0) {
        box.innerHTML = '<img src="' + viewerUrl + '" alt="Lab report document" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #d1d5db; border-radius:8px;">';
      } else {
        box.innerHTML = '<iframe src="' + viewerUrl + '" title="Lab report document" style="width:100%; height:70vh; min-height:480px; border:1px solid #d1d5db; border-radius:8px;"></iframe>';
      }
    } catch (error) {
      if (token !== viewToken) return;
      box.innerHTML = '<p class="text-danger" style="text-align:center; padding: var(--space-3);">Could not load document: ' + escapeHtml(error.message) + '</p>';
    }
  }

  function showReport(report) {
    currentReport = report;
    var token = ++viewToken;
    releaseViewerUrl();
    var doc = hasDocument(report);
    var canEdit = Permissions.can('lab-reports', 'edit');

    // Order matters: patient details, then the uploaded document (or the
    // Pending notice) straight away, and only then the small upload controls.
    var html = '<div class="lab-report">' + reportHeaderHtml(report) + '</div>';
    html += doc
      ? '<div id="labDocumentViewer" style="margin-top: var(--space-4);"><div style="text-align:center; padding: var(--space-4);"><i class="fa-solid fa-spinner fa-spin"></i> Loading document...</div></div>'
      : pendingHtml();
    html += documentControlsHtml(report, canEdit);
    viewContent.innerHTML = html;

    var downloadBtn = document.getElementById('downloadReportBtn');
    var printBtn = document.getElementById('viewPrintBtn');
    if (downloadBtn) downloadBtn.disabled = !doc;
    if (printBtn) printBtn.disabled = !doc;

    if (doc) loadViewer(report, token);
    wireDocumentControls(report);
    open(viewModal);
  }

  async function printReport(report) {
    if (!hasDocument(report)) { alert(PENDING_MESSAGE); return; }
    try {
      var blob = await fetchDocumentBlob(report);
      var url = URL.createObjectURL(blob);
      if (report.documentContentType.indexOf('image/') === 0) {
        var area = document.getElementById('printArea');
        area.innerHTML = '<div class="lab-report">' + reportHeaderHtml(report) + '</div><img src="' + url + '" alt="Lab report document" style="max-width:100%; height:auto;">';
        var img = area.querySelector('img');
        var doPrint = function () { window.print(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
        if (img.complete) doPrint();
        else { img.onload = doPrint; img.onerror = function () { alert('Could not prepare the document for printing.'); }; }
      } else {
        // PDFs print best from the browser's own PDF viewer.
        window.open(url, '_blank', 'noopener');
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }
    } catch (error) {
      alert(error.message || 'Could not open the document for printing.');
    }
  }

  // ===================================================================
  // EDIT LAB REPORT
  // ===================================================================
  // Backend support: make_crud_router exposes PUT /lab-reports/{id}
  // (there is no PATCH route). LabReportUpdate accepts exactly:
  //   patientId, patientName, test, date, doctor, result, status,
  //   normalRange
  // The document fields (documentFilename / documentContentType /
  // documentSize) are response-only, so a PUT can never clear an
  // uploaded file - attachments survive an edit untouched and are only
  // changed through the explicit upload/remove controls.
  //
  // MEDICAL-RECORD SAFETY NOTE: this project does NOT implement an
  // immutable void-and-reissue model for lab reports - there is no
  // void/amended/superseded column anywhere in the schema. Direct,
  // RBAC-restricted, server-audited editing is therefore the final
  // behaviour (documented in the report). Every update writes an audit
  // row via crud_factory._write_audit, so changes remain traceable.

  var editModal = document.getElementById('editLabModal');
  var saveEditBtn = document.getElementById('saveEditLab');
  var editingReportId = null;
  var labSaveInFlight = false;

  var LAB_STATUSES = ['Normal', 'Abnormal'];

  function describe(error, action) {
    if (typeof CareFlowAPI !== 'undefined' && CareFlowAPI.describeError) {
      return CareFlowAPI.describeError(error, action);
    }
    return (error && error.message) || ('Could not ' + action + '.');
  }

  function setEditBusy(busy) {
    var labelEl = document.getElementById('saveEditLabLabel');
    var cancelBtn = document.getElementById('cancelEditLab');
    if (saveEditBtn) saveEditBtn.disabled = busy;
    if (cancelBtn) cancelBtn.disabled = busy;
    if (!labelEl) return;
    if (busy) {
      labelEl.dataset.idleLabel = labelEl.textContent;
      labelEl.textContent = 'Saving...';
    } else if (labelEl.dataset.idleLabel) {
      labelEl.textContent = labelEl.dataset.idleLabel;
      delete labelEl.dataset.idleLabel;
    }
  }

  function fillEditOptions(report) {
    var patientSelect = document.getElementById('editLabPatient');
    var doctorSelect = document.getElementById('editLabDoctor');
    patientSelect.innerHTML = '';
    doctorSelect.innerHTML = '';

    var patients = getPatients();
    var hasPatient = false;
    patients.forEach(function (patient) {
      var option = document.createElement('option');
      option.value = patient.id;
      option.textContent = patient.name;
      option.dataset.name = patient.name;
      if (String(patient.id) === String(report.patientId)) hasPatient = true;
      patientSelect.appendChild(option);
    });
    // Keep the historical patient selectable even if that record is no
    // longer in the active list, so editing never silently reassigns it.
    if (!hasPatient && report.patientId) {
      var keepPatient = document.createElement('option');
      keepPatient.value = report.patientId;
      keepPatient.textContent = (report.patientName || report.patientId) + ' (current)';
      keepPatient.dataset.name = report.patientName || '';
      patientSelect.insertBefore(keepPatient, patientSelect.firstChild);
    }
    patientSelect.value = report.patientId || '';

    var hasDoctor = false;
    getDoctors().forEach(function (doctor) {
      var option = document.createElement('option');
      option.value = doctor.name;
      option.textContent = doctor.name;
      if (doctor.name === report.doctor) hasDoctor = true;
      doctorSelect.appendChild(option);
    });
    // getDoctors() already excludes deactivated doctors from new
    // assignments; the existing doctor on an old report is preserved
    // rather than erased.
    if (!hasDoctor && report.doctor) {
      var keepDoctor = document.createElement('option');
      keepDoctor.value = report.doctor;
      keepDoctor.textContent = report.doctor + ' (current)';
      doctorSelect.insertBefore(keepDoctor, doctorSelect.firstChild);
    }
    doctorSelect.value = report.doctor || '';
  }

  function openEditReport(report) {
    if (!Permissions.can('lab-reports', 'edit')) {
      alert('You do not have permission to edit lab reports.');
      return;
    }
    if (!editModal) return;

    editingReportId = report.id;
    fillEditOptions(report);
    document.getElementById('editLabTest').value = report.test || '';
    document.getElementById('editLabDate').value = report.date || '';
    document.getElementById('editLabResult').value = report.result || '';
    document.getElementById('editLabNormalRange').value = report.normalRange || '';
    document.getElementById('editLabStatus').value =
      LAB_STATUSES.indexOf(report.status) >= 0 ? report.status : 'Normal';

    open(editModal);
  }

  function closeEditReport() {
    editingReportId = null;
    if (editModal) close(editModal);
  }

  async function saveEditedReport() {
    if (labSaveInFlight || !editingReportId) return;

    if (!Permissions.can('lab-reports', 'edit')) {
      alert('You do not have permission to edit lab reports.');
      return;
    }

    var existing = reports.find(function (item) { return item.id === editingReportId; });
    if (!existing) {
      alert('This lab report is no longer available. Refreshing the list.');
      closeEditReport();
      await loadReports();
      return;
    }

    var patientSelect = document.getElementById('editLabPatient');
    var patientOption = patientSelect.options[patientSelect.selectedIndex];
    var doctor = document.getElementById('editLabDoctor').value;
    var test = document.getElementById('editLabTest').value.trim();
    var date = document.getElementById('editLabDate').value;
    var result = document.getElementById('editLabResult').value.trim();
    var normalRange = document.getElementById('editLabNormalRange').value.trim();
    var status = document.getElementById('editLabStatus').value;

    if (!patientOption || !patientOption.value) { alert('Please select a patient.'); return; }
    if (!doctor) { alert('Please select a referring doctor.'); return; }
    if (!test) { alert('Please enter the test name.'); return; }
    if (!date) { alert('Please enter the report date.'); return; }
    if (!result) { alert('Please enter the result.'); return; }
    if (LAB_STATUSES.indexOf(status) === -1) { alert('Please choose a valid status.'); return; }

    var payload = {
      patientId: patientOption.value,
      patientName: patientOption.dataset.name || existing.patientName,
      test: test,
      date: date,
      doctor: doctor,
      result: result,
      status: status,
      normalRange: normalRange || '-'
    };

    labSaveInFlight = true;
    setEditBusy(true);

    try {
      await CareFlowAPI.request('/lab-reports/' + encodeURIComponent(editingReportId), {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      closeEditReport();
      await loadReports();
      alert('Lab report updated successfully.');
    } catch (error) {
      if (error && error.careFlowStatus === 404) {
        closeEditReport();
        await loadReports();
      }
      alert(describe(error, 'update this lab report'));
    } finally {
      labSaveInFlight = false;
      setEditBusy(false);
    }
  }

  if (saveEditBtn) saveEditBtn.addEventListener('click', saveEditedReport);
  var closeEditBtnEl = document.getElementById('closeEditLabModal');
  if (closeEditBtnEl) closeEditBtnEl.addEventListener('click', closeEditReport);
  var cancelEditBtnEl = document.getElementById('cancelEditLab');
  if (cancelEditBtnEl) cancelEditBtnEl.addEventListener('click', closeEditReport);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && editModal && editModal.classList.contains('active') && !labSaveInFlight) {
      closeEditReport();
    }
  });

  tbody.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-action]'); if (!button) return;
    var report = reports.find(function (item) { return item.id === button.dataset.id; }); if (!report) return;
    var action = button.dataset.action;

    if (action === 'edit') {
      openEditReport(report);
      return;
    }

    if (action === 'upload') {
      if (!Permissions.can('lab-reports', 'edit')) { alert('You do not have permission to upload lab reports.'); return; }
      pickFile(function (file) { uploadDocument(report, file); });
      return;
    }

    if (action === 'delete') {
      if (!Permissions.can('lab-reports', 'delete')) {
        alert('You do not have permission to delete lab reports.');
        return;
      }
      if (!window.confirm('Delete this lab report? This cannot be undone.')) return;
      button.disabled = true;
      try {
        await CareFlowAPI.request('/lab-reports/' + encodeURIComponent(report.id), { method: 'DELETE' });
        await loadReports();
      } catch (error) {
        alert(describe(error, 'delete this lab report'));
        button.disabled = false;
      }
      return;
    }

    if (action === 'print') { printReport(report); return; }
    showReport(report);
  });
  // Lab reports are the final, verified output of the lab-order workflow.
  // Sending a new request through that workflow prevents a placeholder
  // "report" (without a verified result) from appearing in this list.
  if (newLabOrderBtn) {
    newLabOrderBtn.addEventListener('click', function () {
      window.location.href = 'lab-orders.html?new=1';
    });
  }
  document.getElementById('closeNewLabModal').addEventListener('click', function () { close(orderModal); });
  document.getElementById('cancelNewLab').addEventListener('click', function () { close(orderModal); });
  document.getElementById('closeViewLabModal').addEventListener('click', closeView);
  document.getElementById('closeViewBtn').addEventListener('click', closeView);
  document.getElementById('viewPrintBtn').addEventListener('click', function () { if (currentReport) printReport(currentReport); });
  var viewEditBtn = document.getElementById('editFromViewBtn');
  if (viewEditBtn) {
    viewEditBtn.addEventListener('click', function () {
      if (!currentReport) return;
      closeView();
      openEditReport(currentReport);
    });
  }
  document.getElementById('downloadReportBtn').addEventListener('click', async function () {
    if (!currentReport) return;
    if (!hasDocument(currentReport)) { alert(PENDING_MESSAGE); return; }
    var btn = document.getElementById('downloadReportBtn');
    btn.disabled = true;
    try {
      var blob = await fetchDocumentBlob(currentReport);
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = currentReport.documentFilename;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    } catch (error) {
      alert(error.message || 'Could not download the document.');
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById('saveLabOrder').addEventListener('click', async function () {
    var patientSelect = document.getElementById('labPatient'); var patient = patientSelect.options[patientSelect.selectedIndex];
    var doctor = document.getElementById('labDoctor').value; var test = document.getElementById('labTest').value.trim();
    if (!patient.value || !doctor || !test) { alert('Please select a patient, doctor and test name.'); return; }
    try {
      var newReport = await CareFlowAPI.request('/lab-reports', { method: 'POST', body: JSON.stringify({ patientId: patient.value, patientName: patient.dataset.name, doctor: doctor, test: test, date: new Date().toISOString().slice(0, 10), result: 'Pending analysis', status: 'Normal', normalRange: '-' }) });
      close(orderModal); document.getElementById('labTest').value = ''; await loadReports(); alert('Lab order saved successfully.');
    } catch (error) { alert(describe(error, 'save this lab order')); }
  });
  function getVisibleReports() {
    var term = (search.value || '').toLowerCase().trim();
    return reports.filter(function (report) { return !term || [report.patientName, report.test, report.doctor, statusLabel(report)].join(' ').toLowerCase().indexOf(term) >= 0; });
  }
  document.getElementById('printAllBtn').addEventListener('click', function () { document.getElementById('printArea').innerHTML = reports.map(function (report) { return '<p><strong>' + escapeHtml(report.patientName) + '</strong> — ' + escapeHtml(report.test) + ': ' + (hasDocument(report) ? 'Report uploaded' : 'Pending') + '</p>'; }).join(''); window.print(); });
  var exportLabReportsBtn = document.getElementById('exportLabReportsBtn');
  if (exportLabReportsBtn) {
    exportLabReportsBtn.addEventListener('click', function () {
      var rows = getVisibleReports();
      if (!rows.length) { alert('No lab reports to export.'); return; }
      function csvValue(value) { var str = value === null || value === undefined ? '' : String(value); if (/[",\n]/.test(str)) { str = '"' + str.replace(/"/g, '""') + '"'; } return str; }
      var header = ['Patient', 'Test', 'Date', 'Doctor', 'Result', 'Normal Range', 'Status'];
      var csv = [header.map(csvValue).join(',')];
      rows.forEach(function (report) {
        var pending = !hasDocument(report);
        csv.push([csvValue(report.patientName), csvValue(report.test), csvValue(report.date), csvValue(report.doctor), csvValue(pending ? 'Pending' : report.result), csvValue(pending ? 'Pending' : report.normalRange), csvValue(statusLabel(report))].join(','));
      });
      var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url; link.download = 'CareFlow-LabReports-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    });
  }
  search.addEventListener('input', render);

  // Permissions must be available before rendering action controls.
  // The backend remains the security boundary, while this keeps the UI
  // accurate for each signed-in role.
  Permissions.ensureLoaded().then(function () {
    if (newLabOrderBtn && !Permissions.can('lab-orders', 'create')) {
      Permissions.hide(newLabOrderBtn);
    }
    if (viewEditBtn && !Permissions.can('lab-reports', 'edit')) {
      viewEditBtn.style.display = 'none';
    }
    loadReports();
  }).catch(function () {
    // A load error will be shown by the existing request handler; keep the
    // report list read-only rather than guessing a user's permissions.
    if (newLabOrderBtn) Permissions.hide(newLabOrderBtn);
    if (viewEditBtn) viewEditBtn.style.display = 'none';
    loadReports();
  });

  // Keep the list live while this page stays open.
  setInterval(loadReports, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadReports(); });
  window.addEventListener('focus', loadReports);
});
