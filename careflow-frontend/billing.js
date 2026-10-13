document.addEventListener("DOMContentLoaded", function () {

    if (typeof Auth !== "undefined" && !Auth.requireAuth()) {
        return;
    }

    // =====================================================
    // ELEMENTS
    // =====================================================

    const tbody = document.getElementById("billingTableBody");

    const newInvoiceBtn = document.getElementById("newInvoiceBtn");
    const exportBtn = document.getElementById("exportBillingBtn");
    const searchInput = document.getElementById("billingSearch");
    const searchInputMobile = document.getElementById("billingSearchMobile");

    const newInvoiceModal = document.getElementById("newInvoiceModal");
    const closeInvoiceModal = document.getElementById("closeNewInvoiceModal");
    const cancelInvoiceBtn = document.getElementById("cancelNewInvoice");
    const saveInvoiceBtn = document.getElementById("saveInvoiceBtn");

    const invoicePatient = document.getElementById("invoicePatient");
    const invoiceConsultation = document.getElementById("invoiceConsultation");
    const invoiceLab = document.getElementById("invoiceLab");
    const invoiceMedicine = document.getElementById("invoiceMedicine");
    const invoiceStatus = document.getElementById("invoiceStatus");
    const invoiceDate = document.getElementById("invoiceDate");

    const invoiceItemsBody = document.getElementById("invoiceItemsBody");
    const addInvoiceItemBtn = document.getElementById("addInvoiceItemBtn");
    const invoiceDiscountType = document.getElementById("invoiceDiscountType");
    const invoiceDiscountValue = document.getElementById("invoiceDiscountValue");
    const invoiceTaxType = document.getElementById("invoiceTaxType");
    const invoiceTaxValue = document.getElementById("invoiceTaxValue");
    const invoiceSubtotalPreview = document.getElementById("invoiceSubtotalPreview");
    const invoiceDiscountPreview = document.getElementById("invoiceDiscountPreview");
    const invoiceTaxPreview = document.getElementById("invoiceTaxPreview");

    // Each row: { id, description, quantity, unitPrice }. id is only
    // used client-side to key the DOM row; the backend assigns its own
    // item ids on save (see routers/billing.py).
    let invoiceItems = [];
    let invoiceItemSeq = 0;

    const viewInvoiceModal = document.getElementById("viewInvoiceModal");
    const closeViewInvoiceModal =
        document.getElementById("closeViewInvoiceModal");
    const closeInvoiceViewBtn =
        document.getElementById("closeInvoiceViewBtn");

    const downloadInvoiceBtn =
        document.getElementById("downloadInvoiceBtn");

    const printInvoiceBtn =
        document.getElementById("printInvoiceBtn");

    const invoiceViewContent =
        document.getElementById("invoiceViewContent");

    let currentInvoice = null;

    // Set while the New Invoice modal is being reused to edit an
    // existing bill (see openEditInvoice/closeNewInvoice) - null means
    // the modal is in "create" mode.
    let editingBillId = null;

    // Set when the invoice form is opened to issue a corrected bill for a
    // voided one - sent as replacesBillId on the next save so the two
    // bills are linked both ways (see routers/billing.py).
    let reissuingBillId = null;

    // ---- Hospital details printed on the invoice letterhead -------------
    // Edit these once for your hospital (empty lines are simply left out
    // of the printed invoice). They can also be overridden without
    // touching code by saving JSON under localStorage key
    // "careflow_hospital_profile".
    const HOSPITAL_PROFILE = Object.assign({
        name: "CareFlow AI",
        tagline: "Medical & Healthcare Services",
        address: "",          // e.g. "12 Example Road, Ahmedabad, Gujarat - 380001"
        phone: "",            // e.g. "+91 79 0000 0000"
        email: "",
        gstin: "",
        registrationNo: "",
        signatory: "Authorized Signatory",
        footerNote: "Thank you for choosing us. Wishing you good health.",
        terms: []             // e.g. ["Fees once paid are non-refundable."]
    }, (function () {
        try { return JSON.parse(localStorage.getItem("careflow_hospital_profile")) || {}; }
        catch (error) { return {}; }
    }()));

    // The browser has its own built-in global named "Permissions" (the
    // Permissions API) which has no .can() - so never call Permissions.can
    // directly; go through this guard.
    function can(action) {
        return typeof Permissions !== "undefined" &&
            typeof Permissions.can === "function" &&
            Permissions.can("billing", action);
    }


    // =====================================================
    // CURRENCY
    // =====================================================

    function money(value) {

        const amount = Number(value) || 0;

        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 2
        }).format(amount);

    }


    // =====================================================
    // HTML ESCAPE
    // =====================================================

    function escapeHTML(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    // =====================================================
    // BILLING DATA (from the real backend/database)
    // =====================================================

    let billingCache = [];

    function getBillingData() {
        return billingCache;
    }

    // The patient picker and invoice header read patients from the shared
    // cache, which is only filled at login. Refresh it alongside billing so
    // patients registered since then (e.g. by reception) are selectable.
    async function refreshPatients() {

        try {
            if (typeof CareFlowAPI.getPatients === "function") await CareFlowAPI.getPatients();
        } catch (error) {
            // best effort - fall back to whatever is cached
        }

    }

    async function loadBillingData() {

        const patientsRefresh = refreshPatients();

        try {

            billingCache = await CareFlowAPI.request('/billing');
            CareFlowAPI.setCached('billing', billingCache);

        } catch (error) {

            billingCache = CareFlowAPI.getCached('billing') || [];

            if (!billingCache.length) {
                alert(error.message || 'Unable to load billing data from the server.');
            }

        }

        await patientsRefresh;

        renderBilling();
        updateStats();

    }


    // =====================================================
    // PATIENT DATA
    // Reads through the shared mock-data.js getter, which is
    // backed by the CareFlowAPI cache (real database data).
    // =====================================================

    function getPatientsData() {

        if (typeof getPatients === "function") {
            return getPatients();
        }

        return [];

    }


    // =====================================================
    // LOAD PATIENTS
    // =====================================================

    function loadPatients() {

        if (!invoicePatient) return;

        invoicePatient.innerHTML =
            `<option value="">Select patient...</option>`;

        const patients = getPatientsData();

        patients.forEach(function (patient) {

            const option =
                document.createElement("option");

            option.value = patient.id;

            option.textContent =
                patient.name +
                (patient.mrn
                    ? ` (${patient.mrn})`
                    : "");

            invoicePatient.appendChild(option);

        });

    }


    // =====================================================
    // RESET FORM
    // =====================================================

    function resetInvoiceForm() {

        if (invoicePatient) {
            invoicePatient.value = "";
        }

        if (invoiceConsultation) {
            invoiceConsultation.value = "0";
        }

        if (invoiceLab) {
            invoiceLab.value = "0";
        }

        if (invoiceMedicine) {
            invoiceMedicine.value = "0";
        }

        if (invoiceStatus) {
            invoiceStatus.value = "Pending";
        }

        if (invoiceDate) {

            const today =
                new Date().toISOString().split("T")[0];

            invoiceDate.value = today;

        }

        invoiceItems = [{ id: "new-" + (++invoiceItemSeq), description: "", quantity: 1, unitPrice: 0 }];
        if (invoiceDiscountType) invoiceDiscountType.value = "";
        if (invoiceDiscountValue) invoiceDiscountValue.value = "0";
        if (invoiceTaxType) invoiceTaxType.value = "";
        if (invoiceTaxValue) invoiceTaxValue.value = "0";

        renderInvoiceItems();
        updateInvoiceTotal();

    }


    // =====================================================
    // LINE ITEMS (add / edit / remove)
    // =====================================================

    function renderInvoiceItems() {

        if (!invoiceItemsBody) return;

        invoiceItemsBody.innerHTML = invoiceItems.length ? invoiceItems.map(function (item) {
            return (
                '<tr data-item-id="' + escapeHTML(item.id) + '">' +
                '<td class="item-desc" data-label="Description"><input type="text" class="invoice-item-desc" placeholder="e.g. Consultation, X-Ray, Paracetamol 500mg" value="' + escapeHTML(item.description) + '" aria-label="Item description"></td>' +
                '<td class="item-qty" data-label="Qty"><input type="number" class="invoice-item-qty" min="0.01" step="0.01" inputmode="decimal" value="' + item.quantity + '" aria-label="Quantity"></td>' +
                '<td class="item-price" data-label="Unit price"><input type="number" class="invoice-item-price" min="0" step="0.01" inputmode="decimal" value="' + item.unitPrice + '" aria-label="Unit price"></td>' +
                '<td class="item-amount" data-label="Amount">' + money((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)) + '</td>' +
                '<td class="item-remove"><button type="button" class="btn btn-sm btn-ghost text-danger remove-invoice-item" title="Remove item" aria-label="Remove item"><i class="fa-solid fa-trash"></i></button></td>' +
                '</tr>'
            );
        }).join("") : '<tr><td colspan="5" class="text-muted" style="text-align:center; padding: 14px;">No items yet - click "Add Item" below.</td></tr>';

    }

    function syncInvoiceItemsFromInputs() {

        if (!invoiceItemsBody) return;

        const rows = invoiceItemsBody.querySelectorAll("tr[data-item-id]");
        rows.forEach(function (row) {
            const id = row.dataset.itemId;
            const item = invoiceItems.find(function (it) { return it.id === id; });
            if (!item) return;
            item.description = row.querySelector(".invoice-item-desc")?.value || "";
            item.quantity = Number(row.querySelector(".invoice-item-qty")?.value) || 0;
            item.unitPrice = Number(row.querySelector(".invoice-item-price")?.value) || 0;
        });

    }

    if (addInvoiceItemBtn) {
        addInvoiceItemBtn.addEventListener("click", function () {
            syncInvoiceItemsFromInputs();
            invoiceItems.push({ id: "new-" + (++invoiceItemSeq), description: "", quantity: 1, unitPrice: 0 });
            renderInvoiceItems();
        });
    }

    if (invoiceItemsBody) {
        invoiceItemsBody.addEventListener("click", function (e) {
            const removeBtn = e.target.closest(".remove-invoice-item");
            if (!removeBtn) return;
            syncInvoiceItemsFromInputs();
            const row = removeBtn.closest("tr[data-item-id]");
            const id = row?.dataset.itemId;
            invoiceItems = invoiceItems.filter(function (it) { return it.id !== id; });
            renderInvoiceItems();
            updateInvoiceTotal();
        });
        invoiceItemsBody.addEventListener("input", function (e) {
            if (!e.target.matches(".invoice-item-desc, .invoice-item-qty, .invoice-item-price")) return;
            syncInvoiceItemsFromInputs();
            const row = e.target.closest("tr[data-item-id]");
            const item = invoiceItems.find(function (it) { return it.id === row?.dataset.itemId; });
            if (item && row) {
                row.querySelector(".item-amount").textContent = money((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));
            }
            updateInvoiceTotal();
        });
    }


    // =====================================================
    // TOTAL CALCULATION (mirrors the backend's
    // _compute_totals() in routers/billing.py exactly - this
    // is a PREVIEW only, the server always recalculates and
    // is the authoritative source of truth on save)
    // =====================================================

    function computeInvoiceTotals() {

        syncInvoiceItemsFromInputs();

        const subtotal = invoiceItems.reduce(function (sum, it) {
            return sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
        }, 0);

        const discountType = invoiceDiscountType?.value || "";
        const discountValue = Number(invoiceDiscountValue?.value) || 0;
        let discountAmount = 0;
        if (discountType === "percentage") discountAmount = subtotal * (discountValue / 100);
        else if (discountType === "amount") discountAmount = discountValue;
        discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

        const taxableBase = subtotal - discountAmount;
        const taxType = invoiceTaxType?.value || "";
        const taxValue = Number(invoiceTaxValue?.value) || 0;
        let taxAmount = 0;
        if (taxType === "percentage") taxAmount = taxableBase * (taxValue / 100);
        else if (taxType === "amount") taxAmount = taxValue;
        taxAmount = Math.max(0, taxAmount);

        const total = taxableBase + taxAmount;

        return { subtotal: subtotal, discountAmount: discountAmount, taxAmount: taxAmount, total: total };

    }

    function updateInvoiceTotal() {

        const totals = computeInvoiceTotals();

        if (invoiceSubtotalPreview) invoiceSubtotalPreview.textContent = money(totals.subtotal);
        if (invoiceDiscountPreview) invoiceDiscountPreview.textContent = "-" + money(totals.discountAmount);
        if (invoiceTaxPreview) invoiceTaxPreview.textContent = "+" + money(totals.taxAmount);

        const totalElement = document.getElementById("invoiceTotalPreview");
        if (totalElement) totalElement.textContent = money(totals.total);

    }


    // =====================================================
    // OPEN NEW INVOICE
    // =====================================================

    function openNewInvoice() {

        editingBillId = null;
        reissuingBillId = null;

        loadPatients();

        resetInvoiceForm();

        setInvoiceModalMode(false);

        if (newInvoiceModal) {
            newInvoiceModal.classList.add("active");
        }

    }


    // =====================================================
    // OPEN EDIT INVOICE
    // =====================================================
    // Reuses the exact same modal/form as New Invoice, per the existing
    // UI - only the button label/title and the save handler's target
    // endpoint (PUT vs POST) differ.

    function openEditInvoice(bill) {

        if (!can("edit")) {
            alert("You do not have permission to edit invoices.");
            return;
        }

        if (bill.status === "Paid" || bill.status === "Void") {
            alert(
                "This bill is " + bill.status.toLowerCase() + " and can no longer be edited directly.\n\n" +
                "Void it (with a reason) and issue a corrected replacement bill instead."
            );
            return;
        }

        editingBillId = bill.id;

        loadPatients();

        if (invoicePatient) invoicePatient.value = bill.patientId || "";
        if (invoiceConsultation) invoiceConsultation.value = bill.consultation || 0;
        if (invoiceLab) invoiceLab.value = bill.lab || 0;
        if (invoiceMedicine) invoiceMedicine.value = bill.medicine || 0;
        if (invoiceStatus) invoiceStatus.value = bill.status || "Pending";
        if (invoiceDate) invoiceDate.value = bill.date || "";

        if (Array.isArray(bill.items) && bill.items.length) {
            invoiceItems = bill.items.map(function (it) {
                return { id: "existing-" + (++invoiceItemSeq), description: it.description, quantity: it.quantity, unitPrice: it.unitPrice };
            });
        } else {
            // Legacy bill with no line items - give it one editable row
            // seeded from the flat total so it isn't just an empty table.
            invoiceItems = [{
                id: "new-" + (++invoiceItemSeq),
                description: "Consultation / Lab / Medicine charges",
                quantity: 1,
                unitPrice: (bill.consultation || 0) + (bill.lab || 0) + (bill.medicine || 0),
            }];
        }
        renderInvoiceItems();

        if (invoiceDiscountType) invoiceDiscountType.value = bill.discountType || "";
        if (invoiceDiscountValue) invoiceDiscountValue.value = bill.discountValue || 0;
        if (invoiceTaxType) invoiceTaxType.value = bill.taxType || "";
        if (invoiceTaxValue) invoiceTaxValue.value = bill.taxValue || 0;

        updateInvoiceTotal();
        setInvoiceModalMode(true);

        if (newInvoiceModal) {
            newInvoiceModal.classList.add("active");
        }

    }


    function setInvoiceModalMode(isEdit) {

        const titleEl = document.getElementById("newInvoiceModalTitle");
        const saveLabelEl = document.getElementById("saveInvoiceBtnLabel");

        if (titleEl) titleEl.textContent = isEdit ? "Edit Invoice" : "Create New Invoice";
        if (saveLabelEl) saveLabelEl.textContent = isEdit ? "Save Changes" : "Create Invoice";

        // Payment status IS supported by the backend (BillingUpdate.status)
        // and is editable here, but only for roles allowed to edit billing
        // records. Everyone else sees the value read-only.
        if (invoiceStatus) {

            const mayChangeStatus = can(isEdit ? "edit" : "create");

            invoiceStatus.disabled = !mayChangeStatus;
            invoiceStatus.title = mayChangeStatus
                ? ""
                : "Your role cannot change the payment status.";

        }

    }


    // =====================================================
    // CLOSE NEW INVOICE
    // =====================================================

    function closeNewInvoice() {

        editingBillId = null;
        reissuingBillId = null;

        if (newInvoiceModal) {
            newInvoiceModal.classList.remove("active");
        }

    }


    if (newInvoiceBtn) {

        newInvoiceBtn.addEventListener(
            "click",
            openNewInvoice
        );

    }


    if (closeInvoiceModal) {

        closeInvoiceModal.addEventListener(
            "click",
            closeNewInvoice
        );

    }


    if (cancelInvoiceBtn) {

        cancelInvoiceBtn.addEventListener(
            "click",
            closeNewInvoice
        );

    }


    // =====================================================
    // AUTO TOTAL
    // =====================================================

    [
        invoiceConsultation,
        invoiceLab,
        invoiceMedicine,
        invoiceDiscountType,
        invoiceDiscountValue,
        invoiceTaxType,
        invoiceTaxValue
    ].forEach(function (input) {

        if (input) {

            input.addEventListener(
                "input",
                updateInvoiceTotal
            );

        }

    });


    // =====================================================
    // CREATE INVOICE
    // =====================================================

    // =====================================================
    // SAVE INVOICE - CREATE (POST) vs EDIT (PUT /billing/{id})
    // =====================================================
    // Backend contract (careflow-backend/app/schemas.py /
    // routers/billing.py):
    //   BillingCreate/BillingUpdate = patientId, patientName, items
    //   ([{description, quantity, unitPrice}]), discountType
    //   ("percentage"|"amount"|null), discountValue, taxType, taxValue,
    //   status, date. subtotal/discountAmount/taxAmount/total are NEVER
    //   sent - the server always computes them from items+discount+tax
    //   (see _compute_totals in routers/billing.py) and that's the only
    //   value ever stored, regardless of what a client sends.
    //   status is Literal["Pending", "Paid"] here - "Void" is a separate,
    //   one-way action via POST /billing/{id}/void, not settable here.
    // Billing has its own dedicated router now (not the generic
    // crud_factory), still POST "" / PUT "/{id}" for create/edit.
    // Audit rows are written server-side for create/update/void/delete.

    const BILLING_STATUSES = ["Pending", "Paid"];

    // The disabled attribute alone is not enough to stop a double submit:
    // a second click can be queued before the first await yields. This
    // flag is the real duplicate-submission guard.
    let invoiceSaveInFlight = false;

    function setInvoiceSaveBusy(busy) {

        const labelEl = document.getElementById("saveInvoiceBtnLabel");

        if (saveInvoiceBtn) saveInvoiceBtn.disabled = busy;
        if (cancelInvoiceBtn) cancelInvoiceBtn.disabled = busy;
        if (closeInvoiceModal) closeInvoiceModal.disabled = busy;

        if (!labelEl) return;

        if (busy) {
            labelEl.dataset.idleLabel = labelEl.textContent;
            labelEl.textContent = "Saving...";
        } else if (labelEl.dataset.idleLabel) {
            labelEl.textContent = labelEl.dataset.idleLabel;
            delete labelEl.dataset.idleLabel;
        }

    }


    async function submitInvoice() {

        if (invoiceSaveInFlight) return;

        const isEdit = Boolean(editingBillId);

        // Client-side RBAC mirrors the backend policy (billing.create /
        // billing.edit). The server is still the final authority - this
        // only avoids sending a request that is certain to 403.
        if (!can(isEdit ? "edit" : "create")) {

            alert(
                isEdit
                    ? "You do not have permission to edit invoices."
                    : "You do not have permission to create invoices."
            );

            return;

        }

        const patientId = invoicePatient?.value || "";
        const consultation = Number(invoiceConsultation?.value) || 0;
        const lab = Number(invoiceLab?.value) || 0;
        const medicine = Number(invoiceMedicine?.value) || 0;
        const date = invoiceDate?.value || "";

        let status = invoiceStatus?.value || "Pending";

        if (BILLING_STATUSES.indexOf(status) === -1) {
            status = "Pending";
        }

        if (!patientId || !date) {
            alert("Please select a patient and invoice date.");
            return;
        }

        syncInvoiceItemsFromInputs();

        const cleanItems = invoiceItems
            .map(function (it) { return { description: (it.description || "").trim(), quantity: Number(it.quantity) || 0, unitPrice: Number(it.unitPrice) || 0 }; })
            .filter(function (it) { return it.description && it.quantity > 0; });

        if (!cleanItems.length) {
            alert("Add at least one bill item with a description and quantity.");
            return;
        }
        if (cleanItems.some(function (it) { return it.unitPrice < 0; })) {
            alert("Unit prices cannot be negative.");
            return;
        }

        const discountType = invoiceDiscountType?.value || null;
        const discountValue = Number(invoiceDiscountValue?.value) || 0;
        const taxType = invoiceTaxType?.value || null;
        const taxValue = Number(invoiceTaxValue?.value) || 0;

        if (discountType === "percentage" && discountValue > 100) {
            alert("Discount percentage cannot exceed 100%.");
            return;
        }
        if (taxType === "percentage" && taxValue > 100) {
            alert("Tax percentage cannot exceed 100%.");
            return;
        }
        if (discountValue < 0 || taxValue < 0) {
            alert("Discount/tax values cannot be negative.");
            return;
        }

        const patients = getPatientsData();

        const patient = patients.find(function (p) {
            return String(p.id) === String(patientId);
        });

        if (!patient) {
            alert("Selected patient not found.");
            return;
        }

        // The preview total is shown to the user for confirmation only -
        // the server (routers/billing.py _compute_totals) recalculates
        // subtotal/discount/tax/total from the items and discount/tax
        // inputs itself and is the only value ever actually stored.
        const payload = {
            patientId: patient.id,
            patientName: patient.name,
            consultation: 0,
            lab: 0,
            medicine: 0,
            items: cleanItems,
            discountType: discountType,
            discountValue: discountValue,
            taxType: taxType,
            taxValue: taxValue,
            status: status,
            date: date
        };

        if (!isEdit && reissuingBillId) {
            payload.replacesBillId = reissuingBillId;
        }

        invoiceSaveInFlight = true;
        setInvoiceSaveBusy(true);

        try {

            // Editing always targets the existing id with PUT, so an edit
            // can never fall through to POST and duplicate the invoice.
            let saved;

            if (isEdit) {

                saved = await CareFlowAPI.request(
                    "/billing/" + encodeURIComponent(editingBillId),
                    { method: "PUT", body: JSON.stringify(payload) }
                );

            } else {

                saved = await CareFlowAPI.request(
                    "/billing",
                    { method: "POST", body: JSON.stringify(payload) }
                );

            }

            closeNewInvoice();

            // Re-read the list from the server rather than patching the
            // local cache, so the table always reflects what was actually
            // persisted (including server-recalculated totals).
            await loadBillingData();

            const savedId = saved && saved.id;

            showToast(
                isEdit
                    ? "Invoice " + (savedId || "") + " updated."
                    : payload.replacesBillId
                        ? "Corrected invoice " + (savedId || "") + " issued."
                        : "Invoice " + (savedId || "") + " created."
            );

            // Show the finished bill straight away so it can be printed.
            if (savedId) viewInvoice(savedId);

        } catch (error) {

            // describeError maps 400/401/403/404/409/422/429/500 and
            // network/backend-unavailable failures onto readable text,
            // preferring the backend "detail" message when present.
            const message =
                (typeof CareFlowAPI !== "undefined" && CareFlowAPI.describeError)
                    ? CareFlowAPI.describeError(
                        error,
                        isEdit ? "update this invoice" : "create this invoice"
                    )
                    : (error.message || "Invoice could not be saved.");

            // 404 means the invoice disappeared underneath us - resync so
            // the user is not editing a row that no longer exists.
            if (error && error.careFlowStatus === 404 && isEdit) {
                await loadBillingData();
            }

            alert(message);

        } finally {

            invoiceSaveInFlight = false;
            setInvoiceSaveBusy(false);

        }

    }


    if (saveInvoiceBtn) {

        saveInvoiceBtn.addEventListener("click", submitInvoice);

    }


    // =====================================================
    // FIND BILL
    // =====================================================

    function findBill(id) {

        const bills =
            getBillingData();

        return bills.find(function (bill) {

            return String(bill.id) ===
                String(id);

        });

    }


    // =====================================================
    // TOAST
    // =====================================================

    let toastTimer = null;

    function showToast(message, isError) {

        let el = document.getElementById("billingToast");

        if (!el) {
            el = document.createElement("div");
            el.id = "billingToast";
            el.className = "billing-toast";
            el.setAttribute("role", "status");
            document.body.appendChild(el);
        }

        el.textContent = message;
        el.classList.toggle("error", Boolean(isError));

        // force reflow so the transition replays for back-to-back toasts
        void el.offsetWidth;
        el.classList.add("show");

        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3500);

    }


    // =====================================================
    // INVOICE HELPERS
    // =====================================================

    function fmtDate(value) {

        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));

        if (!match) return String(value || "");

        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

        return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    }

    const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    function belowThousand(n) {

        let text = "";

        if (n >= 100) {
            text += ONES[Math.floor(n / 100)] + " Hundred";
            n = n % 100;
            if (n) text += " ";
        }

        if (n >= 20) {
            text += TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
        } else if (n > 0) {
            text += ONES[n];
        }

        return text;

    }

    // Indian numbering: thousand, lakh, crore.
    function numberToWordsIN(num) {

        num = Math.floor(Number(num) || 0);

        if (num === 0) return "Zero";

        const parts = [];

        const crore = Math.floor(num / 10000000);
        num = num % 10000000;
        const lakh = Math.floor(num / 100000);
        num = num % 100000;
        const thousand = Math.floor(num / 1000);
        num = num % 1000;

        if (crore) parts.push(numberToWordsIN(crore) + " Crore");
        if (lakh) parts.push(belowThousand(lakh) + " Lakh");
        if (thousand) parts.push(belowThousand(thousand) + " Thousand");
        if (num) parts.push(belowThousand(num));

        return parts.join(" ");

    }

    function amountInWords(amount) {

        const paiseTotal = Math.round((Number(amount) || 0) * 100);
        const rupees = Math.floor(paiseTotal / 100);
        const paise = paiseTotal % 100;

        return "Rupees " + numberToWordsIN(rupees) +
            (paise ? " and " + numberToWordsIN(paise) + " Paise" : "") +
            " Only";

    }

    function statusKey(bill) {

        const status = String(bill.status || "Pending").toLowerCase();

        return status === "paid" ? "paid"
            : status === "void" ? "void"
                : status === "overdue" ? "overdue"
                    : "pending";

    }

    function findPatientFor(bill) {

        return getPatientsData().find(function (p) {
            return String(p.id) === String(bill.patientId);
        }) || null;

    }

    function invoiceRows(bill) {

        if (Array.isArray(bill.items) && bill.items.length) {
            return bill.items.map(function (it) {
                const qty = Number(it.quantity) || 0;
                const rate = Number(it.unitPrice) || 0;
                return {
                    description: it.description,
                    quantity: qty,
                    unitPrice: rate,
                    amount: it.amount != null ? Number(it.amount) : qty * rate
                };
            });
        }

        // Bills created before itemized billing existed
        return [
            ["Consultation charges", bill.consultation],
            ["Laboratory charges", bill.lab],
            ["Medicine charges", bill.medicine]
        ].filter(function (row) { return Number(row[1]) > 0; }).map(function (row) {
            return { description: row[0], quantity: 1, unitPrice: Number(row[1]), amount: Number(row[1]) };
        });

    }

    function plainMoney(value) {
        return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
    }


    // =====================================================
    // INVOICE DOCUMENT (one layout used by the on-screen
    // preview, Print and Download - what you see is what
    // gets printed)
    // =====================================================

    const INVOICE_CSS = `
.inv{box-sizing:border-box;position:relative;max-width:794px;margin:0 auto;background:#fff;color:#111827;font-family:"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.45;padding:34px 40px 26px;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;text-align:left}
.inv *{box-sizing:border-box}
.inv-head{display:flex;justify-content:space-between;gap:24px;padding-bottom:16px;border-bottom:3px solid #1e3a8a}
.inv-brand{display:flex;gap:14px;align-items:flex-start;min-width:0}
.inv-logo{flex:0 0 54px;width:54px;height:54px;border-radius:12px;background:#1e3a8a;display:flex;align-items:center;justify-content:center}
.inv-brand h1{margin:0;font-size:22px;line-height:1.2;color:#1e3a8a;font-weight:800}
.inv-tagline{margin:2px 0 0;color:#475569;font-size:12.5px}
.inv-contact{margin:7px 0 0;color:#475569;font-size:12px;line-height:1.6}
.inv-title{text-align:right;flex:0 0 auto}
.inv-title h2{margin:0;font-size:30px;letter-spacing:4px;color:#1e3a8a;font-weight:800;line-height:1.1}
.inv-meta{margin-top:10px;font-size:13px;color:#334155}
.inv-meta div{display:flex;justify-content:flex-end;gap:10px;margin-top:2px}
.inv-meta span{color:#64748b}
.inv-meta strong{min-width:84px;text-align:right}
.inv-notice{margin:16px 0 0;padding:9px 12px;border-radius:8px;font-size:12.5px;background:#fef2f2;border:1px solid #fecaca;color:#7f1d1d}
.inv-notice.info{background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a}
.inv-parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
.inv-box{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#f8fafc;min-width:0}
.inv-label{font-size:10.5px;font-weight:700;letter-spacing:1.2px;color:#64748b;text-transform:uppercase;margin-bottom:6px}
.inv-box h3{margin:0 0 4px;font-size:17px;color:#0f172a;overflow-wrap:anywhere}
.inv-kv{display:flex;gap:8px;font-size:13px;color:#334155;margin-top:3px}
.inv-kv span{color:#64748b;flex:0 0 92px}
.inv-kv b{font-weight:600;min-width:0;overflow-wrap:anywhere}
.inv-table{width:100%;border-collapse:collapse}
.inv-table th{background:#1e3a8a;color:#fff;font-size:11.5px;letter-spacing:.6px;text-transform:uppercase;text-align:left;padding:9px 10px;font-weight:700}
.inv-table td{padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:13.5px;overflow-wrap:anywhere}
.inv-table .c{text-align:center;white-space:nowrap}
.inv-table .r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.inv-table tbody tr:nth-child(even) td{background:#f8fafc}
.inv-table .empty{text-align:center;color:#64748b;padding:22px}
.inv-bottom{display:grid;grid-template-columns:1.15fr 1fr;gap:26px;margin-top:16px;align-items:start}
.inv-words{font-size:12.5px;color:#334155}
.inv-words b{display:block;margin-top:2px;font-size:13.5px;color:#0f172a}
.inv-paystate{margin-top:14px}
.inv-terms{margin:14px 0 0;padding-left:18px;font-size:11.5px;color:#64748b}
.inv-totals{width:100%;border-collapse:collapse}
.inv-totals td{padding:6px 0;font-size:13.5px;color:#334155}
.inv-totals td:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:#0f172a}
.inv-totals tr.grand td{border-top:2px solid #1e3a8a;padding-top:10px;font-size:17px;font-weight:800;color:#1e3a8a}
.inv-stamp{display:inline-block;border:3px solid;border-radius:8px;padding:2px 16px;font-weight:800;letter-spacing:3px;font-size:20px;transform:rotate(-7deg);opacity:.88}
.inv-stamp.paid{color:#15803d;border-color:#15803d}
.inv-stamp.pending{color:#b45309;border-color:#b45309;font-size:12.5px;letter-spacing:1.5px;transform:none;padding:3px 12px}
.inv-stamp.overdue{color:#b91c1c;border-color:#b91c1c;font-size:14px;letter-spacing:2px;transform:none}
.inv-stamp.void{color:#b91c1c;border-color:#b91c1c}
.inv-watermark{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);font-size:130px;font-weight:900;letter-spacing:14px;color:rgba(185,28,28,.09);pointer-events:none;white-space:nowrap}
.inv-sign{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-top:40px}
.inv-sign .for{font-size:12.5px;color:#334155}
.inv-sign .line{border-top:1px solid #64748b;min-width:210px;padding-top:6px;text-align:center;font-size:12px;color:#334155}
.inv-foot{margin-top:20px;padding-top:12px;border-top:1px dashed #cbd5e1;text-align:center;font-size:11.5px;color:#64748b;line-height:1.7}
@media (max-width:640px){
.inv{padding:18px 14px 16px}
.inv-head{flex-direction:column;gap:14px}
.inv-title{text-align:left}
.inv-title h2{font-size:24px}
.inv-meta div{justify-content:flex-start}
.inv-meta strong{text-align:left;min-width:0}
.inv-parties{grid-template-columns:1fr;gap:12px}
.inv-bottom{grid-template-columns:1fr;gap:14px}
.inv-table th,.inv-table td{padding:8px 6px;font-size:12.5px}
.inv-table .hide-sm{display:none}
.inv-watermark{font-size:70px;letter-spacing:6px}
.inv-sign{flex-direction:column;align-items:stretch;gap:26px}
.inv-sign .line{min-width:0;width:100%}
}
@media print{
.inv,.inv *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.inv{border:0;box-shadow:none;border-radius:0;max-width:none;padding:0}
.inv-table tr,.inv-bottom,.inv-sign,.inv-parties{page-break-inside:avoid;break-inside:avoid}
}
`;

    function invoiceHtml(bill) {

        const profile = HOSPITAL_PROFILE;
        const patient = findPatientFor(bill) || {};
        const key = statusKey(bill);
        const rows = invoiceRows(bill);

        const subtotal = Number(bill.subtotal) || rows.reduce(function (sum, r) { return sum + r.amount; }, 0);
        const discountAmount = Number(bill.discountAmount) || 0;
        const taxAmount = Number(bill.taxAmount) || 0;
        const total = Number(bill.total) || 0;

        const discountLabel = "Discount" + (bill.discountType === "percentage" ? " (" + Number(bill.discountValue) + "%)" : "");
        const taxLabel = "Tax / GST" + (bill.taxType === "percentage" ? " (" + Number(bill.taxValue) + "%)" : "");

        const contact = [
            profile.address,
            [profile.phone ? "Phone: " + profile.phone : "", profile.email ? "Email: " + profile.email : ""].filter(Boolean).join("  |  "),
            [profile.gstin ? "GSTIN: " + profile.gstin : "", profile.registrationNo ? "Reg. No: " + profile.registrationNo : ""].filter(Boolean).join("  |  ")
        ].filter(Boolean).map(escapeHTML).join("<br>");

        const kv = function (label, value) {
            return value ? '<div class="inv-kv"><span>' + label + '</span><b>' + escapeHTML(value) + '</b></div>' : "";
        };

        const ageSex = [patient.age != null && patient.age !== "" ? patient.age + " yrs" : "", patient.gender || ""].filter(Boolean).join(" / ");

        let notice = "";
        if (key === "void") {
            notice = '<div class="inv-notice"><strong>This invoice has been cancelled (VOID) and is not valid for payment.</strong>' +
                (bill.voidReason ? '<br>Reason: ' + escapeHTML(bill.voidReason) : "") +
                (bill.replacedByBillId ? '<br>Replaced by invoice <strong>' + escapeHTML(bill.replacedByBillId) + '</strong>.' : "") + '</div>';
        } else if (bill.replacesBillId) {
            notice = '<div class="inv-notice info">This is a corrected invoice. It replaces invoice <strong>' + escapeHTML(bill.replacesBillId) + '</strong>.</div>';
        }

        const stampText = key === "paid" ? "PAID" : key === "void" ? "VOID" : key === "overdue" ? "PAYMENT OVERDUE" : "PAYMENT PENDING";

        const bodyRows = rows.length
            ? rows.map(function (r, i) {
                return '<tr><td class="c hide-sm">' + (i + 1) + '</td>' +
                    '<td>' + escapeHTML(r.description) + '</td>' +
                    '<td class="c">' + escapeHTML(String(r.quantity)) + '</td>' +
                    '<td class="r">' + plainMoney(r.unitPrice) + '</td>' +
                    '<td class="r">' + plainMoney(r.amount) + '</td></tr>';
            }).join("")
            : '<tr><td class="empty" colspan="5">No line items</td></tr>';

        return '<div class="inv">' +
            (key === "void" ? '<div class="inv-watermark">VOID</div>' : "") +

            '<div class="inv-head">' +
                '<div class="inv-brand">' +
                    '<div class="inv-logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 0 1 7.5-6.6 5 5 0 0 1 7.5 6.6z"/><path d="M3.5 12h4l1.6-3 3 6 1.6-3h4.3"/></svg></div>' +
                    '<div><h1>' + escapeHTML(profile.name) + '</h1>' +
                    (profile.tagline ? '<p class="inv-tagline">' + escapeHTML(profile.tagline) + '</p>' : "") +
                    (contact ? '<p class="inv-contact">' + contact + '</p>' : "") + '</div>' +
                '</div>' +
                '<div class="inv-title"><h2>INVOICE</h2>' +
                    '<div class="inv-meta">' +
                        '<div><span>Invoice No.</span><strong>' + escapeHTML(bill.invoiceNumber || bill.id) + '</strong></div>' +
                        '<div><span>Date</span><strong>' + escapeHTML(fmtDate(bill.date)) + '</strong></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            notice +

            '<div class="inv-parties">' +
                '<div class="inv-box"><div class="inv-label">Billed To</div>' +
                    '<h3>' + escapeHTML(bill.patientName) + '</h3>' +
                    kv("Patient ID", patient.mrn || bill.mrn || "") +
                    kv("Age / Sex", ageSex) +
                '</div>' +
                '<div class="inv-box"><div class="inv-label">Visit Details</div>' +
                    kv("Consulting Dr.", patient.doctor || "") +
                    kv("Invoice Date", fmtDate(bill.date)) +
                    kv("Payment Status", key === "paid" ? "Paid" : key === "void" ? "Void" : key === "overdue" ? "Overdue" : "Pending") +
                '</div>' +
            '</div>' +

            '<table class="inv-table"><thead><tr>' +
                '<th class="c hide-sm" style="width:44px;">#</th><th>Description</th>' +
                '<th class="c" style="width:64px;">Qty</th><th class="r" style="width:110px;">Rate (&#8377;)</th><th class="r" style="width:120px;">Amount (&#8377;)</th>' +
            '</tr></thead><tbody>' + bodyRows + '</tbody></table>' +

            '<div class="inv-bottom">' +
                '<div>' +
                    '<div class="inv-words">Amount in words<b>' + escapeHTML(amountInWords(total)) + '</b></div>' +
                    '<div class="inv-paystate"><span class="inv-stamp ' + key + '">' + stampText + '</span></div>' +
                    (Array.isArray(profile.terms) && profile.terms.length
                        ? '<ul class="inv-terms">' + profile.terms.map(function (t) { return '<li>' + escapeHTML(t) + '</li>'; }).join("") + '</ul>'
                        : "") +
                '</div>' +
                '<table class="inv-totals"><tbody>' +
                    '<tr><td>Subtotal</td><td>&#8377; ' + plainMoney(subtotal) + '</td></tr>' +
                    (discountAmount > 0 ? '<tr><td>' + escapeHTML(discountLabel) + '</td><td>- &#8377; ' + plainMoney(discountAmount) + '</td></tr>' : "") +
                    (taxAmount > 0 ? '<tr><td>' + escapeHTML(taxLabel) + '</td><td>+ &#8377; ' + plainMoney(taxAmount) + '</td></tr>' : "") +
                    '<tr class="grand"><td>Grand Total</td><td>&#8377; ' + plainMoney(total) + '</td></tr>' +
                '</tbody></table>' +
            '</div>' +

            '<div class="inv-sign">' +
                '<div class="for">Patient / Attendant: ______________________</div>' +
                '<div><div class="for" style="text-align:center;margin-bottom:34px;">For <strong>' + escapeHTML(profile.name) + '</strong></div>' +
                '<div class="line">' + escapeHTML(profile.signatory) + '</div></div>' +
            '</div>' +

            '<div class="inv-foot">' +
                (profile.footerNote ? escapeHTML(profile.footerNote) + '<br>' : "") +
                'This is a computer-generated invoice.' +
            '</div>' +
        '</div>';

    }

    // Complete standalone HTML document (used by Print and Download).
    function invoiceDocument(bill, withToolbar) {

        const number = bill.invoiceNumber || bill.id;
        const title = "Invoice " + number + " - " + (bill.patientName || "");

        return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1">' +
            '<title>' + escapeHTML(title) + '</title>' +
            '<style>@page{size:A4;margin:10mm}html,body{margin:0;padding:0}' +
            'body{background:#f3f4f6;padding:20px 12px;font-family:"Segoe UI",Roboto,Arial,sans-serif}' +
            '.toolbar{max-width:794px;margin:0 auto 14px;display:flex;justify-content:flex-end}' +
            '.toolbar button{background:#1e3a8a;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}' +
            '@media print{body{background:#fff;padding:0}.toolbar{display:none}}' +
            INVOICE_CSS + '</style></head><body>' +
            (withToolbar ? '<div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>' : "") +
            invoiceHtml(bill) +
            '</body></html>';

    }

    let invoiceStylesInjected = false;

    function ensureInvoiceStyles() {

        if (invoiceStylesInjected) return;

        const style = document.createElement("style");
        style.id = "invoiceStyles";
        style.textContent = INVOICE_CSS;
        document.head.appendChild(style);
        invoiceStylesInjected = true;

    }


    // =====================================================
    // VIEW INVOICE
    // =====================================================

    function viewInvoice(id) {

        const bill = findBill(id);

        if (!bill) {
            alert("Invoice not found.");
            return;
        }

        if (!invoiceViewContent) return;

        currentInvoice = bill;

        ensureInvoiceStyles();

        const titleEl = document.getElementById("viewInvoiceTitle");
        if (titleEl) titleEl.textContent = "Invoice " + (bill.invoiceNumber || bill.id);

        invoiceViewContent.innerHTML = invoiceHtml(bill);

        renderActionBar(bill);

        if (viewInvoiceModal) {
            viewInvoiceModal.classList.add("active");
            const body = viewInvoiceModal.querySelector(".billing-modal-body");
            if (body) body.scrollTop = 0;
        }

    }


    // =====================================================
    // INVOICE ACTIONS (edit / mark paid / void / correct / reissue)
    // =====================================================
    // Pending bills are edited in place. Once a bill is Paid it is
    // permanent financial history: the backend refuses direct edits
    // (routers/billing.py) and corrections go through void (with a
    // recorded reason) + a linked corrected bill.

    function renderActionBar(bill) {

        const bar = document.getElementById("invoiceActionBar");

        if (!bar) return;

        const status = String(bill.status || "Pending");
        const buttons = [];

        if (status === "Pending" || status === "Overdue") {
            if (can("edit")) {
                buttons.push('<button type="button" class="btn btn-sm btn-primary" data-act="edit"><i class="fa-solid fa-pen"></i> Edit Invoice</button>');
                buttons.push('<button type="button" class="btn btn-sm btn-outline-primary" data-act="pay"><i class="fa-solid fa-circle-check"></i> Mark as Paid</button>');
                buttons.push('<button type="button" class="btn btn-sm btn-danger" data-act="void"><i class="fa-solid fa-ban"></i> Void</button>');
            }
        } else if (status === "Paid") {
            if (can("edit") && can("create")) {
                buttons.push('<button type="button" class="btn btn-sm btn-primary" data-act="correct"><i class="fa-solid fa-pen"></i> Correct this Bill</button>');
            }
        } else if (status === "Void" && !bill.replacedByBillId) {
            if (can("create")) {
                buttons.push('<button type="button" class="btn btn-sm btn-primary" data-act="reissue"><i class="fa-solid fa-rotate"></i> Issue Corrected Bill</button>');
            }
        }

        bar.innerHTML = buttons.join("");

        // assigning onclick (not addEventListener) so re-rendering never stacks handlers
        bar.onclick = function (event) {

            const button = event.target.closest("[data-act]");

            if (!button || button.disabled) return;

            const act = button.dataset.act;

            if (act === "edit") { closeViewInvoice(); openEditInvoice(bill); }
            else if (act === "pay") markAsPaid(bill, button);
            else if (act === "void") voidInvoice(bill, false, button);
            else if (act === "correct") voidInvoice(bill, true, button);
            else if (act === "reissue") { closeViewInvoice(); startReissue(bill); }

        };

    }

    function applyUpdatedBill(updated) {

        const idx = billingCache.findIndex(function (b) { return b.id === updated.id; });

        if (idx >= 0) billingCache[idx] = updated;
        else billingCache.push(updated);

        CareFlowAPI.setCached("billing", billingCache);
        renderBilling();
        updateStats();

    }

    function describe(error, action) {

        return (typeof CareFlowAPI !== "undefined" && CareFlowAPI.describeError)
            ? CareFlowAPI.describeError(error, action)
            : (error && error.message) || ("Could not " + action + ".");

    }

    async function markAsPaid(bill, button) {

        if (!window.confirm(
            "Mark invoice " + bill.id + " as Paid?\n\n" +
            "After this the bill can no longer be edited directly - any later correction needs Void & Reissue."
        )) return;

        if (button) button.disabled = true;

        try {

            const updated = await CareFlowAPI.request(
                "/billing/" + encodeURIComponent(bill.id),
                { method: "PUT", body: JSON.stringify({ status: "Paid" }) }
            );

            applyUpdatedBill(updated);
            showToast("Invoice " + bill.id + " marked as Paid.");
            viewInvoice(bill.id);

        } catch (error) {

            alert(describe(error, "mark this invoice as paid"));
            if (button) button.disabled = false;

        }

    }

    async function voidInvoice(bill, thenReissue, button) {

        const prompt = thenReissue
            ? "Invoice " + bill.id + " is Paid, so it can't be edited directly.\n\n" +
              "To correct it, it will be VOIDED (kept on record) and you'll then issue a corrected invoice.\n\n" +
              "Reason for the correction (required, saved in the audit log):"
            : "Why are you voiding invoice " + bill.id + "? This is required and will be recorded in the audit log.";

        const reason = window.prompt(prompt);

        if (reason === null) return;

        if (reason.trim().length < 3) {
            alert("Please enter a reason (at least 3 characters).");
            return;
        }

        if (button) button.disabled = true;

        try {

            const updated = await CareFlowAPI.request(
                "/billing/" + encodeURIComponent(bill.id) + "/void",
                { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }
            );

            applyUpdatedBill(updated);

            if (thenReissue) {
                closeViewInvoice();
                showToast("Invoice " + bill.id + " voided. Now enter the corrected bill.");
                startReissue(updated);
            } else {
                showToast("Invoice " + bill.id + " voided.");
                viewInvoice(bill.id);
            }

        } catch (error) {

            alert(describe(error, "void this invoice"));
            if (button) button.disabled = false;

        }

    }

    // Opens the invoice form pre-filled from a voided bill; the next
    // save sends replacesBillId so both bills are linked.
    function startReissue(bill) {

        if (!can("create")) {
            alert("You do not have permission to create invoices.");
            return;
        }

        editingBillId = null;
        reissuingBillId = bill.id;

        loadPatients();

        if (invoicePatient) invoicePatient.value = bill.patientId || "";
        if (invoiceStatus) invoiceStatus.value = "Pending";
        if (invoiceDate) invoiceDate.value = new Date().toISOString().split("T")[0];

        invoiceItems = invoiceRows(bill).map(function (it) {
            return { id: "new-" + (++invoiceItemSeq), description: it.description, quantity: it.quantity, unitPrice: it.unitPrice };
        });

        if (!invoiceItems.length) {
            invoiceItems = [{ id: "new-" + (++invoiceItemSeq), description: "", quantity: 1, unitPrice: 0 }];
        }

        renderInvoiceItems();

        if (invoiceDiscountType) invoiceDiscountType.value = bill.discountType || "";
        if (invoiceDiscountValue) invoiceDiscountValue.value = bill.discountValue || 0;
        if (invoiceTaxType) invoiceTaxType.value = bill.taxType || "";
        if (invoiceTaxValue) invoiceTaxValue.value = bill.taxValue || 0;

        updateInvoiceTotal();
        setInvoiceModalMode(false);

        const titleEl = document.getElementById("newInvoiceModalTitle");
        if (titleEl) titleEl.textContent = "Corrected Invoice (replaces " + bill.id + ")";
        const saveLabelEl = document.getElementById("saveInvoiceBtnLabel");
        if (saveLabelEl) saveLabelEl.textContent = "Issue Corrected Invoice";

        if (newInvoiceModal) newInvoiceModal.classList.add("active");

    }


    // =====================================================
    // CLOSE VIEW INVOICE
    // =====================================================

    function closeViewInvoice() {

        if (viewInvoiceModal) viewInvoiceModal.classList.remove("active");

        currentInvoice = null;

    }

    if (closeViewInvoiceModal) closeViewInvoiceModal.addEventListener("click", closeViewInvoice);
    if (closeInvoiceViewBtn) closeInvoiceViewBtn.addEventListener("click", closeViewInvoice);

    if (viewInvoiceModal) {
        viewInvoiceModal.addEventListener("click", function (event) {
            if (event.target === viewInvoiceModal) closeViewInvoice();
        });
    }


    // =====================================================
    // PRINT / DOWNLOAD
    // =====================================================

    function downloadInvoice(bill) {

        if (!bill) return;

        const blob = new Blob([invoiceDocument(bill, true)], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "Invoice-" + (bill.invoiceNumber || bill.id) + ".html";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    }

    // Prints straight from the page through a hidden frame - no file to
    // download and open first. From the print dialog the customer copy
    // can also be saved as a PDF.
    function printInvoice(bill) {

        if (!bill) return;

        const frame = document.createElement("iframe");

        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
        document.body.appendChild(frame);

        const cleanup = function () {
            if (frame.parentNode) frame.parentNode.removeChild(frame);
        };

        try {

            const doc = frame.contentWindow.document;

            doc.open();
            doc.write(invoiceDocument(bill, false));
            doc.close();

            setTimeout(function () {

                try {
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                } catch (error) {
                    cleanup();
                    showToast("Printing isn't available here - downloading the invoice instead.", true);
                    downloadInvoice(bill);
                    return;
                }

                setTimeout(cleanup, 60000);

            }, 300);

        } catch (error) {

            cleanup();
            downloadInvoice(bill);

        }

    }

    if (downloadInvoiceBtn) {
        downloadInvoiceBtn.addEventListener("click", function () {
            if (currentInvoice) downloadInvoice(currentInvoice);
        });
    }

    if (printInvoiceBtn) {
        printInvoiceBtn.addEventListener("click", function () {
            if (currentInvoice) printInvoice(currentInvoice);
        });
    }


    // =====================================================
    // TABLE ACTIONS
    // =====================================================

    if (tbody) {

        tbody.addEventListener("click", function (event) {

            const button = event.target.closest("[data-action]");

            if (!button) return;

            const action = button.dataset.action;
            const id = button.dataset.id;

            if (action === "view") {
                viewInvoice(id);
                return;
            }

            if (action === "edit") {
                const bill = findBill(id);
                if (bill) openEditInvoice(bill);
                return;
            }

            if (action === "print") {
                const bill = findBill(id);
                if (bill) printInvoice(bill);
                return;
            }

            if (action === "delete") {

                if (!window.confirm("Delete this billing record? This cannot be undone.")) return;

                button.disabled = true;

                CareFlowAPI.request("/billing/" + encodeURIComponent(id), { method: "DELETE" })
                    .then(function () {
                        billingCache = billingCache.filter(function (item) { return item.id !== id; });
                        CareFlowAPI.setCached("billing", billingCache);
                        renderBilling();
                        updateStats();
                        showToast("Invoice " + id + " deleted.");
                    })
                    .catch(function (error) {
                        alert(describe(error, "delete this billing record"));
                        button.disabled = false;
                    });

            }

        });

    }


    // =====================================================
    // EXPORT CSV
    // =====================================================

    function csvValue(value) {

        const text = String(value == null ? "" : value);

        return '"' + text.replace(/"/g, '""') + '"';

    }

    if (exportBtn) {

        exportBtn.addEventListener("click", function () {

            const bills = getBillingData();

            if (!bills.length) {
                alert("No billing records to export.");
                return;
            }

            const csv = [[
                "Invoice Number", "Patient", "Patient ID", "Date", "Items",
                "Subtotal (INR)", "Discount (INR)", "Tax (INR)", "Total (INR)", "Status"
            ].join(",")];

            bills.forEach(function (bill) {

                const patient = findPatientFor(bill) || {};

                csv.push([
                    csvValue(bill.invoiceNumber || bill.id),
                    csvValue(bill.patientName),
                    csvValue(patient.mrn || bill.mrn || ""),
                    csvValue(bill.date),
                    Array.isArray(bill.items) ? bill.items.length : 0,
                    Number(bill.subtotal) || 0,
                    Number(bill.discountAmount) || 0,
                    Number(bill.taxAmount) || 0,
                    Number(bill.total) || 0,
                    csvValue(bill.status)
                ].join(","));

            });

            const blob = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = "careflow-billing-" + new Date().toISOString().split("T")[0] + ".csv";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

            showToast("Billing data exported.");

        });

    }


    // =====================================================
    // SEARCH (desktop header box + mobile box stay in sync)
    // =====================================================

    if (searchInput) {
        searchInput.addEventListener("input", function () {
            if (searchInputMobile) searchInputMobile.value = searchInput.value;
            renderBilling();
        });
    }

    if (searchInputMobile) {
        searchInputMobile.addEventListener("input", function () {
            if (searchInput) searchInput.value = searchInputMobile.value;
            renderBilling();
        });
    }


    // =====================================================
    // RENDER BILLING TABLE
    // =====================================================

    function renderBilling() {

        if (!tbody) return;

        const term = (
            (searchInput && searchInput.value) ||
            (searchInputMobile && searchInputMobile.value) ||
            ""
        ).toLowerCase().trim();

        let bills = getBillingData();

        if (term) {
            bills = bills.filter(function (bill) {
                return [bill.patientName, bill.invoiceNumber, bill.id, bill.status, bill.date]
                    .join(" ").toLowerCase().indexOf(term) >= 0;
            });
        }

        // newest first
        bills = bills.slice().sort(function (a, b) {
            return String(b.date || "").localeCompare(String(a.date || "")) ||
                String(b.id).localeCompare(String(a.id));
        });

        if (!bills.length) {
            tbody.innerHTML =
                '<tr><td colspan="7" style="text-align:center;padding:45px;">' +
                '<i class="fa-solid fa-file-invoice" style="font-size:28px;margin-bottom:12px;opacity:.4;"></i>' +
                '<div>No billing records found.</div></td></tr>';
            return;
        }

        const mayEdit = can("edit");
        const mayDelete = can("delete");

        tbody.innerHTML = bills.map(function (bill) {

            const key = statusKey(bill);
            const label = String(bill.status || "Pending");
            const patient = findPatientFor(bill);
            const id = escapeHTML(bill.id);
            const editable = key === "pending" || key === "overdue";
            const itemCount = Array.isArray(bill.items) ? bill.items.length : 0;

            return '<tr>' +
                '<td data-label="Invoice"><span class="bill-id">' + escapeHTML(bill.invoiceNumber || bill.id) + '</span></td>' +
                '<td data-label="Patient"><strong>' + escapeHTML(bill.patientName) + '</strong>' +
                    (patient && patient.mrn ? '<span class="bill-sub">' + escapeHTML(patient.mrn) + '</span>' : "") + '</td>' +
                '<td data-label="Date">' + escapeHTML(fmtDate(bill.date)) + '</td>' +
                '<td data-label="Items">' + (itemCount ? itemCount : "&mdash;") + '</td>' +
                '<td data-label="Total" class="num"><strong>' + money(bill.total) + '</strong></td>' +
                '<td data-label="Status"><span class="bill-status ' + key + '">' + escapeHTML(label) + '</span></td>' +
                '<td class="cell-actions"><div class="table-actions">' +
                    '<button type="button" class="btn btn-sm btn-ghost" data-action="view" data-id="' + id + '" title="View invoice"><i class="fa-solid fa-eye"></i><span class="btn-label">View</span></button>' +
                    (mayEdit && editable ? '<button type="button" class="btn btn-sm btn-ghost" data-action="edit" data-id="' + id + '" title="Edit invoice"><i class="fa-solid fa-pen"></i><span class="btn-label">Edit</span></button>' : "") +
                    '<button type="button" class="btn btn-sm btn-ghost" data-action="print" data-id="' + id + '" title="Print invoice"><i class="fa-solid fa-print"></i><span class="btn-label">Print</span></button>' +
                    (mayDelete && editable ? '<button type="button" class="btn btn-sm btn-ghost text-danger" data-action="delete" data-id="' + id + '" title="Delete invoice"><i class="fa-solid fa-trash"></i><span class="btn-label">Delete</span></button>' : "") +
                '</div></td>' +
                '</tr>';

        }).join("");

    }


    // =====================================================
    // UPDATE STATS
    // =====================================================

    function updateStats() {

        let collected = 0;
        let pending = 0;
        let overdue = 0;
        let count = 0;

        getBillingData().forEach(function (bill) {

            const total = Number(bill.total) || 0;
            const key = statusKey(bill);

            count++;

            if (key === "paid") collected += total;
            else if (key === "overdue") overdue += total;
            else if (key === "pending") pending += total;
            // Void bills are cancelled - they count toward no money total.

        });

        const set = function (id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        set("totalCollected", money(collected));
        set("totalPending", money(pending));
        set("totalOverdue", money(overdue));
        set("totalInvoices", String(count));

    }


    // =====================================================
    // ESC KEY
    // =====================================================

    document.addEventListener(
        "keydown",
        function (event) {

            if (event.key !== "Escape") {
                return;
            }


            if (
                newInvoiceModal &&
                newInvoiceModal.classList.contains(
                    "active"
                )
            ) {

                closeNewInvoice();

            }


            if (
                viewInvoiceModal &&
                viewInvoiceModal.classList.contains(
                    "active"
                )
            ) {

                closeViewInvoice();

            }

        }
    );


    // =====================================================
    // INITIAL LOAD
    // =====================================================

    // Permissions must be loaded before the first render: Permissions.can()
    // fails closed until they are, which would hide every action button.
    (async function initBilling() {
        try {
            if (typeof Permissions !== "undefined" && typeof Permissions.ensureLoaded === "function") {
                await Permissions.ensureLoaded();
            }
        } catch (error) {
            console.error("[CareFlow] Could not load permissions:", error);
        }
        loadBillingData();
    })();


    // =====================================================
    // KEEP THE LIST LIVE WHILE THIS PAGE STAYS OPEN
    // =====================================================

    setInterval(loadBillingData, 20000);

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) loadBillingData();
    });

    window.addEventListener("focus", loadBillingData);

});