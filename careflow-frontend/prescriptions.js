/* =========================================================
   CAREFLOW AI - PRESCRIPTIONS MODULE
   New Prescription + View + Print + Search
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    if (!Auth.requireAuth()) return;


    // =====================================================
    // ELEMENTS
    // =====================================================

    var tbody =
        document.getElementById("prescriptionTableBody");

    var newPrescriptionBtn =
        document.getElementById("newPrescriptionBtn");

    var newPrescriptionModal =
        document.getElementById("newPrescriptionModal");

    var closePrescriptionModal =
        document.getElementById("closePrescriptionModal");

    var cancelPrescriptionBtn =
        document.getElementById("cancelPrescriptionBtn");

    var savePrescriptionBtn =
        document.getElementById("savePrescriptionBtn");

    // =====================================================
    // EDIT PRESCRIPTION - BACKEND SUPPORT NOTES
    // =====================================================
    // make_crud_router exposes PUT /prescriptions/{id} (no PATCH).
    // PrescriptionUpdate accepts exactly: patientId, patientName,
    // doctor, diagnosis, medicines (list of strings), dosage,
    // frequency, duration, date.
    //
    // There is NO instructions field and NO void/status/superseded
    // column anywhere in the prescription model, so this project does
    // not implement a void-and-reissue workflow. RBAC-restricted,
    // server-audited direct editing is therefore the final behaviour
    // (prescriptions.edit = admin, doctor, pharmacist). Every update
    // writes an audit row server-side via crud_factory._write_audit.
    // An "instructions" input is deliberately NOT added, because the
    // backend would reject/ignore it.

    var editingPrescriptionId = null;
    var prescriptionSaveInFlight = false;

    function describePrescriptionError(error, action) {
        if (typeof CareFlowAPI !== "undefined" && CareFlowAPI.describeError) {
            return CareFlowAPI.describeError(error, action);
        }
        return (error && error.message) || ("Could not " + action + ".");
    }

    function setPrescriptionModalMode(isEdit) {

        if (!newPrescriptionModal) return;

        var titleEl = newPrescriptionModal.querySelector(".prescription-modal-header h2");

        if (titleEl) {
            titleEl.innerHTML = isEdit
                ? '<i class="fa-solid fa-pen-to-square"></i> Edit Prescription'
                : '<i class="fa-solid fa-file-prescription"></i> New Prescription';
        }

        if (savePrescriptionBtn) {
            savePrescriptionBtn.innerHTML = isEdit
                ? '<i class="fa-solid fa-check"></i> Save Changes'
                : '<i class="fa-solid fa-check"></i> Save Prescription';
        }

    }

    function setPrescriptionSaveBusy(busy) {

        var cancelBtn = document.getElementById("cancelPrescriptionBtn");

        if (savePrescriptionBtn) {
            savePrescriptionBtn.disabled = busy;
            if (busy) {
                savePrescriptionBtn.dataset.idleHtml = savePrescriptionBtn.innerHTML;
                savePrescriptionBtn.innerHTML =
                    '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            } else if (savePrescriptionBtn.dataset.idleHtml) {
                savePrescriptionBtn.innerHTML = savePrescriptionBtn.dataset.idleHtml;
                delete savePrescriptionBtn.dataset.idleHtml;
            }
        }

        if (cancelBtn) cancelBtn.disabled = busy;

    }


    var patientSelect =
        document.getElementById("prescriptionPatient");

    var doctorSelect =
        document.getElementById("prescriptionDoctor");

    var diagnosisInput =
        document.getElementById("prescriptionDiagnosis");

    var medicinesInput =
        document.getElementById("prescriptionMedicines");

    var dosageInput =
        document.getElementById("prescriptionDosage");

    var frequencyInput =
        document.getElementById("prescriptionFrequency");

    var durationInput =
        document.getElementById("prescriptionDuration");

    var instructionsInput =
        document.getElementById("prescriptionInstructions");

    var dateInput =
        document.getElementById("prescriptionDate");


    var viewModal =
        document.getElementById("viewPrescriptionModal");

    var closeViewModal =
        document.getElementById("closeViewModal");

    var closeViewBtn =
        document.getElementById("closeViewBtn");

    var printPrescriptionBtn =
        document.getElementById("printPrescriptionBtn");

    var viewContent =
        document.getElementById("prescriptionViewContent");


    var searchInput =
        document.getElementById("prescriptionSearch");


    // =====================================================
    // GET PRESCRIPTIONS (from the real backend/database)
    // =====================================================

    var prescriptionsCache = [];

    function getPrescriptionData() {
        return prescriptionsCache;
    }

    async function loadPrescriptionData() {

        // The patient / doctor pickers read from the cache filled at login;
        // refresh it so people added since then can be prescribed for.
        var pickersRefresh = Promise.all([
            typeof CareFlowAPI.getPatients === "function" ? CareFlowAPI.getPatients().catch(function () {}) : null,
            typeof CareFlowAPI.getDoctors === "function" ? CareFlowAPI.getDoctors().catch(function () {}) : null
        ]);

        try {

            prescriptionsCache = await CareFlowAPI.request('/prescriptions');
            CareFlowAPI.setCached('prescriptions', prescriptionsCache);

        } catch (error) {

            prescriptionsCache = CareFlowAPI.getCached('prescriptions') || [];

            if (!prescriptionsCache.length) {
                alert(error.message || 'Unable to load prescriptions from the server.');
            }

        }

        await pickersRefresh;

        renderPrescriptions();

    }


    // =====================================================
    // PATIENTS / DOCTORS
    // Read through the shared mock-data.js getters, which are
    // backed by the CareFlowAPI cache (real database data).
    // =====================================================

    function getPatientData() {

        if (typeof getPatients === "function") {
            return getPatients();
        }

        return [];

    }


    function getDoctorData() {

        if (typeof getDoctors === "function") {
            return getDoctors().filter(function (d) { return d.isActive !== false; });
        }

        return [];

    }


    // =====================================================
    // LOAD PATIENTS
    // =====================================================

    function loadPatients() {

        if (!patientSelect) return;


        patientSelect.innerHTML = `
            <option value="">
                Select patient...
            </option>
        `;


        var patients =
            getPatientData();


        patients.forEach(function (patient) {

            var option =
                document.createElement("option");


            option.value =
                patient.id;


            option.textContent =
                patient.name +
                (
                    patient.mrn
                        ? " (" + patient.mrn + ")"
                        : ""
                );


            patientSelect.appendChild(
                option
            );

        });

    }


    // =====================================================
    // LOAD DOCTORS
    // =====================================================

    function loadDoctors() {

        if (!doctorSelect) return;


        doctorSelect.innerHTML = `
            <option value="">
                Select doctor...
            </option>
        `;


        var doctors =
            getDoctorData();


        doctors.forEach(function (doctor) {

            var option =
                document.createElement("option");


            option.value =
                doctor.id;


            option.textContent =
                doctor.name +
                (
                    doctor.specialization
                        ? " - " +
                          doctor.specialization
                        : ""
                );


            doctorSelect.appendChild(
                option
            );

        });

    }


    // =====================================================
    // OPEN NEW PRESCRIPTION
    // =====================================================

    function openNewPrescription() {

        editingPrescriptionId = null;

        setPrescriptionModalMode(false);

        loadPatients();

        loadDoctors();

        clearForm();


        if (dateInput) {

            dateInput.value =
                new Date()
                    .toISOString()
                    .split("T")[0];

        }


        newPrescriptionModal.classList.add(
            "active"
        );

    }


    // =====================================================
    // CLOSE NEW PRESCRIPTION
    // =====================================================

    function closeNewPrescription() {

        editingPrescriptionId = null;

        newPrescriptionModal.classList.remove(
            "active"
        );

        setPrescriptionModalMode(false);

        clearForm();

    }


    // =====================================================
    // OPEN EDIT PRESCRIPTION
    // =====================================================
    // Reuses the existing New Prescription modal/form - only the
    // heading, the save label and the target endpoint differ.

    // Never call Permissions.can directly - see canDo().
    function canDo(action) {
        return typeof Permissions !== "undefined" &&
            typeof Permissions.can === "function" &&
            Permissions.can("prescriptions", action);
    }

    function openEditPrescription(rx) {

        if (!rx) return;

        if (!canDo("edit")) {
            alert("You do not have permission to edit prescriptions.");
            return;
        }

        editingPrescriptionId = rx.id;

        loadPatients();
        loadDoctors();
        clearForm();

        if (patientSelect) {
            // Keep the original patient selectable even if that record is
            // no longer in the active list, so an edit never silently
            // reassigns the prescription.
            if (rx.patientId &&
                !patientSelect.querySelector('option[value="' + String(rx.patientId).replace(/"/g, '') + '"]')) {
                var keepPatient = document.createElement("option");
                keepPatient.value = rx.patientId;
                keepPatient.textContent = (rx.patientName || rx.patientId) + " (current)";
                patientSelect.appendChild(keepPatient);
            }
            patientSelect.value = rx.patientId || "";
        }

        if (doctorSelect) {
            // The doctor picker stores doctor ids but the record stores
            // the doctor NAME, so match by name. Inactive doctors are
            // excluded from new assignments by getDoctorData(), so the
            // historical doctor is re-added here rather than erased.
            var doctors = getDoctorData();
            var match = doctors.find(function (d) { return d.name === rx.doctor; });

            if (match) {
                doctorSelect.value = match.id;
            } else if (rx.doctor) {
                var keepDoctor = document.createElement("option");
                keepDoctor.value = "__existing__";
                keepDoctor.textContent = rx.doctor + " (current)";
                keepDoctor.dataset.name = rx.doctor;
                doctorSelect.appendChild(keepDoctor);
                doctorSelect.value = "__existing__";
            }
        }

        if (diagnosisInput) diagnosisInput.value = rx.diagnosis || "";

        // Medicines keep their existing list structure: the backend field
        // is a list of strings, shown here as the same comma-separated
        // text used by the create form.
        if (medicinesInput) {
            medicinesInput.value = Array.isArray(rx.medicines)
                ? rx.medicines.join(", ")
                : (rx.medicines || "");
        }

        if (dosageInput) dosageInput.value = rx.dosage || "";
        if (frequencyInput) frequencyInput.value = rx.frequency || "";
        if (durationInput) durationInput.value = rx.duration || "";
        if (instructionsInput) instructionsInput.value = rx.instructions || "";
        if (dateInput) dateInput.value = rx.date || "";

        setPrescriptionModalMode(true);

        newPrescriptionModal.classList.add("active");

    }


    // =====================================================
    // CLEAR FORM
    // =====================================================

    function clearForm() {

        if (patientSelect)
            patientSelect.value = "";

        if (doctorSelect)
            doctorSelect.value = "";

        if (diagnosisInput)
            diagnosisInput.value = "";

        if (medicinesInput)
            medicinesInput.value = "";

        if (dosageInput)
            dosageInput.value = "";

        if (frequencyInput)
            frequencyInput.value = "";

        if (durationInput)
            durationInput.value = "";

        if (instructionsInput)
            instructionsInput.value = "";

        if (dateInput)
            dateInput.value = "";

    }


    // =====================================================
    // NEW PRESCRIPTION BUTTON
    // =====================================================

    if (newPrescriptionBtn) {

        newPrescriptionBtn.addEventListener(
            "click",
            openNewPrescription
        );

    }


    // =====================================================
    // CLOSE BUTTONS
    // =====================================================

    if (closePrescriptionModal) {

        closePrescriptionModal.addEventListener(
            "click",
            closeNewPrescription
        );

    }


    if (cancelPrescriptionBtn) {

        cancelPrescriptionBtn.addEventListener(
            "click",
            closeNewPrescription
        );

    }


    // =====================================================
    // OUTSIDE CLICK
    // =====================================================

    if (newPrescriptionModal) {

        newPrescriptionModal.addEventListener(
            "click",
            function (e) {

                if (
                    e.target ===
                    newPrescriptionModal
                ) {

                    closeNewPrescription();

                }

            }
        );

    }


    // =====================================================
    // SAVE PRESCRIPTION
    // =====================================================

    if (savePrescriptionBtn) {

        savePrescriptionBtn.addEventListener(
            "click",
            async function () {

                var patientId =
                    patientSelect.value;

                var doctorId =
                    doctorSelect.value;

                var isEdit = Boolean(editingPrescriptionId);

                if (prescriptionSaveInFlight) return;

                if (!canDo(isEdit ? "edit" : "create")) {
                    alert(isEdit
                        ? "You do not have permission to edit prescriptions."
                        : "You do not have permission to create prescriptions.");
                    return;
                }

                var diagnosis =
                    diagnosisInput.value.trim();

                var medicinesText =
                    medicinesInput.value.trim();

                var dosage =
                    dosageInput.value.trim();

                var frequency =
                    frequencyInput.value.trim();

                var duration =
                    durationInput.value.trim();

                var instructions =
                    (instructionsInput ? instructionsInput.value.trim() : "");

                var date =
                    dateInput.value;


                // =========================================
                // VALIDATION
                // =========================================

                if (
                    !patientId ||
                    !doctorId ||
                    !diagnosis ||
                    !medicinesText ||
                    !dosage ||
                    !frequency ||
                    !duration ||
                    !date
                ) {

                    alert(
                        "Please fill all prescription details."
                    );

                    return;

                }


                // =========================================
                // FIND PATIENT
                // =========================================

                var patients =
                    getPatientData();


                var patient =
                    patients.find(function (p) {

                        return String(p.id) ===
                               String(patientId);

                    });


                // =========================================
                // FIND DOCTOR
                // =========================================

                var doctors =
                    getDoctorData();


                var doctor =
                    doctors.find(function (d) {

                        return String(d.id) ===
                               String(doctorId);

                    });

                // When editing an old record whose doctor is now inactive,
                // the picker holds a preserved placeholder option carrying
                // the original name.
                if (!doctor && doctorId === "__existing__") {
                    var keptOption = doctorSelect.options[doctorSelect.selectedIndex];
                    if (keptOption && keptOption.dataset.name) {
                        doctor = { id: null, name: keptOption.dataset.name };
                    }
                }


                if (!patient) {

                    alert(
                        "Selected patient not found."
                    );

                    return;

                }


                if (!doctor) {

                    alert(
                        "Selected doctor not found."
                    );

                    return;

                }


                // =========================================
                // MEDICINES
                // =========================================

                var medicines =
                    medicinesText
                        .split(",")
                        .map(function (medicine) {

                            return medicine.trim();

                        })
                        .filter(function (medicine) {

                            return medicine.length > 0;

                        });


                // =========================================
                // CREATE PRESCRIPTION (persists to the
                // real backend/database)
                // =========================================

                var payload = {

                    patientId:
                        patient.id,

                    patientName:
                        patient.name,

                    doctor:
                        doctor.name,

                    diagnosis:
                        diagnosis,

                    medicines:
                        medicines,

                    dosage:
                        dosage,

                    frequency:
                        frequency,

                    duration:
                        duration,

                    instructions:
                        instructions || null,

                    date:
                        date

                };


                // =========================================
                // SAVE
                // =========================================

                prescriptionSaveInFlight = true;
                setPrescriptionSaveBusy(true);

                try {

                    if (isEdit) {

                        // PUT against the existing id - an edit can never
                        // fall through to POST and duplicate the record.
                        await CareFlowAPI.request(
                            '/prescriptions/' + encodeURIComponent(editingPrescriptionId),
                            { method: 'PUT', body: JSON.stringify(payload) }
                        );

                    } else {

                        await CareFlowAPI.request(
                            '/prescriptions',
                            { method: 'POST', body: JSON.stringify(payload) }
                        );

                    }

                    closeNewPrescription();

                    // Re-read from the server so the table shows exactly
                    // what was persisted.
                    await loadPrescriptionData();

                    alert(isEdit
                        ? "Prescription updated successfully."
                        : "Prescription added successfully.");

                } catch (error) {

                    if (error && error.careFlowStatus === 404 && isEdit) {
                        closeNewPrescription();
                        await loadPrescriptionData();
                    }

                    alert(describePrescriptionError(
                        error,
                        isEdit ? "update this prescription" : "save this prescription"
                    ));

                } finally {

                    prescriptionSaveInFlight = false;
                    setPrescriptionSaveBusy(false);

                }

            }
        );

    }


    // =====================================================
    // RENDER PRESCRIPTIONS
    // =====================================================

    function renderPrescriptions() {

        if (!tbody) return;


        var prescriptions =
            getPrescriptionData();


        var searchTerm =
            searchInput
                ? searchInput.value
                    .toLowerCase()
                    .trim()
                : "";


        if (searchTerm) {

            prescriptions =
                prescriptions.filter(
                    function (rx) {

                        return (

                            String(
                                rx.patientName || ""
                            )
                                .toLowerCase()
                                .includes(searchTerm)

                            ||

                            String(
                                rx.doctor || ""
                            )
                                .toLowerCase()
                                .includes(searchTerm)

                            ||

                            String(
                                rx.diagnosis || ""
                            )
                                .toLowerCase()
                                .includes(searchTerm)

                        );

                    }
                );

        }


        tbody.innerHTML = "";


        // =============================================
        // EMPTY
        // =============================================

        if (
            prescriptions.length === 0
        ) {

            tbody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        style="text-align:center; padding:30px;">

                        No prescriptions found.

                    </td>

                </tr>

            `;

            return;

        }


        // =============================================
        // TABLE ROWS
        // =============================================

        prescriptions.forEach(
            function (rx) {

                var row =
                    document.createElement("tr");


                row.innerHTML = `

                    <td>

                        <div class="table-patient">

                            <span
                                class="table-patient-name">

                                ${escapeHTML(
                                    rx.patientName || ""
                                )}

                            </span>

                        </div>

                    </td>


                    <td>
                        ${escapeHTML(
                            rx.doctor || ""
                        )}
                    </td>


                    <td>
                        ${escapeHTML(
                            rx.diagnosis || ""
                        )}
                    </td>


                    <td>
                        ${escapeHTML(
                            (rx.medicines || []).join(", ")
                        )}
                    </td>


                    <td>

                        ${escapeHTML(
                            rx.dosage || ""
                        )}

                        -
                        
                        ${escapeHTML(
                            rx.frequency || ""
                        )}

                        -

                        ${escapeHTML(
                            rx.duration || ""
                        )}

                    </td>


                    <td>
                        ${escapeHTML(
                            rx.date || ""
                        )}
                    </td>


                    <td>

                        <div class="table-actions">

                            <button
                                class="btn btn-sm btn-ghost"
                                data-action="view"
                                data-id="${rx.id}"
                                title="View">

                                <i class="fa-solid fa-eye"></i>

                            </button>
                            ${canDo("edit") ? `
                            <button
                                class="btn btn-sm btn-ghost"
                                data-action="edit"
                                data-id="${rx.id}"
                                title="Edit Prescription">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>` : ""}
                            ${canDo("delete") ? `
                            <button
                                class="btn btn-sm btn-ghost text-danger"
                                data-action="delete"
                                data-id="${rx.id}"
                                title="Delete Prescription">
                                <i class="fa-solid fa-trash"></i>
                            </button>` : ""}


                            <button
                                class="btn btn-sm btn-ghost"
                                data-action="print"
                                data-id="${rx.id}"
                                title="Print">

                                <i class="fa-solid fa-print"></i>

                            </button>

                        </div>

                    </td>

                `;


                tbody.appendChild(row);

            }
        );

    }


    // =====================================================
    // ESCAPE HTML
    // =====================================================

    function escapeHTML(value) {

        return String(value)

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#039;");

    }


    // =====================================================
    // FIND PRESCRIPTION
    // =====================================================

    function findPrescription(id) {

        var prescriptions =
            getPrescriptionData();


        return prescriptions.find(
            function (rx) {

                return String(rx.id) ===
                       String(id);

            }
        );

    }


    // =====================================================
    // VIEW PRESCRIPTION
    // =====================================================

    function viewPrescription(id) {

        var rx =
            findPrescription(id);


        if (!rx) {

            alert(
                "Prescription not found."
            );

            return;

        }


        viewContent.innerHTML = `

            <div class="prescription-view">

                <div class="prescription-view-header">

                    <h2>
                        CareFlow AI
                    </h2>

                    <p>
                        Patient Prescription
                    </p>

                </div>


                <div class="prescription-view-section">

                    <h4>
                        Patient Information
                    </h4>


                    <div class="prescription-view-grid">

                        <div class="prescription-view-item">

                            <small>
                                Patient
                            </small>

                            <strong>
                                ${escapeHTML(
                                    rx.patientName || ""
                                )}
                            </strong>

                        </div>


                        <div class="prescription-view-item">

                            <small>
                                Doctor
                            </small>

                            <strong>
                                ${escapeHTML(
                                    rx.doctor || ""
                                )}
                            </strong>

                        </div>


                        <div class="prescription-view-item">

                            <small>
                                Date
                            </small>

                            <strong>
                                ${escapeHTML(
                                    rx.date || ""
                                )}
                            </strong>

                        </div>


                        <div class="prescription-view-item">

                            <small>
                                Prescription ID
                            </small>

                            <strong>
                                ${escapeHTML(
                                    rx.id || ""
                                )}
                            </strong>

                        </div>

                    </div>

                </div>


                <div class="prescription-view-section">

                    <h4>
                        Diagnosis
                    </h4>

                    <div class="prescription-medicines">

                        ${escapeHTML(
                            rx.diagnosis || ""
                        )}

                    </div>

                </div>


                <div class="prescription-view-section">

                    <h4>
                        Medicines
                    </h4>

                    <div class="prescription-medicines">

                        ${(rx.medicines || [])
                            .map(function (medicine, index) {

                                return (
                                    (index + 1) +
                                    ". " +
                                    escapeHTML(medicine)
                                );

                            })
                            .join("<br>")}

                    </div>

                </div>


                <div class="prescription-view-section">

                    <h4>
                        Dosage Instructions
                    </h4>


                    <div class="prescription-view-grid">

                        <div class="prescription-view-item">

                            <small>
                                Dosage
                            </small>

                            <strong>
                                ${escapeHTML(
                                    rx.dosage || ""
                                )}
                            </strong>

                        </div>


                        <div class="prescription-view-item">

                            <small>
                                Frequency
                            </small>

                            <strong>
                                ${escapeHTML(
                                    rx.frequency || ""
                                )}
                            </strong>

                        </div>


                        <div class="prescription-view-item">

                            <small>
                                Duration
                            </small>

                            <strong>
                                ${escapeHTML(
                                    rx.duration || ""
                                )}
                            </strong>

                        </div>

                    </div>

                    ${
                        rx.instructions
                            ? `
                    <div class="prescription-view-item" style="margin-top: var(--space-3);">
                        <small>Instructions</small>
                        <strong>${escapeHTML(rx.instructions)}</strong>
                    </div>`
                            : ""
                    }

                </div>

            </div>

        `;


        viewModal.classList.add(
            "active"
        );

    }


    // =====================================================
    // CLOSE VIEW
    // =====================================================

    function closeViewPrescription() {

        viewModal.classList.remove(
            "active"
        );

    }


    if (closeViewModal) {

        closeViewModal.addEventListener(
            "click",
            closeViewPrescription
        );

    }


    if (closeViewBtn) {

        closeViewBtn.addEventListener(
            "click",
            closeViewPrescription
        );

    }


    if (viewModal) {

        viewModal.addEventListener(
            "click",
            function (e) {

                if (
                    e.target === viewModal
                ) {

                    closeViewPrescription();

                }

            }
        );

    }


    // =====================================================
    // TABLE ACTIONS
    // =====================================================

    if (tbody) {

        tbody.addEventListener(
            "click",
            function (e) {

                var button =
                    e.target.closest(
                        "[data-action]"
                    );


                if (!button) return;


                var action =
                    button.dataset.action;


                var id =
                    button.dataset.id;
                if (action === "edit") {
                    var rxToEdit = prescriptionsCache.find(function (item) { return item.id === id; });
                    openEditPrescription(rxToEdit);
                    return;
                }

                if (action === "delete") {
                    if (!window.confirm("Delete this prescription? This cannot be undone.")) return;
                    button.disabled = true;
                    CareFlowAPI.request("/prescriptions/" + encodeURIComponent(id), { method: "DELETE" })
                        .then(function () {
                            prescriptionsCache = prescriptionsCache.filter(function (item) { return item.id !== id; });
                            CareFlowAPI.setCached("prescriptions", prescriptionsCache);
                            renderPrescriptions();
                        })
                        .catch(function (error) { alert(describePrescriptionError(error, "delete this prescription")); button.disabled = false; });
                    return;
                }


                // VIEW
                if (
                    action === "view"
                ) {

                    viewPrescription(id);

                }


                // PRINT
                if (
                    action === "print"
                ) {

                    viewPrescription(id);

                    setTimeout(
                        function () {

                            window.print();

                        },
                        300
                    );

                }

            }
        );

    }


    // =====================================================
    // PRINT FROM VIEW MODAL
    // =====================================================

    if (printPrescriptionBtn) {

        printPrescriptionBtn.addEventListener(
            "click",
            function () {

                window.print();

            }
        );

    }


    // =====================================================
    // SEARCH
    // =====================================================

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            function () {

                renderPrescriptions();

            }
        );

    }


    // =====================================================
    // EXPORT (CSV)
    // =====================================================

    var exportPrescriptionsBtn =
        document.getElementById("exportPrescriptionsBtn");

    if (exportPrescriptionsBtn) {

        exportPrescriptionsBtn.addEventListener(
            "click",
            function () {

                var rows = getPrescriptionData();

                var searchTerm =
                    searchInput
                        ? searchInput.value.toLowerCase().trim()
                        : "";

                if (searchTerm) {
                    rows = rows.filter(function (rx) {
                        return (
                            String(rx.patientName || "").toLowerCase().includes(searchTerm) ||
                            String(rx.doctor || "").toLowerCase().includes(searchTerm) ||
                            String(rx.diagnosis || "").toLowerCase().includes(searchTerm)
                        );
                    });
                }

                if (!rows.length) {
                    alert("No prescriptions to export.");
                    return;
                }

                function csvValue(value) {
                    var str = value === null || value === undefined ? "" : String(value);
                    if (/[",\n]/.test(str)) {
                        str = '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                }

                var header = ["Patient", "Doctor", "Diagnosis", "Medicines", "Dosage", "Frequency", "Duration", "Instructions", "Date"];
                var csv = [header.map(csvValue).join(",")];

                rows.forEach(function (rx) {
                    csv.push([
                        csvValue(rx.patientName),
                        csvValue(rx.doctor),
                        csvValue(rx.diagnosis),
                        csvValue((rx.medicines || []).join("; ")),
                        csvValue(rx.dosage),
                        csvValue(rx.frequency),
                        csvValue(rx.duration),
                        csvValue(rx.instructions),
                        csvValue(rx.date)
                    ].join(","));
                });

                var blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
                var url = URL.createObjectURL(blob);
                var link = document.createElement("a");
                link.href = url;
                link.download = "CareFlow-Prescriptions-" + new Date().toISOString().slice(0, 10) + ".csv";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        );

    }


    // =====================================================
    // INITIAL LOAD
    // =====================================================

    // Permissions must be loaded first: canDo() fails closed until they are.
    (async function initPrescriptions() {
        try {
            if (typeof Permissions !== "undefined" && typeof Permissions.ensureLoaded === "function") {
                await Permissions.ensureLoaded();
            }
        } catch (error) {
            console.error("[CareFlow] Could not load permissions:", error);
        }
        loadPrescriptionData();
    })();


    // =====================================================
    // KEEP THE LIST LIVE WHILE THIS PAGE STAYS OPEN
    // =====================================================

    setInterval(loadPrescriptionData, 20000);

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) loadPrescriptionData();
    });

    window.addEventListener("focus", loadPrescriptionData);

});