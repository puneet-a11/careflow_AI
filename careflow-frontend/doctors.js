/* ============================================
   CAREFLOW AI - DOCTORS MODULE
   Add / Edit / Delete Doctors
   ============================================ */

document.addEventListener("DOMContentLoaded", function () {

    if (!Auth.requireAuth()) return;

    var grid = document.getElementById("doctorGrid");

    var addBtn = document.getElementById("addDoctorBtn");

    var modal = document.getElementById("doctorModal");
    var modalTitle = document.getElementById("doctorModalTitle");

    var modalClose = document.getElementById("doctorModalClose");
    var modalCancel = document.getElementById("doctorModalCancel");
    var modalSave = document.getElementById("doctorModalSave");

    var nameInput = document.getElementById("doctorName");
    var specializationInput =
        document.getElementById("doctorSpecialization");

    var departmentInput =
        document.getElementById("doctorDepartment");

    var availabilityInput =
        document.getElementById("doctorAvailability");

    var appointmentsInput =
        document.getElementById("doctorAppointments");

    var patientsInput =
        document.getElementById("doctorPatients");


    if (!grid) return;


    // Currently editing doctor
    var editingDoctorId = null;

    var REFRESH_INTERVAL_MS = 20000;

    /* =========================================
       LOAD DOCTORS FROM BACKEND
       Always pulls the latest list instead of the
       login-time cache, so changes made elsewhere
       (another tab, the AI assistant, etc.) show up
       without a manual reload.
       ========================================= */

    async function loadDoctors() {

        try {
            var doctors = await CareFlowAPI.request('/doctors');
            CareFlowAPI.setCached('doctors', doctors);
        } catch (error) {
            console.error('[Doctors] Failed to load doctors:', error);
        }

        renderDoctors();
    }


    /* =========================================
       RENDER DOCTORS
       ========================================= */

    function renderDoctors() {

        var doctors = getDoctors();

        grid.innerHTML = "";


        if (doctors.length === 0) {

            grid.innerHTML = `
                <div class="card">
                    <div class="card-body" style="text-align:center;">
                        <i class="fa-solid fa-user-doctor"
                           style="font-size:40px;opacity:.4;">
                        </i>

                        <h3>No Doctors Added</h3>

                        <p class="text-muted">
                            Click "Add Doctor" to add a doctor.
                        </p>
                    </div>
                </div>
            `;

            return;
        }


        doctors.forEach(function (d) {

            var initials = d.name
                .split(" ")
                .map(function (n) {
                    return n.charAt(0);
                })
                .join("")
                .substring(0, 2)
                .toUpperCase();


            var availabilityBadge = "badge-success";


            if (d.availability === "Busy") {
                availabilityBadge = "badge-warning";
            }

            else if (d.availability === "Off Duty") {
                availabilityBadge = "badge-neutral";
            }


            var card = document.createElement("div");

            card.className = "card";


            card.innerHTML = `

                <div class="card-body" style="text-align:center;">

                    <div class="patient-card-avatar mx-auto"
                        style="
                            background:${d.avatarBg || "#4f46e5"};
                            width:64px;
                            height:64px;
                            font-size:1.5rem;
                        ">
                        ${initials}
                    </div>


                    <h4 style="
                        margin-top:1rem;
                        margin-bottom:.25rem;
                    ">
                        ${escapeHTML(d.name)}
                    </h4>


                    <p class="text-muted"
                        style="margin-bottom:.5rem;">
                        ${escapeHTML(d.specialization)}
                    </p>


                    <span class="badge badge-info"
                        style="margin-bottom:.75rem;">
                        ${escapeHTML(d.department)}
                    </span>


                    <div style="margin-bottom:.75rem;">

                        <span class="badge ${availabilityBadge} badge-dot">
                            ${escapeHTML(d.availability)}
                        </span>

                        ${d.isActive === false ? '<span class="badge badge-neutral" style="margin-left:.35rem;">Inactive</span>' : ''}

                    </div>


                    <div class="mini-stat-row"
                        style="margin-top:.75rem;">

                        <div class="mini-stat">

                            <div class="mini-stat-value">
                                ${d.appointmentsToday || 0}
                            </div>

                            <div class="mini-stat-label">
                                Today
                            </div>

                        </div>


                        <div class="mini-stat">

                            <div class="mini-stat-value">
                                ${d.patientCount || 0}
                            </div>

                            <div class="mini-stat-label">
                                Patients
                            </div>

                        </div>

                    </div>


                    <div style="
                        display:flex;
                        gap:8px;
                        justify-content:center;
                        margin-top:1rem;
                        flex-wrap:wrap;
                    ">

                        <button
                            class="btn btn-sm btn-outline edit-doctor"
                            data-id="${d.id}">

                            <i class="fa-solid fa-pen"></i>
                            Edit

                        </button>


                        <button
                            class="btn btn-sm btn-outline toggle-doctor-active"
                            data-id="${d.id}">

                            <i class="fa-solid ${d.isActive === false ? "fa-toggle-off" : "fa-toggle-on"}"></i>
                            ${d.isActive === false ? "Activate" : "Deactivate"}

                        </button>


                        <button
                            class="btn btn-sm btn-danger delete-doctor"
                            data-id="${d.id}">

                            <i class="fa-solid fa-trash"></i>
                            Delete

                        </button>

                    </div>

                </div>
            `;


            grid.appendChild(card);

        });

    }


    /* =========================================
       OPEN MODAL
       ========================================= */

    function openModal(doctor) {

        modal.classList.add("active");

        if (doctor) {

            editingDoctorId = doctor.id;

            modalTitle.textContent = "Edit Doctor";

            nameInput.value = doctor.name || "";

            specializationInput.value =
                doctor.specialization || "";

            departmentInput.value =
                doctor.department || "";

            availabilityInput.value =
                doctor.availability || "Available";

            appointmentsInput.value =
                doctor.appointmentsToday || 0;

            patientsInput.value =
                doctor.patientCount || 0;

            modalSave.innerHTML =
                '<i class="fa-solid fa-check"></i> Update Doctor';

        }

        else {

            editingDoctorId = null;

            modalTitle.textContent = "Add Doctor";

            nameInput.value = "";

            specializationInput.value = "";

            departmentInput.value = "";

            availabilityInput.value = "Available";

            appointmentsInput.value = 0;

            patientsInput.value = 0;

            modalSave.innerHTML =
                '<i class="fa-solid fa-check"></i> Save Doctor';

        }


        setTimeout(function () {
            nameInput.focus();
        }, 100);

    }


    /* =========================================
       CLOSE MODAL
       ========================================= */

    function closeModal() {

        modal.classList.remove("active");

        editingDoctorId = null;

    }


    /* =========================================
       SAVE DOCTOR
       ========================================= */

    async function saveDoctor() {

        var name = nameInput.value.trim();

        var specialization =
            specializationInput.value.trim();

        var department =
            departmentInput.value;

        var availability =
            availabilityInput.value;

        var appointments =
            parseInt(appointmentsInput.value) || 0;

        var patients =
            parseInt(patientsInput.value) || 0;


        // Validation

        if (!name) {

            nameInput.focus();

            return;

        }


        if (!specialization) {

            specializationInput.focus();

            return;

        }


        if (!department) {

            departmentInput.focus();

            return;

        }


        /* =====================================
           EDIT
           ===================================== */

        var payload = {
            name: name,
            specialization: specialization,
            department: department,
            availability: availability,
            appointmentsToday: appointments,
            patientCount: patients,
            avatarBg: "#4f46e5"
        };


        /* =====================================
           ADD
           ===================================== */

        try {
            modalSave.disabled = true;
            modalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            var saved = editingDoctorId
                ? await CareFlowAPI.request('/doctors/' + encodeURIComponent(editingDoctorId), { method: 'PUT', body: JSON.stringify(payload) })
                : await CareFlowAPI.request('/doctors', { method: 'POST', body: JSON.stringify(payload) });
            var doctors = CareFlowAPI.getCached('doctors') || [];
            var index = doctors.findIndex(function (doctor) { return doctor.id === saved.id; });
            if (index === -1) doctors.push(saved); else doctors[index] = saved;
            CareFlowAPI.setCached('doctors', doctors);
            renderDoctors();
            closeModal();
        } catch (error) {
            alert(error.message || 'Doctor record could not be saved.');
        } finally {
            modalSave.disabled = false;
            modalSave.innerHTML = '<i class="fa-solid fa-check"></i> Save Doctor';
        }

    }


    /* =========================================
       DELETE DOCTOR
       ========================================= */

    async function deleteDoctor(id) {

        var doctor =
            getDoctorById(id);


        if (!doctor) return;


        if (!confirm(
            "Delete " + doctor.name + "?"
        )) {

            return;

        }


        try {
            await CareFlowAPI.request('/doctors/' + encodeURIComponent(id), { method: 'DELETE' });
            CareFlowAPI.setCached('doctors', (CareFlowAPI.getCached('doctors') || []).filter(function (item) { return item.id !== id; }));
            renderDoctors();
        } catch (error) {
            alert(error.message || 'Doctor record could not be deleted.');
        }

    }


    /* =========================================
       TOGGLE ACTIVE / INACTIVE
       ========================================= */

    async function toggleDoctorActive(id, button) {

        var doctor =
            getDoctorById(id);

        if (!doctor) return;

        var goingInactive = doctor.isActive !== false;

        if (goingInactive && !confirm(
            "Deactivate " + doctor.name + "? They will no longer be " +
            "selectable for new appointments, but existing records are kept."
        )) {
            return;
        }

        if (button) button.disabled = true;

        try {
            var updated = await CareFlowAPI.request(
                '/doctors/' + encodeURIComponent(id),
                { method: 'PUT', body: JSON.stringify({ isActive: !goingInactive }) }
            );
            var cached = CareFlowAPI.getCached('doctors') || [];
            var idx = cached.findIndex(function (item) { return item.id === id; });
            if (idx >= 0) cached[idx] = updated;
            CareFlowAPI.setCached('doctors', cached);
            renderDoctors();
        } catch (error) {
            alert(error.message || 'Could not update this doctor\u2019s status.');
            if (button) button.disabled = false;
        }

    }


    /* =========================================
       GENERATE ID
       ========================================= */

    function generateDoctorId() {

        var max = 0;


        MOCK_DOCTORS.forEach(function (doctor) {

            var number =
                parseInt(
                    doctor.id.replace("D", "")
                );


            if (!isNaN(number) && number > max) {

                max = number;

            }

        });


        return "D" +
            String(max + 1).padStart(3, "0");

    }


    /* =========================================
       ESCAPE HTML
       ========================================= */

    function escapeHTML(value) {

        return String(value)

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#039;");

    }


    /* =========================================
       EVENTS
       ========================================= */


    // Add Doctor

    if (addBtn) {

        addBtn.addEventListener("click", function () {

            openModal(null);

        });

    }


    // Save

    if (modalSave) {

        modalSave.addEventListener(
            "click",
            saveDoctor
        );

    }


    // Close

    if (modalClose) {

        modalClose.addEventListener(
            "click",
            closeModal
        );

    }


    // Cancel

    if (modalCancel) {

        modalCancel.addEventListener(
            "click",
            closeModal
        );

    }


    // Click outside modal

    if (modal) {

        modal.addEventListener("click", function (e) {

            if (e.target === modal) {

                closeModal();

            }

        });

    }


    // Edit / Delete

    grid.addEventListener("click", function (e) {

        var editButton =
            e.target.closest(".edit-doctor");


        var deleteButton =
            e.target.closest(".delete-doctor");


        var toggleActiveButton =
            e.target.closest(".toggle-doctor-active");


        if (editButton) {

            var id =
                editButton.dataset.id;


            var doctor =
                getDoctorById(id);


            if (doctor) {

                openModal(doctor);

            }

        }


        if (deleteButton) {

            deleteDoctor(
                deleteButton.dataset.id
            );

        }


        if (toggleActiveButton) {

            toggleDoctorActive(
                toggleActiveButton.dataset.id,
                toggleActiveButton
            );

        }

    });


    // ESC key

    document.addEventListener("keydown", function (e) {

        if (
            e.key === "Escape" &&
            modal.classList.contains("active")
        ) {

            closeModal();

        }

    });


    /* =========================================
       EXPORT (CSV)
       ========================================= */

    var exportDoctorsBtn = document.getElementById("exportDoctorsBtn");

    if (exportDoctorsBtn) {

        exportDoctorsBtn.addEventListener("click", function () {

            var doctors = getDoctors();

            if (!doctors || !doctors.length) {
                alert("No doctors to export.");
                return;
            }

            function csvValue(value) {
                var str = value === null || value === undefined ? "" : String(value);
                if (/[",\n]/.test(str)) {
                    str = '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }

            var header = ["Name", "Specialization", "Department", "Availability", "Appointments Today", "Patient Count"];
            var csv = [header.map(csvValue).join(",")];

            doctors.forEach(function (d) {
                csv.push([
                    csvValue(d.name),
                    csvValue(d.specialization),
                    csvValue(d.department),
                    csvValue(d.availability),
                    csvValue(d.appointmentsToday),
                    csvValue(d.patientCount)
                ].join(","));
            });

            var blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
            var url = URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.href = url;
            link.download = "CareFlow-Doctors-" + new Date().toISOString().slice(0, 10) + ".csv";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }


    // Initial load (fetches fresh from the backend)

    loadDoctors();

    // Keep the doctors list live while this page stays open.
    setInterval(loadDoctors, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) loadDoctors();
    });
    window.addEventListener("focus", loadDoctors);

});
