/* ============================================
   CAREFLOW AI - PHARMACY MODULE
   Inventory list + stock in/out/adjustment workflow.
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;

  var medicines = [];
  var activeFilter = '';
  var stockTargetId = null;

  var tableBody = document.getElementById('medicineTableBody');
  var searchInput = document.getElementById('medicineSearch');
  var addBtn = document.getElementById('addMedicineBtn');

  var medicineModal = document.getElementById('medicineModal');
  var medicineModalClose = document.getElementById('medicineModalClose');
  var medicineModalCancel = document.getElementById('medicineModalCancel');
  var medicineModalSave = document.getElementById('medicineModalSave');
  var nameInput = document.getElementById('medicineName');
  var categoryInput = document.getElementById('medicineCategory');
  var batchInput = document.getElementById('medicineBatch');
  var unitSelect = document.getElementById('medicineUnit');
  var quantityInput = document.getElementById('medicineQuantity');
  var reorderInput = document.getElementById('medicineReorderLevel');
  var priceInput = document.getElementById('medicinePrice');
  var expiryInput = document.getElementById('medicineExpiry');
  var supplierInput = document.getElementById('medicineSupplier');

  var stockModal = document.getElementById('stockModal');
  var stockModalClose = document.getElementById('stockModalClose');
  var stockModalCancel = document.getElementById('stockModalCancel');
  var stockModalSave = document.getElementById('stockModalSave');
  var stockModalTitle = document.getElementById('stockModalTitle');
  var stockTypeSelect = document.getElementById('stockType');
  var stockQuantityInput = document.getElementById('stockQuantity');
  var stockPatientGroup = document.getElementById('stockPatientGroup');
  var stockPatientSelect = document.getElementById('stockPatientSelect');
  var stockReasonInput = document.getElementById('stockReason');

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
  }

  function isLowStock(m) { return m.quantity <= m.reorderLevel; }
  function isExpiringSoon(m) {
    if (!m.expiryDate) return false;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 30);
    return new Date(m.expiryDate) <= cutoff;
  }
  function isExpired(m) {
    if (!m.expiryDate) return false;
    return new Date(m.expiryDate) < new Date();
  }

  function updateStats() {
    document.getElementById('statTotalMedicines').textContent = medicines.length;
    document.getElementById('statLowStock').textContent = medicines.filter(isLowStock).length;
    document.getElementById('statExpiring').textContent = medicines.filter(isExpiringSoon).length;
  }

  function renderMedicines() {
    updateStats();
    var query = (searchInput.value || '').toLowerCase();
    var filtered = medicines.filter(function (m) {
      if (activeFilter === 'low' && !isLowStock(m)) return false;
      if (activeFilter === 'expiring' && !isExpiringSoon(m)) return false;
      if (!query) return true;
      return (m.name || '').toLowerCase().indexOf(query) !== -1 || (m.category || '').toLowerCase().indexOf(query) !== -1;
    });

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--color-gray-500);padding:2rem;">No medicines found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(function (m) {
      var stockBadge = isLowStock(m)
        ? '<span class="badge badge-danger badge-dot">' + m.quantity + ' ' + escapeHtml(m.unit) + '(s) - Low</span>'
        : '<span class="badge badge-success badge-dot">' + m.quantity + ' ' + escapeHtml(m.unit) + '(s)</span>';

      var expiryBadge = escapeHtml(m.expiryDate || '-');
      if (isExpired(m)) expiryBadge = '<span class="badge badge-danger">' + escapeHtml(m.expiryDate) + ' - Expired</span>';
      else if (isExpiringSoon(m)) expiryBadge = '<span class="badge badge-warning">' + escapeHtml(m.expiryDate) + ' - Soon</span>';

      var actions = '';
      if (Permissions.can('pharmacy', 'edit')) {
        actions += '<button class="btn btn-sm btn-outline" data-action="stock" data-id="' + escapeHtml(m.id) + '"><i class="fa-solid fa-right-left"></i> Stock</button>';
      }
      if (Permissions.can('pharmacy', 'delete')) {
        actions += ' <button class="btn btn-sm btn-ghost text-danger" data-action="delete" data-id="' + escapeHtml(m.id) + '" title="Delete"><i class="fa-solid fa-trash"></i></button>';
      }

      return '<tr>' +
        '<td><strong>' + escapeHtml(m.name) + '</strong><div style="font-size:0.75rem;color:var(--color-gray-500);">' + escapeHtml(m.category || '') + '</div></td>' +
        '<td>' + escapeHtml(m.batchNumber || '-') + '</td>' +
        '<td>' + stockBadge + '</td>' +
        '<td>' + expiryBadge + '</td>' +
        '<td>' + (m.pricePerUnit != null ? '$' + Number(m.pricePerUnit).toFixed(2) : '-') + '</td>' +
        '<td>' + escapeHtml(m.supplier || '-') + '</td>' +
        '<td><div class="table-actions">' + actions + '</div></td>' +
        '</tr>';
    }).join('');
  }

  async function loadMedicines() {
    try {
      medicines = await CareFlowAPI.request('/pharmacy/medicines');
    } catch (error) {
      alert(error.message || 'Unable to load pharmacy inventory.');
      medicines = [];
    }
    renderMedicines();
  }

  function openMedicineModal() {
    nameInput.value = ''; categoryInput.value = ''; batchInput.value = '';
    unitSelect.value = 'tablet'; quantityInput.value = 0; reorderInput.value = 10;
    priceInput.value = 0; expiryInput.value = ''; supplierInput.value = '';
    medicineModal.classList.add('active');
    setTimeout(function () { nameInput.focus(); }, 100);
  }

  function closeMedicineModal() { medicineModal.classList.remove('active'); }

  async function saveMedicine() {
    var name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    var payload = {
      name: name,
      category: categoryInput.value.trim() || null,
      batchNumber: batchInput.value.trim() || null,
      unit: unitSelect.value,
      quantity: parseInt(quantityInput.value) || 0,
      reorderLevel: parseInt(reorderInput.value) || 0,
      pricePerUnit: parseFloat(priceInput.value) || 0,
      expiryDate: expiryInput.value || null,
      supplier: supplierInput.value.trim() || null
    };

    medicineModalSave.disabled = true;
    medicineModalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      var saved = await CareFlowAPI.request('/pharmacy/medicines', { method: 'POST', body: JSON.stringify(payload) });
      medicines.push(saved);
      renderMedicines();
      closeMedicineModal();
    } catch (error) {
      alert(error.message || 'Could not save this medicine.');
    } finally {
      medicineModalSave.disabled = false;
      medicineModalSave.innerHTML = '<i class="fa-solid fa-check"></i> Save Medicine';
    }
  }

  async function deleteMedicine(id) {
    var medicine = medicines.find(function (m) { return m.id === id; });
    if (!medicine) return;
    if (!confirm('Delete ' + medicine.name + ' (batch ' + (medicine.batchNumber || '-') + ')?')) return;

    try {
      await CareFlowAPI.request('/pharmacy/medicines/' + encodeURIComponent(id), { method: 'DELETE' });
      medicines = medicines.filter(function (m) { return m.id !== id; });
      renderMedicines();
    } catch (error) {
      alert(error.message || 'Could not delete this medicine.');
    }
  }

  function openStockModal(id) {
    var medicine = medicines.find(function (m) { return m.id === id; });
    if (!medicine) return;
    stockTargetId = id;
    stockModalTitle.textContent = 'Adjust Stock - ' + medicine.name;
    stockTypeSelect.value = 'OUT';
    stockQuantityInput.value = 1;
    stockReasonInput.value = '';

    var patients = CareFlowAPI.getCached('patients') || [];
    stockPatientSelect.innerHTML = '<option value="">-</option>' +
      patients.map(function (p) { return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>'; }).join('');

    stockModal.classList.add('active');
  }

  function closeStockModal() {
    stockTargetId = null;
    stockModal.classList.remove('active');
  }

  async function saveStockAdjustment() {
    if (!stockTargetId) return;
    var quantity = parseInt(stockQuantityInput.value);
    if (!quantity) { stockQuantityInput.focus(); return; }

    var payload = {
      type: stockTypeSelect.value,
      quantity: stockTypeSelect.value === 'ADJUSTMENT' ? quantity : Math.abs(quantity),
      reason: stockReasonInput.value.trim() || null,
      patientId: stockPatientSelect.value || null
    };

    stockModalSave.disabled = true;
    try {
      var updated = await CareFlowAPI.request('/pharmacy/medicines/' + encodeURIComponent(stockTargetId) + '/stock', { method: 'POST', body: JSON.stringify(payload) });
      var index = medicines.findIndex(function (m) { return m.id === stockTargetId; });
      if (index !== -1) medicines[index] = updated;
      renderMedicines();
      closeStockModal();
    } catch (error) {
      alert(error.message || 'Could not update stock.');
    } finally {
      stockModalSave.disabled = false;
    }
  }

  addBtn.addEventListener('click', openMedicineModal);
  medicineModalClose.addEventListener('click', closeMedicineModal);
  medicineModalCancel.addEventListener('click', closeMedicineModal);
  medicineModalSave.addEventListener('click', saveMedicine);
  medicineModal.addEventListener('click', function (e) { if (e.target === medicineModal) closeMedicineModal(); });

  stockModalClose.addEventListener('click', closeStockModal);
  stockModalCancel.addEventListener('click', closeStockModal);
  stockModalSave.addEventListener('click', saveStockAdjustment);
  stockModal.addEventListener('click', function (e) { if (e.target === stockModal) closeStockModal(); });

  searchInput.addEventListener('input', renderMedicines);

  document.querySelectorAll('.table-filter-left .tab-item').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.table-filter-left .tab-item').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeFilter = tab.dataset.filter || '';
      renderMedicines();
    });
  });

  tableBody.addEventListener('click', function (e) {
    var stockBtn = e.target.closest('button[data-action="stock"]');
    var deleteBtn = e.target.closest('button[data-action="delete"]');
    if (stockBtn) openStockModal(stockBtn.dataset.id);
    if (deleteBtn) deleteMedicine(deleteBtn.dataset.id);
  });

  Permissions.ensureLoaded().then(function () {
    if (!Permissions.can('pharmacy', 'create')) Permissions.hide(addBtn);
    loadMedicines();
  });

  setInterval(loadMedicines, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadMedicines(); });
});
