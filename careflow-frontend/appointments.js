document.addEventListener("DOMContentLoaded", () => {

    if (!Auth.requireAuth()) return;

    // =====================================================
    // APPOINTMENT ELEMENTS
    // =====================================================

    const newAppointmentBtn =
        document.getElementById("newAppointmentBtn");

    const appointmentModal =
        document.getElementById("appointmentModal");

    const modalClose =
        document.getElementById("modalClose");

    const modalCancel =
        document.getElementById("modalCancel");

    const modalSave =
        document.getElementById("modalSave");

    const patientSelect =
        document.getElementById("apptPatient");

    const doctorSelect =
        document.getElementById("apptDoctor");

    const dateInput =
        document.getElementById("apptDate");

    const timeInput =
        document.getElementById("apptTime");

    const typeSelect =
        document.getElementById("apptType");

    const tableBody =
        document.getElementById("appointmentsTableBody");

    const totalCount =
        document.getElementById("totalCount");

    const showingCount =
        document.getElementById("showingCount");

    const searchInput =
        document.getElementById("appointmentSearch");


    // =====================================================
    // NEW PATIENT ELEMENTS
    // =====================================================

    const patientModal =
        document.getElementById("patientModal");

    const patientModalClose =
        document.getElementById("patientModalClose");

    const patientModalCancel =
        document.getElementById("patientModalCancel");

    const savePatientBtn =
        document.getElementById("savePatientBtn");

    const newPatientName =
        document.getElementById("newPatientName");

    const newPatientMRN =
        document.getElementById("newPatientMRN");

    const newPatientAge =
        document.getElementById("newPatientAge");

    const newPatientGender =
        document.getElementById("newPatientGender");

    const newPatientBloodGroup =
        document.getElementById("newPatientBloodGroup");

    const newPatientPhone =
        document.getElementById("newPatientPhone");

    const newPatientAllergies =
        document.getElementById("newPatientAllergies");


    let editingId = null;
    let currentFilter = "all";

    // The user's LOCAL calendar day (toISOString() is UTC and gives
    // yesterday's date for the first hours of the day in India).
    function localToday() {
        const now = new Date();
        const p = function (n) { return (n < 10 ? "0" : "") + n; };
        return now.getFullYear() + "-" + p(now.getMonth() + 1) + "-" + p(now.getDate());
    }

    // ?id=A005 (from the dashboard's eye button) jumps straight to that
    // appointment and highlights it.
    let deepLinkAppointmentId = new URLSearchParams(window.location.search).get("id");
    let lastRenderedAppointments = [];


    // =====================================================
    // DATA ACCESS
    // Patients / Doctors / Appointments all come from the
    // real backend (via mock-data.js getters, which read the
    // CareFlowAPI cache populated at login). No page-local
    // localStorage copies here anymore - the database is the
    // single source of truth.
    // =====================================================

    // getPatients() / getDoctors() are provided globally by mock-data.js.

    let appointmentsCache = [];

    function getAppointments() {
        return appointmentsCache;
    }

    async function loadAppointments() {
        try {
            appointmentsCache = await CareFlowAPI.request('/appointments');
            CareFlowAPI.setCached('appointments', appointmentsCache);
        } catch (error) {
            appointmentsCache = CareFlowAPI.getCached('appointments') || [];
            if (!appointmentsCache.length) {
                alert(error.message || 'Unable to load appointments from the server.');
            }
        }
        renderAppointments(currentFilter);
        focusDeepLinkedAppointment();
    }

    function focusDeepLinkedAppointment() {

        if (!deepLinkAppointmentId) return;

        const id = deepLinkAppointmentId;

        deepLinkAppointmentId = null;

        if (!getAppointments().some(function (a) { return a.id === id; })) return;

        // make sure the current filter / search can't hide it
        if (searchInput) searchInput.value = "";
        renderAppointments("all");

        const row = Array.prototype.find.call(
            tableBody.querySelectorAll("tr[data-appointment-id]"),
            function (r) { return r.dataset.appointmentId === id; }
        );

        if (!row) return;

        row.classList.add("row-highlight");
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(function () { row.classList.remove("row-highlight"); }, 5000);

    }


    // =====================================================
    // LOAD PATIENTS
    // =====================================================

    function loadPatients(selectedId = "") {

        patientSelect.innerHTML = `
            <option value="">
                Select patient...
            </option>

            <option value="__new__">
                + Add New Patient
            </option>
        `;


        const patients =
            getPatients();


        patients.forEach(patient => {

            const option =
                document.createElement("option");

            option.value =
                patient.id;

            option.textContent =
                `${patient.name}${patient.mrn
                    ? " (" + patient.mrn + ")"
                    : ""
                }`;

            patientSelect.appendChild(
                option
            );

        });


        if (selectedId) {

            patientSelect.value =
                String(selectedId);

        }

    }


    // =====================================================
    // LOAD DOCTORS
    // =====================================================

    function loadDoctors(selectedId = "") {

        doctorSelect.innerHTML = `
            <option value="">
                Select doctor...
            </option>
        `;


        const doctors =
            getDoctors().filter(function (d) {
                // Keep inactive doctors out of the "pick a NEW doctor"
                // list, but never drop the one already assigned to this
                // appointment (editing an existing appointment shouldn't
                // silently lose/blank the doctor just because they were
                // deactivated after the appointment was made).
                return d.isActive !== false || String(d.id) === String(selectedId);
            });


        if (doctors.length === 0) {

            const option =
                document.createElement("option");

            option.value = "";

            option.textContent =
                "No doctors available";

            option.disabled = true;

            doctorSelect.appendChild(
                option
            );

            return;
        }


        doctors.forEach(doctor => {

            const option =
                document.createElement("option");

            option.value =
                doctor.id;

            option.textContent =
                `${doctor.name} - ${doctor.specialization || doctor.department || ""}`;

            doctorSelect.appendChild(
                option
            );

        });


        if (selectedId) {

            doctorSelect.value =
                String(selectedId);

        }

    }


    // =====================================================
    // OPEN APPOINTMENT MODAL
    // =====================================================

    function openAppointmentModal(
        appointment = null
    ) {

        appointmentModal.classList.add(
            "active"
        );


        loadPatients(
            appointment
                ? appointment.patientId
                : ""
        );


        // appointment.doctor from the backend is the doctor's
        // name, so resolve it back to an id for the <select>.
        var matchedDoctor = appointment
            ? getDoctors().find(function (d) { return d.name === appointment.doctor; })
            : null;

        loadDoctors(
            matchedDoctor
                ? matchedDoctor.id
                : ""
        );


        if (appointment) {

            editingId =
                appointment.id;


            document.getElementById(
                "modalTitle"
            ).textContent =
                "Edit Appointment";


            dateInput.value =
                appointment.date || "";


            timeInput.value =
                appointment.time || "";


            typeSelect.value =
                appointment.type || "";

        }

        else {

            editingId =
                null;


            document.getElementById(
                "modalTitle"
            ).textContent =
                "New Appointment";


            patientSelect.value =
                "";

            doctorSelect.value =
                "";

            dateInput.value =
                "";

            timeInput.value =
                "";

            typeSelect.value =
                "";

        }

    }


    // =====================================================
    // CLOSE APPOINTMENT MODAL
    // =====================================================

    function closeAppointmentModal() {

        appointmentModal.classList.remove(
            "active"
        );

        editingId =
            null;

    }


    // =====================================================
    // NEW APPOINTMENT BUTTON
    // =====================================================

    if (newAppointmentBtn) {

        newAppointmentBtn.addEventListener(
            "click",
            () => {

                openAppointmentModal();

            }
        );

    }


    if (modalClose) {

        modalClose.addEventListener(
            "click",
            closeAppointmentModal
        );

    }


    if (modalCancel) {

        modalCancel.addEventListener(
            "click",
            closeAppointmentModal
        );

    }


    // =====================================================
    // CLOSE APPOINTMENT MODAL OUTSIDE CLICK
    // =====================================================

    if (appointmentModal) {

        appointmentModal.addEventListener(
            "click",
            e => {

                if (
                    e.target ===
                    appointmentModal
                ) {

                    closeAppointmentModal();

                }

            }
        );

    }


    // =====================================================
    // PATIENT DROPDOWN
    // =====================================================

    patientSelect.addEventListener(
        "change",
        () => {

            if (
                patientSelect.value ===
                "__new__"
            ) {

                // Appointment modal hide
                appointmentModal.classList.remove(
                    "active"
                );

                // Patient form open
                openPatientModal();

            }

        }
    );


    // =====================================================
    // OPEN PATIENT MODAL
    // =====================================================

    function openPatientModal() {

        if (!patientModal) {

            alert(
                "Patient form is not available in HTML."
            );

            return;

        }


        patientModal.classList.add(
            "active"
        );

        clearPatientForm();

    }


    // =====================================================
    // CLOSE PATIENT MODAL
    // =====================================================

    function closePatientModal() {

        if (!patientModal) return;


        patientModal.classList.remove(
            "active"
        );

        clearPatientForm();


        // Appointment modal wapas open
        appointmentModal.classList.add(
            "active"
        );


        // Dropdown dobara load
        loadPatients();

    }


    if (patientModalClose) {

        patientModalClose.addEventListener(
            "click",
            closePatientModal
        );

    }


    if (patientModalCancel) {

        patientModalCancel.addEventListener(
            "click",
            closePatientModal
        );

    }


    if (patientModal) {

        patientModal.addEventListener(
            "click",
            e => {

                if (
                    e.target ===
                    patientModal
                ) {

                    closePatientModal();

                }

            }
        );

    }


    // =====================================================
    // CLEAR PATIENT FORM
    // =====================================================

    function clearPatientForm() {

        if (newPatientName)
            newPatientName.value = "";

        if (newPatientMRN)
            newPatientMRN.value = "";

        if (newPatientAge)
            newPatientAge.value = "";

        if (newPatientGender)
            newPatientGender.value = "";

        if (newPatientBloodGroup)
            newPatientBloodGroup.value = "";

        if (newPatientPhone)
            newPatientPhone.value = "";

        if (newPatientAllergies)
            newPatientAllergies.value = "";

    }


    // =====================================================
    // SAVE NEW PATIENT
    // =====================================================

    if (savePatientBtn) {

        savePatientBtn.addEventListener(
            "click",
            async () => {

                const name =
                    newPatientName.value.trim();

                const mrn =
                    newPatientMRN.value.trim();

                const age =
                    newPatientAge.value.trim();

                const gender =
                    newPatientGender.value;

                const bloodGroup =
                    newPatientBloodGroup.value;

                const phone =
                    newPatientPhone.value.trim();

                const allergiesText =
                    newPatientAllergies.value.trim();


                // -----------------------------
                // VALIDATION
                // -----------------------------

                if (!name) {

                    alert(
                        "Please enter patient name."
                    );

                    newPatientName.focus();

                    return;

                }


                if (!age) {

                    alert(
                        "Please enter patient age."
                    );

                    newPatientAge.focus();

                    return;

                }


                if (!gender) {

                    alert(
                        "Please select patient gender."
                    );

                    newPatientGender.focus();

                    return;

                }


                // -----------------------------
                // CREATE PATIENT (persists to the
                // real backend/database)
                // -----------------------------

                const payload = {

                    mrn:
                        mrn ||
                        "MRN-" +
                        Math.floor(
                            10000 +
                            Math.random() *
                            90000
                        ),

                    name: name,

                    age:
                        Number(age),

                    gender:
                        gender,

                    bloodGroup:
                        bloodGroup,

                    allergies:
                        allergiesText
                            ? allergiesText
                                .split(",")
                                .map(
                                    item =>
                                        item.trim()
                                )
                            : [],

                    vitals: {},

                    symptoms: [],

                    severity:
                        "Low",

                    triageScore:
                        0,

                    doctor:
                        "",

                    status:
                        "Waiting",

                    admissionDate:
                        localToday(),

                    medicalHistory:
                        [],

                    currentMedications:
                        [],

                    avatarBg:
                        "#4f46e5"

                };

                savePatientBtn.disabled = true;

                try {

                    const newPatient = await CareFlowAPI.request(
                        '/patients',
                        { method: 'POST', body: JSON.stringify(payload) }
                    );

                    const cachedPatients = CareFlowAPI.getCached('patients') || [];
                    cachedPatients.push(newPatient);
                    CareFlowAPI.setCached('patients', cachedPatients);

                    // -----------------------------
                    // CLOSE PATIENT MODAL
                    // -----------------------------

                    patientModal.classList.remove(
                        "active"
                    );


                    // -----------------------------
                    // REOPEN APPOINTMENT
                    // -----------------------------

                    appointmentModal.classList.add(
                        "active"
                    );


                    // -----------------------------
                    // LOAD PATIENTS AGAIN
                    // -----------------------------

                    loadPatients(
                        newPatient.id
                    );


                    // -----------------------------
                    // SELECT NEW PATIENT
                    // -----------------------------

                    patientSelect.value =
                        newPatient.id;


                    alert(
                        "Patient added successfully!"
                    );

                } catch (error) {

                    alert(error.message || "Patient record could not be saved.");

                } finally {

                    savePatientBtn.disabled = false;

                }

            }
        );

    }


    // =====================================================
    // SAVE APPOINTMENT
    // =====================================================

    if (modalSave) {

        modalSave.addEventListener(
            "click",
            async () => {

                const patientId =
                    patientSelect.value;

                const doctorId =
                    doctorSelect.value;

                const date =
                    dateInput.value;

                const time =
                    timeInput.value;

                const type =
                    typeSelect.value;


                // -----------------------------
                // VALIDATION
                // -----------------------------

                if (
                    !patientId ||
                    patientId === "__new__" ||
                    !doctorId ||
                    !date ||
                    !time ||
                    !type
                ) {

                    alert(
                        "Please fill all appointment details."
                    );

                    return;

                }


                const patients =
                    getPatients();

                const doctors =
                    getDoctors();


                const patient =
                    patients.find(
                        p =>
                            String(p.id) ===
                            String(patientId)
                    );


                const doctor =
                    doctors.find(
                        d =>
                            String(d.id) ===
                            String(doctorId)
                    );


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


                // -----------------------------
                // BUILD PAYLOAD FOR BACKEND
                // (Appointment.doctor is stored as the
                // doctor's name, matching the API schema)
                // -----------------------------

                const payload = {
                    patientId: patient.id,
                    patientName: patient.name,
                    doctor: doctor.name,
                    type: type,
                    date: date,
                    time: time
                };

                const wasEditing =
                    editingId !== null;

                modalSave.disabled = true;

                try {

                    let saved;

                    if (wasEditing) {

                        saved = await CareFlowAPI.request(
                            '/appointments/' + encodeURIComponent(editingId),
                            { method: 'PUT', body: JSON.stringify(payload) }
                        );

                        const index = appointmentsCache.findIndex(
                            a => String(a.id) === String(editingId)
                        );

                        if (index !== -1) appointmentsCache[index] = saved;
                        else appointmentsCache.push(saved);

                    } else {

                        saved = await CareFlowAPI.request(
                            '/appointments',
                            { method: 'POST', body: JSON.stringify(payload) }
                        );

                        appointmentsCache.push(saved);

                    }

                    CareFlowAPI.setCached('appointments', appointmentsCache);

                    renderAppointments(
                        currentFilter
                    );


                    closeAppointmentModal();


                    alert(
                        wasEditing
                            ? "Appointment updated successfully!"
                            : "Appointment created successfully!"
                    );

                } catch (error) {

                    alert(error.message || "Appointment could not be saved.");

                } finally {

                    modalSave.disabled = false;

                }

            }
        );

    }


    // =====================================================
    // RENDER APPOINTMENTS
    // =====================================================

    function renderAppointments(
        filter = "all"
    ) {

        currentFilter =
            filter;


        let appointments =
            getAppointments();


        const today =
            localToday();


        // -----------------------------
        // FILTERS
        // -----------------------------

        if (
            filter === "today"
        ) {

            appointments =
                appointments.filter(
                    a =>
                        a.date ===
                        today
                );

        }


        if (
            filter === "upcoming"
        ) {

            appointments =
                appointments.filter(
                    a =>
                        a.date >= today &&
                        a.status !==
                            "Completed" &&
                        a.status !==
                            "Cancelled"
                );

        }


        if (
            filter === "completed"
        ) {

            appointments =
                appointments.filter(
                    a =>
                        a.status ===
                        "Completed"
                );

        }


        if (
            filter === "cancelled"
        ) {

            appointments =
                appointments.filter(
                    a =>
                        a.status ===
                        "Cancelled"
                );

        }


        // -----------------------------
        // SEARCH
        // -----------------------------

        const query =
            searchInput
                ? searchInput.value
                    .trim()
                    .toLowerCase()
                : "";


        if (query) {

            appointments =
                appointments.filter(
                    appointment => {

                        return (

                            String(
                                appointment.patientName ||
                                ""
                            )
                                .toLowerCase()
                                .includes(
                                    query
                                )

                            ||

                            String(
                                appointment.doctor ||
                                ""
                            )
                                .toLowerCase()
                                .includes(
                                    query
                                )

                            ||

                            String(
                                appointment.type ||
                                ""
                            )
                                .toLowerCase()
                                .includes(
                                    query
                                )

                        );

                    }
                );

        }


        // -----------------------------
        // TRACK FOR EXPORT
        // -----------------------------

        lastRenderedAppointments = appointments;


        // -----------------------------
        // EMPTY
        // -----------------------------

        if (
            appointments.length === 0
        ) {

            tableBody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        class="empty-state">

                        No appointments found.

                    </td>

                </tr>

            `;

        }

        // -----------------------------
        // TABLE
        // -----------------------------

        else {

            tableBody.innerHTML =
                "";


            appointments.forEach(
                appointment => {

                    const row =
                        document.createElement(
                            "tr"
                        );

                    row.dataset.appointmentId = appointment.id;


                    row.innerHTML = `

                        <td>
                            <strong>
                                ${escapeHTML(
                                    appointment.patientName ||
                                    ""
                                )}
                            </strong>
                        </td>

                        <td>
                            ${escapeHTML(
                                appointment.doctor ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                appointment.type ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                appointment.date ||
                                ""
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                appointment.time ||
                                ""
                            )}
                        </td>

                        <td>

                            <span
                                class="status-badge ${getStatusClass(
                                    appointment.status
                                )}">

                                ${escapeHTML(
                                    appointment.status ||
                                    "Upcoming"
                                )}

                            </span>

                        </td>

                        <td>

                            <button
                                class="table-action-btn"
                                data-action="edit"
                                data-id="${appointment.id}"
                                title="Edit">

                                <i class="fa-solid fa-pen"></i>

                            </button>

                            <button
                                class="table-action-btn"
                                data-action="delete"
                                data-id="${appointment.id}"
                                title="Delete">

                                <i class="fa-solid fa-trash"></i>

                            </button>

                        </td>

                    `;


                    tableBody.appendChild(
                        row
                    );

                }
            );

        }


        // -----------------------------
        // COUNTS
        // -----------------------------

        totalCount.textContent =
            appointments.length;


        showingCount.textContent =
            appointments.length > 0
                ? `1-${appointments.length}`
                : "0";

    }


    // =====================================================
    // ESCAPE HTML
    // =====================================================

    function escapeHTML(value) {

        return String(value)

            .replace(
                /&/g,
                "&amp;"
            )

            .replace(
                /</g,
                "&lt;"
            )

            .replace(
                />/g,
                "&gt;"
            )

            .replace(
                /"/g,
                "&quot;"
            )

            .replace(
                /'/g,
                "&#039;"
            );

    }


    // =====================================================
    // STATUS
    // =====================================================

    function getStatusClass(
        status
    ) {

        switch (status) {

            case "Completed":
                return "status-success";

            case "Cancelled":
                return "status-danger";

            case "Upcoming":
            case "Pending":
            case "Checked In":
            case "In Progress":
            case "Triaging":
                return "status-warning";

            default:
                return "status-info";

        }

    }


    // =====================================================
    // EDIT / DELETE
    // =====================================================

    tableBody.addEventListener(
        "click",
        async e => {

            const button =
                e.target.closest(
                    "[data-action]"
                );


            if (!button) return;


            const id =
                button.dataset.id;

            const action =
                button.dataset.action;


            if (
                action === "edit"
            ) {

                const appointments =
                    getAppointments();


                const appointment =
                    appointments.find(
                        a =>
                            String(a.id) ===
                            String(id)
                    );


                if (appointment) {

                    openAppointmentModal(
                        appointment
                    );

                }

            }


            if (
                action === "delete"
            ) {

                if (
                    !confirm(
                        "Delete this appointment?"
                    )
                ) {

                    return;

                }


                try {

                    await CareFlowAPI.request(
                        '/appointments/' + encodeURIComponent(id),
                        { method: 'DELETE' }
                    );

                    appointmentsCache = appointmentsCache.filter(
                        a => String(a.id) !== String(id)
                    );

                    CareFlowAPI.setCached('appointments', appointmentsCache);

                    renderAppointments(
                        currentFilter
                    );


                    alert(
                        "Appointment deleted successfully!"
                    );

                } catch (error) {

                    alert(error.message || "Appointment could not be deleted.");

                }

            }

        }
    );


    // =====================================================
    // SEARCH
    // =====================================================

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                renderAppointments(
                    currentFilter
                );

            }
        );

    }


    // =====================================================
    // TABS
    // =====================================================

    document
        .querySelectorAll(
            ".tab-item"
        )
        .forEach(
            tab => {

                tab.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".tab-item"
                            )
                            .forEach(
                                t =>
                                    t.classList.remove(
                                        "active"
                                    )
                            );


                        tab.classList.add(
                            "active"
                        );


                        renderAppointments(
                            tab.dataset.tab
                        );

                    }
                );

            }
        );


    // =====================================================
    // EXPORT (CSV)
    // =====================================================

    const exportAppointmentsBtn =
        document.getElementById("exportAppointmentsBtn");

    if (exportAppointmentsBtn) {

        exportAppointmentsBtn.addEventListener("click", function () {

            const rows = lastRenderedAppointments || [];

            if (!rows.length) {
                alert("No appointments to export.");
                return;
            }

            function csvValue(value) {
                let str = value === null || value === undefined ? "" : String(value);
                if (/[",\n]/.test(str)) {
                    str = '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }

            const header = ["Patient", "Doctor", "Type", "Date", "Time", "Status"];
            const csv = [header.map(csvValue).join(",")];

            rows.forEach(function (appointment) {
                csv.push([
                    csvValue(appointment.patientName),
                    csvValue(appointment.doctor),
                    csvValue(appointment.type),
                    csvValue(appointment.date),
                    csvValue(appointment.time),
                    csvValue(appointment.status)
                ].join(","));
            });

            const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "CareFlow-Appointments-" + new Date().toISOString().slice(0, 10) + ".csv";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }


    // =====================================================
    // INITIAL LOAD
    // =====================================================

    loadPatients();

    loadDoctors();

    loadAppointments();


    // =====================================================
    // KEEP THE LIST LIVE WHILE THIS PAGE STAYS OPEN
    // =====================================================

    setInterval(loadAppointments, 20000);

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) loadAppointments();
    });

    window.addEventListener("focus", loadAppointments);

});