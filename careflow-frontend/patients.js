/* ============================================
   CAREFLOW AI - PATIENTS MODULE
   Patient Grid, Search, Filter, Sort
   ALWAYS loads latest patients from backend
   ============================================ */

document.addEventListener('DOMContentLoaded', async function () {

  if (!Auth.requireAuth()) return;

  var grid = document.getElementById('patientGrid');
  var emptyState = document.getElementById('emptyState');
  var searchInput = document.getElementById('patientFilterSearch');
  var sortSelect = document.getElementById('sortBy');
  var filterChips = document.querySelectorAll('.filter-chip');

  var patients = [];
  var archivedPatients = [];
  var currentFilter = 'all';
  var currentSort = 'name';
  var lastFilteredPatients = [];
  var selectedPatientIds = new Set();
  var REFRESH_INTERVAL_MS = 20000; // keep the list live while it stays open

  /* ============================================
     ARCHIVE / RESTORE (delegated - cards are
     re-created on every render, so bind to the
     stable grid container instead)
     ============================================ */

  if (grid) {
    grid.addEventListener('click', async function (e) {
      var archiveBtn = e.target.closest('[data-archive-id]');
      var restoreBtn = e.target.closest('[data-restore-id]');
      if (!archiveBtn && !restoreBtn) return;

      e.preventDefault();
      e.stopPropagation();

      if (archiveBtn) {
        var archiveId = archiveBtn.getAttribute('data-archive-id');
        if (!window.confirm('Archive this patient? They\u2019ll be hidden from the active list but can be restored anytime.')) return;
        archiveBtn.disabled = true;
        try {
          await CareFlowAPI.request('/patients/' + encodeURIComponent(archiveId), { method: 'DELETE' });
          patients = patients.filter(function (p) { return String(normalizePatient(p).id) !== String(archiveId); });
          CareFlowAPI.setCached('patients', patients);
          if (currentFilter === 'Archived') { await loadArchivedPatients(); }
          applyFiltersAndSort();
        } catch (error) {
          alert(error.message || 'Could not archive this patient.');
          archiveBtn.disabled = false;
        }
      }

      if (restoreBtn) {
        var restoreId = restoreBtn.getAttribute('data-restore-id');
        restoreBtn.disabled = true;
        try {
          var restored = await CareFlowAPI.request('/patients/' + encodeURIComponent(restoreId) + '/restore', { method: 'POST' });
          archivedPatients = archivedPatients.filter(function (p) { return String(normalizePatient(p).id) !== String(restoreId); });
          patients.push(restored);
          CareFlowAPI.setCached('patients', patients);
          applyFiltersAndSort();
        } catch (error) {
          alert(error.message || 'Could not restore this patient.');
          restoreBtn.disabled = false;
        }
      }
    });
  }

  async function loadArchivedPatients() {
    try {
      var all = await CareFlowAPI.request('/patients?include_archived=true');
      archivedPatients = (Array.isArray(all) ? all : []).filter(function (p) { return p.isArchived; });
    } catch (error) {
      console.error('Failed to load archived patients:', error);
      archivedPatients = [];
    }
  }

  /* ============================================
     LOAD PATIENTS DIRECTLY FROM BACKEND
     ============================================ */

  async function loadPatients() {
    try {

      /*
       * IMPORTANT:
       * Do NOT use mock-data.js getPatients().
       * Fetch the latest database data from API.
       */

      var response = await CareFlowAPI.request('/patients');

      if (Array.isArray(response)) {
        patients = response;
      } else if (response && Array.isArray(response.data)) {
        patients = response.data;
      } else if (response && Array.isArray(response.items)) {
        patients = response.items;
      } else {
        patients = [];
      }

      /*
       * Update frontend cache too.
       */
      CareFlowAPI.setCached('patients', patients);

      applyFiltersAndSort();

    } catch (error) {

      console.error('Failed to load patients from database:', error);

      /*
       * If backend request fails, DON'T silently show old
       * mock patients. This was causing confusion.
       */
      patients = [];

      if (grid) {
        grid.innerHTML = '';
        grid.style.display = 'none';
      }

      if (emptyState) {
        emptyState.style.display = 'flex';
        emptyState.innerHTML =
          '<div class="empty-state-content">' +
            '<h3>Unable to load patients</h3>' +
            '<p>' + escapeHtml(error.message || 'Backend connection failed.') + '</p>' +
            '<button type="button" class="btn btn-primary" id="retryPatientsBtn">' +
              'Retry' +
            '</button>' +
          '</div>';

        var retryBtn = document.getElementById('retryPatientsBtn');

        if (retryBtn) {
          retryBtn.addEventListener('click', loadPatients);
        }
      }
    }
  }


  /* ============================================
     ESCAPE HTML
     ============================================ */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  /* ============================================
     NORMALIZE PATIENT DATA
     Handles backend field names safely
     ============================================ */

  function normalizePatient(p) {

    p = p || {};

    var name =
      p.name ||
      p.patient_name ||
      p.patientName ||
      'Unknown Patient';

    var id =
      p.id ||
      p.patient_id ||
      p.patientId ||
      '';

    var mrn =
      p.mrn ||
      p.MRN ||
      '';

    var gender =
      p.gender ||
      p.sex ||
      '';

    var age =
      p.age != null
        ? p.age
        : '';

    var bloodGroup =
      p.blood_group ||
      p.bloodGroup ||
      p.bloodType ||
      '';

    var doctor =
      p.doctor_name ||
      p.doctor ||
      p.doctorName ||
      '';

    var severity =
      p.severity ||
      'Stable';

    var status =
      p.status ||
      'Active';

    var admissionDate =
      p.admission_date ||
      p.admissionDate ||
      p.created_at ||
      '';

    var symptoms = [];

    if (Array.isArray(p.symptoms)) {
      symptoms = p.symptoms;
    } else if (typeof p.symptoms === 'string') {
      try {
        var parsed = JSON.parse(p.symptoms);

        if (Array.isArray(parsed)) {
          symptoms = parsed;
        } else if (p.symptoms.trim()) {
          symptoms = [p.symptoms];
        }
      } catch (e) {
        if (p.symptoms.trim()) {
          symptoms = [p.symptoms];
        }
      }
    }

    return {
      id: id,
      name: name,
      mrn: mrn,
      gender: gender,
      age: age,
      bloodGroup: bloodGroup,
      doctor: doctor,
      severity: severity,
      status: status,
      admissionDate: admissionDate,
      symptoms: symptoms,
      avatarBg: p.avatarBg || '#e8eef7',
      isArchived: !!p.isArchived,
      archivedBy: p.archivedBy || null,
      archivedAt: p.archivedAt || null
    };
  }


  /* ============================================
     RENDER PATIENTS
     ============================================ */

  function renderPatients(filteredList) {

    if (!grid) return;

    grid.innerHTML = '';

    if (!filteredList.length) {

      if (emptyState) {
        emptyState.style.display = 'flex';
        emptyState.innerHTML =
          '<div class="empty-state-content">' +
            '<h3>No patients found</h3>' +
            '<p>There are no patients matching your current filter.</p>' +
          '</div>';
      }

      grid.style.display = 'none';
      return;
    }

    if (emptyState) {
      emptyState.style.display = 'none';
    }

    grid.style.display = '';

    filteredList.forEach(function (rawPatient) {

      var p = normalizePatient(rawPatient);

      var severityClass = 'severity-stable';

      if (p.severity === 'Critical') {
        severityClass = 'severity-critical';
      } else if (p.severity === 'High') {
        severityClass = 'severity-high';
      } else if (p.severity === 'Medium') {
        severityClass = 'severity-medium';
      } else if (p.severity === 'Low') {
        severityClass = 'severity-low';
      }

      var badgeClass = 'badge-neutral';

      if (p.severity === 'Critical') {
        badgeClass = 'badge-danger';
      } else if (p.severity === 'High') {
        badgeClass = 'badge-warning';
      } else if (p.severity === 'Low') {
        badgeClass = 'badge-success';
      }

      var initials = p.name
        .split(/\s+/)
        .filter(Boolean)
        .map(function (n) {
          return n.charAt(0);
        })
        .join('')
        .substring(0, 2)
        .toUpperCase();

      var card = document.createElement('div');

      card.className =
        'patient-card priority-' +
        String(p.severity || 'stable').toLowerCase();

      if (p.isArchived) {
        card.style.opacity = '0.72';
      }

      card.innerHTML =
        '<div class="patient-card-select">' +
          '<input type="checkbox" data-select-id="' + escapeHtml(p.id) + '" ' + (selectedPatientIds.has(String(p.id)) ? 'checked' : '') + '>' +
        '</div>' +

        '<div class="patient-card-badge">' +
          '<span class="badge ' +
            badgeClass +
            ' badge-dot">' +
            escapeHtml(p.severity) +
          '</span>' +
        '</div>' +

        '<div class="patient-card-header">' +

          '<div class="patient-card-avatar" style="background:' +
            escapeHtml(p.avatarBg) +
          '">' +
            escapeHtml(initials) +
          '</div>' +

          '<div class="patient-card-info">' +

            '<div class="patient-card-name">' +
              escapeHtml(p.name) +
            '</div>' +

            '<div class="patient-card-mrn">' +
              escapeHtml(p.mrn) +
              ' | ' +
              escapeHtml(p.gender) +
              ', ' +
              escapeHtml(p.age) +
            '</div>' +

          '</div>' +

        '</div>' +

        '<div class="patient-card-body">' +

          '<div class="patient-card-detail">' +
            '<span class="patient-card-detail-label">Blood Group</span>' +
            '<span class="patient-card-detail-value">' +
              escapeHtml(p.bloodGroup) +
            '</span>' +
          '</div>' +

          '<div class="patient-card-detail">' +
            '<span class="patient-card-detail-label">Doctor</span>' +
            '<span class="patient-card-detail-value">' +
              escapeHtml(p.doctor) +
            '</span>' +
          '</div>' +

          '<div class="patient-card-detail">' +
            '<span class="patient-card-detail-label">Status</span>' +
            '<span class="patient-card-detail-value">' +
              escapeHtml(p.status) +
            '</span>' +
          '</div>' +

          '<div class="patient-card-detail">' +
            '<span class="patient-card-detail-label">Admission</span>' +
            '<span class="patient-card-detail-value">' +
              escapeHtml(p.admissionDate) +
            '</span>' +
          '</div>' +

        '</div>' +

        '<div class="patient-card-symptoms">' +

          p.symptoms.map(function (s) {

            return (
              '<span class="symptom-tag ' +
              severityClass +
              '">' +
              escapeHtml(s) +
              '</span>'
            );

          }).join('') +

        '</div>' +

        '<div class="patient-card-footer">' +

          '<span class="patient-card-time">' +
            '<i class="fa-regular fa-clock"></i> ' +
            escapeHtml(p.status) +
          '</span>' +

          '<div style="display:flex;gap:0.4rem;">' +

          (Permissions.can('patients', 'delete') ?
            (p.isArchived ?
              '<button type="button" class="btn btn-sm btn-outline-primary" data-restore-id="' + escapeHtml(p.id) + '" title="Restore patient"><i class="fa-solid fa-rotate-left"></i></button>' :
              '<button type="button" class="btn btn-sm btn-outline-primary" data-archive-id="' + escapeHtml(p.id) + '" title="Delete patient (archive)"><i class="fa-solid fa-box-archive"></i></button>'
            ) : '') +

          '<a href="patient-details.html?id=' +
            encodeURIComponent(p.id) +
            '" class="btn btn-sm btn-primary">' +
            'Details' +
          '</a>' +

          '</div>' +

        '</div>';


      if (selectedPatientIds.has(String(p.id))) {
        card.classList.add('is-selected');
      }

      card.addEventListener('click', function (e) {

        if (!e.target.closest('a, button, input[type="checkbox"]')) {
          window.location.href =
            'patient-details.html?id=' +
            encodeURIComponent(p.id);
        }

      });

      grid.appendChild(card);
    });
  }


  /* ============================================
     FILTER + SORT
     ============================================ */

  function applyFiltersAndSort() {

    var filtered = (currentFilter === 'Archived' ? archivedPatients : patients).slice();

    if (currentFilter !== 'all' && currentFilter !== 'Archived') {

      filtered = filtered.filter(function (patient) {

        var p = normalizePatient(patient);

        return p.severity === currentFilter;

      });
    }

    if (searchInput) {

      var term =
        searchInput.value
          .toLowerCase()
          .trim();

      if (term) {

        filtered = filtered.filter(function (patient) {

          var p = normalizePatient(patient);

          return (
            p.name.toLowerCase().indexOf(term) > -1 ||
            p.mrn.toLowerCase().indexOf(term) > -1 ||
            p.doctor.toLowerCase().indexOf(term) > -1
          );

        });
      }
    }


    if (currentSort === 'name') {

      filtered.sort(function (a, b) {

        return normalizePatient(a)
          .name
          .localeCompare(
            normalizePatient(b).name
          );

      });

    } else if (currentSort === 'severity') {

      var severityOrder = {
        Critical: 0,
        High: 1,
        Medium: 2,
        Low: 3,
        Stable: 4
      };

      filtered.sort(function (a, b) {

        var pa = normalizePatient(a);
        var pb = normalizePatient(b);

        return (
          (severityOrder[pa.severity] ?? 5) -
          (severityOrder[pb.severity] ?? 5)
        );

      });

    } else if (currentSort === 'date') {

      filtered.sort(function (a, b) {

        var pa = normalizePatient(a);
        var pb = normalizePatient(b);

        return String(pb.admissionDate)
          .localeCompare(
            String(pa.admissionDate)
          );

      });
    }

    lastFilteredPatients = filtered;

    renderPatients(filtered);
  }


  /* ============================================
     EXPORT (CSV)
     ============================================ */

  function csvValue(value) {
    var str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  var exportPatientsBtn = document.getElementById('exportPatientsBtn');
  if (exportPatientsBtn) {
    exportPatientsBtn.addEventListener('click', function () {
      var rows = lastFilteredPatients || [];

      if (!rows.length) {
        alert('No patients to export.');
        return;
      }

      var header = ['Name', 'MRN', 'Gender', 'Age', 'Blood Group', 'Doctor', 'Severity', 'Status', 'Admission Date'];
      var csv = [header.map(csvValue).join(',')];

      rows.forEach(function (patient) {
        var p = normalizePatient(patient);
        csv.push([
          csvValue(p.name),
          csvValue(p.mrn),
          csvValue(p.gender),
          csvValue(p.age),
          csvValue(p.bloodGroup),
          csvValue(p.doctor),
          csvValue(p.severity),
          csvValue(p.status),
          csvValue(p.admissionDate)
        ].join(','));
      });

      var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'CareFlow-Patients-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }


  /* ============================================
     PRINT
     ============================================ */

  var printPatientsBtn = document.getElementById('printPatientsBtn');
  if (printPatientsBtn) {
    printPatientsBtn.addEventListener('click', function () {
      var rows = lastFilteredPatients || [];

      if (!rows.length) {
        alert('No patients to print.');
        return;
      }

      var printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow pop-ups to print the patient list.');
        return;
      }

      var tableRows = rows.map(function (patient) {
        var p = normalizePatient(patient);
        return '<tr>' +
          '<td>' + escapeHtml(p.name) + '</td>' +
          '<td>' + escapeHtml(p.mrn) + '</td>' +
          '<td>' + escapeHtml(p.gender) + '</td>' +
          '<td>' + escapeHtml(String(p.age)) + '</td>' +
          '<td>' + escapeHtml(p.bloodGroup) + '</td>' +
          '<td>' + escapeHtml(p.doctor) + '</td>' +
          '<td>' + escapeHtml(p.severity) + '</td>' +
          '<td>' + escapeHtml(p.status) + '</td>' +
          '<td>' + escapeHtml(String(p.admissionDate)) + '</td>' +
        '</tr>';
      }).join('');

      printWindow.document.write(
        '<!DOCTYPE html><html><head><title>CareFlow AI - Patient List</title>' +
        '<style>' +
          'body{font-family:Arial,sans-serif;padding:24px;color:#1a1a1a;}' +
          'h1{font-size:18px;margin-bottom:4px;}' +
          'p.meta{color:#666;margin-top:0;margin-bottom:16px;font-size:12px;}' +
          'table{width:100%;border-collapse:collapse;font-size:12px;}' +
          'th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}' +
          'th{background:#f5f5f5;}' +
        '</style></head><body>' +
        '<h1>CareFlow AI - Patient List</h1>' +
        '<p class="meta">Generated on ' + new Date().toLocaleString() + ' &middot; ' + rows.length + ' patient(s)</p>' +
        '<table><thead><tr><th>Name</th><th>MRN</th><th>Gender</th><th>Age</th><th>Blood Group</th><th>Doctor</th><th>Severity</th><th>Status</th><th>Admission Date</th></tr></thead>' +
        '<tbody>' + tableRows + '</tbody></table>' +
        '</body></html>'
      );
      printWindow.document.close();
      printWindow.focus();
      setTimeout(function () {
        printWindow.print();
      }, 250);
    });
  }


  /* ============================================
     BULK SELECT / BULK ACTIONS
     ============================================ */

  var bulkBar = document.getElementById('bulkActionsBar');
  var bulkCount = document.getElementById('bulkSelectedCount');
  var bulkExportBtn = document.getElementById('bulkExportBtn');
  var bulkArchiveBtn = document.getElementById('bulkArchiveBtn');
  var bulkClearBtn = document.getElementById('bulkClearBtn');

  function updateBulkBar() {
    if (!bulkBar) return;
    var count = selectedPatientIds.size;
    if (count > 0) {
      bulkBar.classList.add('active');
      if (bulkCount) bulkCount.textContent = count + ' selected';
    } else {
      bulkBar.classList.remove('active');
    }
  }

  if (grid) {
    grid.addEventListener('change', function (e) {
      var checkbox = e.target.closest('input[type="checkbox"][data-select-id]');
      if (!checkbox) return;

      var id = checkbox.getAttribute('data-select-id');
      var card = checkbox.closest('.patient-card');

      if (checkbox.checked) {
        selectedPatientIds.add(String(id));
        if (card) card.classList.add('is-selected');
      } else {
        selectedPatientIds.delete(String(id));
        if (card) card.classList.remove('is-selected');
      }

      updateBulkBar();
    });
  }

  if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', function () {
      selectedPatientIds.clear();
      updateBulkBar();
      applyFiltersAndSort();
    });
  }

  if (bulkExportBtn) {
    bulkExportBtn.addEventListener('click', function () {
      var rows = patients.filter(function (patient) {
        return selectedPatientIds.has(String(normalizePatient(patient).id));
      });

      if (!rows.length) {
        alert('No patients selected.');
        return;
      }

      var header = ['Name', 'MRN', 'Gender', 'Age', 'Blood Group', 'Doctor', 'Severity', 'Status', 'Admission Date'];
      var csv = [header.map(csvValue).join(',')];

      rows.forEach(function (patient) {
        var p = normalizePatient(patient);
        csv.push([
          csvValue(p.name),
          csvValue(p.mrn),
          csvValue(p.gender),
          csvValue(p.age),
          csvValue(p.bloodGroup),
          csvValue(p.doctor),
          csvValue(p.severity),
          csvValue(p.status),
          csvValue(p.admissionDate)
        ].join(','));
      });

      var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'CareFlow-Patients-Selected-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  if (bulkArchiveBtn) {
    bulkArchiveBtn.addEventListener('click', async function () {
      var ids = Array.from(selectedPatientIds);
      if (!ids.length) {
        alert('No patients selected.');
        return;
      }

      if (!window.confirm('Archive ' + ids.length + ' selected patient(s)? They\u2019ll be hidden from the active list but can be restored anytime.')) {
        return;
      }

      bulkArchiveBtn.disabled = true;

      var failures = 0;
      for (var i = 0; i < ids.length; i++) {
        try {
          await CareFlowAPI.request('/patients/' + encodeURIComponent(ids[i]), { method: 'DELETE' });
        } catch (error) {
          failures++;
        }
      }

      patients = patients.filter(function (patient) {
        return !selectedPatientIds.has(String(normalizePatient(patient).id));
      });
      CareFlowAPI.setCached('patients', patients);
      selectedPatientIds.clear();
      updateBulkBar();
      if (currentFilter === 'Archived') { await loadArchivedPatients(); }
      applyFiltersAndSort();

      bulkArchiveBtn.disabled = false;

      if (failures) {
        alert(failures + ' patient(s) could not be archived.');
      }
    });
  }


  /* ============================================
     SEARCH
     ============================================ */

  if (searchInput) {

    searchInput.addEventListener(
      'input',
      applyFiltersAndSort
    );

  }


  /* ============================================
     SORT
     ============================================ */

  if (sortSelect) {

    sortSelect.addEventListener(
      'change',
      function () {

        currentSort = sortSelect.value;

        applyFiltersAndSort();

      }
    );

  }


  /* ============================================
     FILTER CHIPS
     ============================================ */

  filterChips.forEach(function (chip) {

    chip.addEventListener(
      'click',
      async function () {

        filterChips.forEach(function (c) {
          c.classList.remove('active');
        });

        chip.classList.add('active');

        currentFilter =
          chip.getAttribute('data-filter') || 'all';

        if (currentFilter === 'Archived') {
          await loadArchivedPatients();
        }

        applyFiltersAndSort();

      }
    );

  });


  /* ============================================
     ADD PATIENT
     ============================================ */

  var addPatientBtn =
    document.getElementById('addPatientBtn');

  if (addPatientBtn) {

    addPatientBtn.addEventListener(
      'click',
      function () {

        window.location.href =
          'add-patient.html';

      }
    );

  }


  /* ============================================
     INITIAL LOAD
     ============================================ */

  await Permissions.ensureLoaded().catch(function () {});

  if (addPatientBtn) Permissions.guard(addPatientBtn, 'patients', 'create');

  var archivedChip = document.getElementById('archivedFilterChip');
  if (archivedChip && Permissions.can('patients', 'delete')) {
    archivedChip.style.display = '';
  }

  if (bulkArchiveBtn && !Permissions.can('patients', 'delete')) {
    bulkArchiveBtn.style.display = 'none';
  }

  await loadPatients();

  /* ============================================
     KEEP THE LIST LIVE WHILE THIS PAGE STAYS OPEN
     ============================================ */

  setInterval(loadPatients, REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadPatients();
  });
  window.addEventListener('focus', loadPatients);

});