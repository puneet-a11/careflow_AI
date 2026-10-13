/* ============================================
   CAREFLOW AI - DEPARTMENTS MODULE
   Department Cards with Stats + Add / Edit / Delete
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;

  var grid = document.getElementById('departmentGrid');
  if (!grid) return;

  var addBtn = document.getElementById('addDepartmentBtn');
  var modal = document.getElementById('departmentModal');
  var modalTitle = document.getElementById('departmentModalTitle');
  var modalClose = document.getElementById('departmentModalClose');
  var modalCancel = document.getElementById('departmentModalCancel');
  var modalSave = document.getElementById('departmentModalSave');

  var nameInput = document.getElementById('departmentName');
  var iconInput = document.getElementById('departmentIcon');
  var descriptionInput = document.getElementById('departmentDescription');
  var doctorsInput = document.getElementById('departmentDoctors');
  var bedsInput = document.getElementById('departmentBeds');
  var patientsInput = document.getElementById('departmentPatients');

  var editingDepartmentId = null;
  var departments = [];

  // Fallback demo colors, cycled for any department that doesn't have one
  // (e.g. a brand-new department created without picking a color).
  var COLOR_CYCLE = ['red', 'indigo', 'teal', 'amber', 'green', 'blue', 'purple', 'pink'];

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderDepartments() {
    grid.innerHTML = '';

    if (departments.length === 0) {
      grid.innerHTML =
        '<div class="card"><div class="card-body" style="text-align:center;">' +
        '<i class="fa-solid fa-hospital" style="font-size:40px;opacity:.4;"></i>' +
        '<h3>No Departments Added</h3>' +
        '<p class="text-muted">Click "Add Department" to add one.</p>' +
        '</div></div>';
      return;
    }

    departments.forEach(function (d, index) {
      var color = d.color || COLOR_CYCLE[index % COLOR_CYCLE.length];
      var icon = d.icon || 'fa-hospital';

      var card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML =
        '<div class="stat-card-icon ' + color + '">' +
          '<i class="fa-solid ' + escapeHTML(icon) + '"></i>' +
        '</div>' +
        '<div class="stat-card-info">' +
          '<div class="stat-card-label">' + escapeHTML(d.name) + '</div>' +
          '<p style="font-size:0.8rem;color:var(--color-gray-500);margin:0.25rem 0;">' + escapeHTML(d.description || '') + '</p>' +
          '<div class="mini-stat-row" style="margin-top:0.5rem;">' +
            '<div class="mini-stat" style="padding:0.4rem;">' +
              '<div class="mini-stat-value" style="font-size:1rem;">' + (d.doctors || 0) + '</div>' +
              '<div class="mini-stat-label">Doctors</div>' +
            '</div>' +
            '<div class="mini-stat" style="padding:0.4rem;">' +
              '<div class="mini-stat-value" style="font-size:1rem;">' + (d.beds || 0) + '</div>' +
              '<div class="mini-stat-label">Beds</div>' +
            '</div>' +
            '<div class="mini-stat" style="padding:0.4rem;">' +
              '<div class="mini-stat-value" style="font-size:1rem;">' + (d.patients || 0) + '</div>' +
              '<div class="mini-stat-label">Patients</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:0.75rem;">' +
            '<button class="btn btn-sm btn-outline edit-department" data-id="' + escapeHTML(d.id) + '"><i class="fa-solid fa-pen"></i> Edit</button>' +
            '<button class="btn btn-sm btn-danger delete-department" data-id="' + escapeHTML(d.id) + '"><i class="fa-solid fa-trash"></i> Delete</button>' +
          '</div>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  async function loadDepartments() {
    try {
      departments = await CareFlowAPI.request('/departments');
      CareFlowAPI.setCached('departments', departments);
    } catch (error) {
      departments = CareFlowAPI.getCached('departments') || [];
      if (!departments.length) {
        alert(error.message || 'Unable to load departments from the server.');
      }
    }
    renderDepartments();
  }

  function openModal(department) {
    if (!modal) return;
    modal.classList.add('active');

    if (department) {
      editingDepartmentId = department.id;
      modalTitle.textContent = 'Edit Department';
      nameInput.value = department.name || '';
      iconInput.value = department.icon || '';
      descriptionInput.value = department.description || '';
      doctorsInput.value = department.doctors || 0;
      bedsInput.value = department.beds || 0;
      patientsInput.value = department.patients || 0;
      modalSave.innerHTML = '<i class="fa-solid fa-check"></i> Update Department';
    } else {
      editingDepartmentId = null;
      modalTitle.textContent = 'Add Department';
      nameInput.value = '';
      iconInput.value = '';
      descriptionInput.value = '';
      doctorsInput.value = 0;
      bedsInput.value = 0;
      patientsInput.value = 0;
      modalSave.innerHTML = '<i class="fa-solid fa-check"></i> Save Department';
    }

    setTimeout(function () { nameInput.focus(); }, 100);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('active');
    editingDepartmentId = null;
  }

  async function saveDepartment() {
    var name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    var payload = {
      name: name,
      icon: iconInput.value.trim() || null,
      description: descriptionInput.value.trim() || null,
      doctors: parseInt(doctorsInput.value) || 0,
      beds: parseInt(bedsInput.value) || 0,
      patients: parseInt(patientsInput.value) || 0
    };

    modalSave.disabled = true;
    modalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      var saved = editingDepartmentId
        ? await CareFlowAPI.request('/departments/' + encodeURIComponent(editingDepartmentId), { method: 'PUT', body: JSON.stringify(payload) })
        : await CareFlowAPI.request('/departments', { method: 'POST', body: JSON.stringify(payload) });

      var index = departments.findIndex(function (d) { return d.id === saved.id; });
      if (index === -1) departments.push(saved); else departments[index] = saved;
      CareFlowAPI.setCached('departments', departments);

      renderDepartments();
      closeModal();
    } catch (error) {
      alert(error.message || 'Department could not be saved.');
    } finally {
      modalSave.disabled = false;
      modalSave.innerHTML = '<i class="fa-solid fa-check"></i> Save Department';
    }
  }

  async function deleteDepartment(id) {
    var department = departments.find(function (d) { return d.id === id; });
    if (!department) return;
    if (!confirm('Delete ' + department.name + '?')) return;

    try {
      await CareFlowAPI.request('/departments/' + encodeURIComponent(id), { method: 'DELETE' });
      departments = departments.filter(function (d) { return d.id !== id; });
      CareFlowAPI.setCached('departments', departments);
      renderDepartments();
    } catch (error) {
      alert(error.message || 'Department could not be deleted.');
    }
  }

  if (addBtn) addBtn.addEventListener('click', function () { openModal(null); });
  if (modalSave) modalSave.addEventListener('click', saveDepartment);
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalCancel) modalCancel.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  }

  grid.addEventListener('click', function (e) {
    var editButton = e.target.closest('.edit-department');
    var deleteButton = e.target.closest('.delete-department');

    if (editButton) {
      var department = departments.find(function (d) { return d.id === editButton.dataset.id; });
      if (department) openModal(department);
    }

    if (deleteButton) {
      deleteDepartment(deleteButton.dataset.id);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) closeModal();
  });

  var exportDepartmentsBtn = document.getElementById('exportDepartmentsBtn');
  if (exportDepartmentsBtn) {
    exportDepartmentsBtn.addEventListener('click', function () {
      if (!departments.length) {
        alert('No departments to export.');
        return;
      }

      function csvValue(value) {
        var str = value === null || value === undefined ? '' : String(value);
        if (/[",\n]/.test(str)) {
          str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }

      var header = ['Name', 'Description', 'Doctors', 'Beds', 'Patients'];
      var csv = [header.map(csvValue).join(',')];

      departments.forEach(function (d) {
        csv.push([
          csvValue(d.name),
          csvValue(d.description),
          csvValue(d.doctors || 0),
          csvValue(d.beds || 0),
          csvValue(d.patients || 0)
        ].join(','));
      });

      var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'CareFlow-Departments-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  loadDepartments();

  // Keep the list live while this page stays open.
  setInterval(loadDepartments, 20000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadDepartments();
  });
  window.addEventListener('focus', loadDepartments);
});
