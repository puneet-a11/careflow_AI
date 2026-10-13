document.addEventListener("DOMContentLoaded", function () {

    // Settings performs authenticated API calls (profile and password
    // updates), so it must not be reachable without a valid session.
    if (typeof Auth === "undefined" || !Auth.requireAuth()) {
        return;
    }


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const sidebar =
        document.getElementById("sidebar");

    const sidebarToggle =
        document.getElementById("sidebarToggle");

    const mobileMenuBtn =
        document.getElementById("mobileMenuBtn");

    const sidebarOverlay =
        document.getElementById("sidebarOverlay");

    const themeToggle =
        document.getElementById("themeToggle");

    const saveMessage =
        document.getElementById("saveMessage");

    const saveMessageText =
        document.getElementById("saveMessageText");


    /* =====================================================
       LOCAL STORAGE HELPERS
    ===================================================== */

    function save(key, value) {

        try {

            localStorage.setItem(
                key,
                JSON.stringify(value)
            );

        } catch (error) {

            console.log(
                "Storage error:",
                error
            );

        }

    }


    function load(key, fallback) {

        try {

            const value =
                localStorage.getItem(key);

            if (value === null) {

                return fallback;

            }

            return JSON.parse(value);

        } catch (error) {

            return fallback;

        }

    }


    /* =====================================================
       MESSAGE
    ===================================================== */

    let messageTimer;


    function showMessage(text) {

        saveMessageText.textContent = text;

        saveMessage.classList.add("show");


        clearTimeout(messageTimer);


        messageTimer =
            setTimeout(function () {

                saveMessage.classList.remove("show");

            }, 2500);

    }


    /* =====================================================
       SIDEBAR DESKTOP
    ===================================================== */

    sidebarToggle.addEventListener(
        "click",
        function () {

            sidebar.classList.toggle(
                "collapsed"
            );


            save(
                "careflow_sidebar_collapsed",
                sidebar.classList.contains(
                    "collapsed"
                )
            );

        }
    );


    /* =====================================================
       MOBILE SIDEBAR
    ===================================================== */

    mobileMenuBtn.addEventListener(
        "click",
        function () {

            sidebar.classList.add(
                "mobile-open"
            );

            sidebarOverlay.classList.add(
                "active"
            );

        }
    );


    function closeMobileSidebar() {

        sidebar.classList.remove(
            "mobile-open"
        );

        sidebarOverlay.classList.remove(
            "active"
        );

    }


    sidebarOverlay.addEventListener(
        "click",
        closeMobileSidebar
    );


    /* CLOSE MOBILE SIDEBAR ON NAV CLICK */

    document
        .querySelectorAll(
            ".sidebar-nav-item"
        )
        .forEach(function (item) {

            item.addEventListener(
                "click",
                function () {

                    if (
                        window.innerWidth <= 850
                    ) {

                        closeMobileSidebar();

                    }

                }
            );

        });


    /* =====================================================
       RESTORE SIDEBAR STATE
    ===================================================== */

    const sidebarCollapsed =
        load(
            "careflow_sidebar_collapsed",
            false
        );


    if (
        sidebarCollapsed &&
        window.innerWidth > 850
    ) {

        sidebar.classList.add(
            "collapsed"
        );

    }


    /* =====================================================
       SETTINGS TABS
    ===================================================== */

    const settingsTabs =
        document.querySelectorAll(
            ".settings-tab"
        );


    const settingsSections =
        document.querySelectorAll(
            ".settings-section"
        );


    function openSettingsTab(tabName) {


        /* REMOVE ACTIVE FROM TABS */

        settingsTabs.forEach(
            function (tab) {

                tab.classList.remove(
                    "active"
                );

            }
        );


        /* HIDE ALL SECTIONS */

        settingsSections.forEach(
            function (section) {

                section.classList.remove(
                    "active"
                );

            }
        );


        /* SELECT TAB */

        const selectedTab =
            document.querySelector(
                '.settings-tab[data-tab="' +
                tabName +
                '"]'
            );


        /* SELECT SECTION */

        const selectedSection =
            document.getElementById(
                tabName
            );


        /* ACTIVATE TAB */

        if (selectedTab) {

            selectedTab.classList.add(
                "active"
            );

        }


        /* ACTIVATE SECTION */

        if (selectedSection) {

            selectedSection.classList.add(
                "active"
            );

        }


        /* SAVE */

        try {

            localStorage.setItem(
                "careflow_settings_tab",
                tabName
            );

        } catch (error) {

            console.log(error);

        }

    }


    /* TAB CLICK */

    settingsTabs.forEach(
        function (tab) {

            tab.addEventListener(
                "click",
                function () {

                    const tabName =
                        this.getAttribute(
                            "data-tab"
                        );


                    openSettingsTab(
                        tabName
                    );

                }
            );

        }
    );


    /* RESTORE LAST TAB */

    let savedTab = "profile";


    try {

        savedTab =
            localStorage.getItem(
                "careflow_settings_tab"
            ) || "profile";

    } catch (error) {

        savedTab = "profile";

    }


    const savedTabExists =
        document.querySelector(
            '.settings-tab[data-tab="' +
            savedTab +
            '"]'
        );


    if (savedTabExists) {

        openSettingsTab(
            savedTab
        );

    } else {

        openSettingsTab(
            "profile"
        );

    }


    /* =====================================================
       THEME
    ===================================================== */

    const darkModeSwitch =
        document.getElementById(
            "darkModeSwitch"
        );


    function applyTheme(isDark) {

        if (isDark) {

            document.documentElement
                .setAttribute(
                    "data-theme",
                    "dark"
                );


            themeToggle.innerHTML =
                '<i class="fa-solid fa-sun"></i>';

        } else {

            document.documentElement
                .setAttribute(
                    "data-theme",
                    "light"
                );


            themeToggle.innerHTML =
                '<i class="fa-solid fa-moon"></i>';

        }


        if (darkModeSwitch) {

            darkModeSwitch.checked =
                isDark;

        }

        // Same key the rest of the app (app.js) uses, so the theme chosen
        // here follows the user to every page and vice-versa.
        try { Storage.set("theme", isDark ? "dark" : "light"); } catch (error) { /* ignore */ }

    }


    // Start from the app-wide theme. This page used to read its own
    // "careflow_dark_mode" key (default: light), so merely opening Settings
    // switched a dark-mode user back to light on every other page too.
    let savedDarkMode;
    try {
        savedDarkMode = Storage.get("theme", "light") === "dark";
    } catch (error) {
        savedDarkMode = load("careflow_dark_mode", false);
    }


    applyTheme(
        savedDarkMode
    );


    /* HEADER THEME BUTTON
       app.js already handles this button on every page. This file used to add a
       second click handler as well, so each click toggled the theme twice
       (dark -> light -> dark) and the button appeared dead on this page.
       Instead, just keep the Appearance switch in sync with whatever the
       theme currently is. */

    new MutationObserver(function () {
        if (darkModeSwitch) {
            darkModeSwitch.checked =
                document.documentElement.getAttribute("data-theme") === "dark";
        }
    }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
    });


    /* APPEARANCE DARK MODE */

    if (darkModeSwitch) {

        darkModeSwitch.addEventListener(
            "change",
            function () {

                const isDark =
                    this.checked;


                applyTheme(
                    isDark
                );


                save(
                    "careflow_dark_mode",
                    isDark
                );


                showMessage(
                    "Appearance updated!"
                );

            }
        );

    }


    /* =====================================================
       COMPACT SIDEBAR
    ===================================================== */

    const compactSidebarSwitch =
        document.getElementById(
            "compactSidebarSwitch"
        );


    if (compactSidebarSwitch) {


        compactSidebarSwitch.checked =
            sidebar.classList.contains(
                "collapsed"
            );


        compactSidebarSwitch.addEventListener(
            "change",
            function () {


                if (
                    window.innerWidth <= 850
                ) {

                    this.checked = false;


                    showMessage(
                        "Compact sidebar is available on desktop."
                    );


                    return;

                }


                sidebar.classList.toggle(
                    "collapsed",
                    this.checked
                );


                save(
                    "careflow_sidebar_collapsed",
                    this.checked
                );


                showMessage(
                    this.checked
                        ? "Sidebar collapsed!"
                        : "Sidebar expanded!"
                );

            }
        );

    }


    /* =====================================================
       PROFILE
    ===================================================== */

    const profileFields = [

        "firstName",
        "lastName",
        "email",
        "phone",
        "department",
        "role"

    ];


    function loadProfile() {

        profileFields.forEach(
            function (id) {

                const element =
                    document.getElementById(
                        id
                    );


                if (!element) {
                    return;
                }


                const savedValue =
                    localStorage.getItem(
                        "careflow_profile_" + id
                    );


                if (
                    savedValue !== null
                ) {

                    element.value =
                        savedValue;

                }

            }
        );

    }


    loadProfile();


    /* SAVE PROFILE */

    document
        .getElementById(
            "saveProfileBtn"
        )
        .addEventListener(
            "click",
            async function () {


                profileFields.forEach(
                    function (id) {

                        const element =
                            document.getElementById(
                                id
                            );


                        if (element) {

                            localStorage.setItem(
                                "careflow_profile_" + id,
                                element.value
                            );

                        }

                    }
                );


                // Persist the display name to the real backend/database
                // (the User model only stores a single "name" field).
                const firstNameEl = document.getElementById("firstName");
                const lastNameEl = document.getElementById("lastName");
                const fullName = [
                    firstNameEl ? firstNameEl.value.trim() : "",
                    lastNameEl ? lastNameEl.value.trim() : ""
                ].filter(Boolean).join(" ");

                if (fullName && typeof CareFlowAPI !== "undefined") {

                    try {

                        const updatedUser = await CareFlowAPI.request(
                            "/auth/me",
                            { method: "PUT", body: JSON.stringify({ name: fullName }) }
                        );

                        const session = Storage.get("session") || {};
                        session.name = updatedUser.name;
                        Storage.set("session", session);

                    } catch (error) {

                        showMessage(
                            error.message || "Profile name could not be saved to the server."
                        );

                        return;

                    }

                }


                showMessage(
                    "Profile saved successfully!"
                );

            }
        );


    /* RESET PROFILE */

    document
        .getElementById(
            "resetProfileBtn"
        )
        .addEventListener(
            "click",
            function () {


                document.getElementById(
                    "firstName"
                ).value =
                    "Rachel";


                document.getElementById(
                    "lastName"
                ).value =
                    "Green";


                document.getElementById(
                    "email"
                ).value =
                    "rachel.green@careflow.ai";


                document.getElementById(
                    "phone"
                ).value =
                    "+91 98765 43210";


                document.getElementById(
                    "department"
                ).value =
                    "General Medicine";


                document.getElementById(
                    "role"
                ).value =
                    "Senior Physician";


                showMessage(
                    "Profile reset!"
                );

            }
        );


    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    const notificationIds = [

        "appointmentNotifications",
        "labNotifications",
        "billingNotifications",
        "systemNotifications"

    ];


    notificationIds.forEach(
        function (id) {

            const element =
                document.getElementById(
                    id
                );


            if (!element) {
                return;
            }


            const saved =
                localStorage.getItem(
                    "careflow_" + id
                );


            if (saved !== null) {

                element.checked =
                    saved === "true";

            }


            element.addEventListener(
                "change",
                function () {

                    localStorage.setItem(
                        "careflow_" + id,
                        element.checked
                    );


                    showMessage(
                        "Notification preference updated!"
                    );

                }
            );

        }
    );


    /* =====================================================
       PASSWORD
    ===================================================== */

    document
        .getElementById(
            "changePasswordBtn"
        )
        .addEventListener(
            "click",
            async function () {


                const current =
                    document.getElementById(
                        "currentPassword"
                    ).value.trim();


                const password =
                    document.getElementById(
                        "newPassword"
                    ).value.trim();


                const confirmPassword =
                    document.getElementById(
                        "confirmPassword"
                    ).value.trim();


                if (
                    !current ||
                    !password ||
                    !confirmPassword
                ) {

                    alert(
                        "Please fill all password fields."
                    );

                    return;

                }


                if (
                    password !== confirmPassword
                ) {

                    alert(
                        "New password and confirm password do not match."
                    );

                    return;

                }


                if (
                    password.length < 6
                ) {

                    alert(
                        "Password must contain at least 6 characters."
                    );

                    return;

                }


                const changeBtn = document.getElementById("changePasswordBtn");
                changeBtn.disabled = true;

                try {

                    // Real backend call: verifies the current password against
                    // the bcrypt hash in the database and re-hashes the new one.
                    await CareFlowAPI.request("/auth/change-password", {
                        method: "POST",
                        body: JSON.stringify({
                            current_password: current,
                            new_password: password
                        })
                    });

                    document.getElementById("currentPassword").value = "";
                    document.getElementById("newPassword").value = "";
                    document.getElementById("confirmPassword").value = "";

                    showMessage(
                        "Password changed. Signing you out for security\u2026"
                    );

                    // The backend invalidates every token issued before this
                    // change (including the one this tab is using) as soon as
                    // the password changes - see app/routers/auth.py. Log out
                    // here too so the UI doesn't sit on a session that's about
                    // to start failing requests with "session no longer valid".
                    setTimeout(function () {
                        Auth.logout();
                    }, 1800);

                } catch (error) {

                    alert(error.message || "Password could not be changed.");

                } finally {

                    changeBtn.disabled = false;

                }

            }
        );


    /* =====================================================
       SYSTEM SETTINGS
    ===================================================== */

    const saveSystemBtn =
        document.getElementById(
            "saveSystemBtn"
        );


    if (saveSystemBtn) {

        saveSystemBtn.addEventListener(
            "click",
            function () {


                const systemSettings = {

                    currency:
                        document.getElementById(
                            "currency"
                        ).value,

                    dateFormat:
                        document.getElementById(
                            "dateFormat"
                        ).value,

                    timeFormat:
                        document.getElementById(
                            "timeFormat"
                        ).value,

                    language:
                        document.getElementById(
                            "language"
                        ).value

                };


                save(
                    "careflow_system_preferences",
                    systemSettings
                );


                showMessage(
                    "System preferences saved!"
                );

            }
        );

    }


    /* LOAD SYSTEM SETTINGS */

    const systemSettings =
        load(
            "careflow_system_preferences",
            null
        );


    if (systemSettings) {


        if (systemSettings.currency) {

            document.getElementById(
                "currency"
            ).value =
                systemSettings.currency;

        }


        if (systemSettings.dateFormat) {

            document.getElementById(
                "dateFormat"
            ).value =
                systemSettings.dateFormat;

        }


        if (systemSettings.timeFormat) {

            document.getElementById(
                "timeFormat"
            ).value =
                systemSettings.timeFormat;

        }


        if (systemSettings.language) {

            document.getElementById(
                "language"
            ).value =
                systemSettings.language;

        }

    }


    /* =====================================================
       CLEAR LOCAL SETTINGS
    ===================================================== */

    document
        .getElementById(
            "clearSettingsBtn"
        )
        .addEventListener(
            "click",
            function () {


                const reset =
                    confirm(
                        "Reset all saved CareFlow AI settings on this device?"
                    );


                if (!reset) {
                    return;
                }


                const keys = [

                    "careflow_dark_mode",

                    "careflow_sidebar_collapsed",

                    "careflow_settings_tab",

                    "careflow_profile_firstName",

                    "careflow_profile_lastName",

                    "careflow_profile_email",

                    "careflow_profile_phone",

                    "careflow_profile_department",

                    "careflow_profile_role",

                    "careflow_appointmentNotifications",

                    "careflow_labNotifications",

                    "careflow_billingNotifications",

                    "careflow_systemNotifications",

                    "careflow_system_preferences"

                ];


                keys.forEach(
                    function (key) {

                        localStorage.removeItem(
                            key
                        );

                    }
                );


                /* Reset theme */

                applyTheme(false);


                /* Reset sidebar */

                sidebar.classList.remove(
                    "collapsed"
                );


                if (compactSidebarSwitch) {

                    compactSidebarSwitch.checked =
                        false;

                }


                /* Reset notifications */

                notificationIds.forEach(
                    function (id) {

                        const element =
                            document.getElementById(
                                id
                            );


                        if (element) {

                            element.checked =
                                true;

                        }

                    }
                );


                /* Reset profile */

                document.getElementById(
                    "firstName"
                ).value =
                    "Rachel";


                document.getElementById(
                    "lastName"
                ).value =
                    "Green";


                document.getElementById(
                    "email"
                ).value =
                    "rachel.green@careflow.ai";


                document.getElementById(
                    "phone"
                ).value =
                    "+91 98765 43210";


                document.getElementById(
                    "department"
                ).value =
                    "General Medicine";


                document.getElementById(
                    "role"
                ).value =
                    "Senior Physician";


                /* Go to profile */

                openSettingsTab(
                    "profile"
                );


                showMessage(
                    "All settings have been reset."
                );

            }
        );


    /* =====================================================
       LOGOUT
    ===================================================== */

    function logout() {

        try {

            localStorage.removeItem(
                "careflow_auth"
            );

            localStorage.removeItem(
                "isLoggedIn"
            );

        } catch (error) {

            console.log(error);

        }


        /*
           Agar tere project me login.html hai
           to ye redirect karega.
        */

        window.location.href =
            "login.html";

    }


    /* SIDEBAR LOGOUT */

    document
        .getElementById(
            "logoutBtn"
        )
        .addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                logout();

            }
        );


    /* SECURITY LOGOUT */

    document
        .getElementById(
            "securityLogoutBtn"
        )
        .addEventListener(
            "click",
            function () {

                logout();

            }
        );


    /* =====================================================
       HEADER NOTIFICATION
    ===================================================== */

    document
        .getElementById(
            "headerNotificationBtn"
        )
        .addEventListener(
            "click",
            function () {

                openSettingsTab(
                    "notifications"
                );

                showMessage(
                    "Notification settings opened."
                );

            }
        );


    /* =====================================================
       SETTINGS SEARCH
    ===================================================== */

    const settingsSearch =
        document.getElementById(
            "settingsSearch"
        );


    if (settingsSearch) {

        settingsSearch.addEventListener(
            "input",
            function () {

                const query =
                    this.value
                        .toLowerCase()
                        .trim();


                if (!query) {

                    settingsTabs.forEach(
                        function (tab) {

                            tab.style.display =
                                "flex";

                        }
                    );

                    return;

                }


                settingsTabs.forEach(
                    function (tab) {

                        const text =
                            tab.textContent
                                .toLowerCase();


                        if (
                            text.includes(query)
                        ) {

                            tab.style.display =
                                "flex";

                        } else {

                            tab.style.display =
                                "none";

                        }

                    }
                );

            }
        );

    }


    /* =====================================================
       WINDOW RESIZE
    ===================================================== */

    window.addEventListener(
        "resize",
        function () {

            if (
                window.innerWidth > 850
            ) {

                sidebar.classList.remove(
                    "mobile-open"
                );

                sidebarOverlay.classList.remove(
                    "active"
                );

            }

        }
    );


    /* =====================================================
       USERS & ROLES (admin only)
    ===================================================== */

    (async function initUsersTab() {

        if (typeof Permissions !== "undefined") {
            await Permissions.ensureLoaded().catch(function () {});
        }

        var usersTabBtn = document.getElementById("usersTabBtn");
        var usersSection = document.getElementById("users");
        var isAdmin = typeof Permissions !== "undefined" && Permissions.can("users", "view");

        if (!isAdmin) {
            if (usersTabBtn) usersTabBtn.remove();
            if (usersSection) usersSection.remove();
            return;
        }

        usersTabBtn.style.display = "";

        var session = (typeof Auth !== "undefined" && Auth.getSession()) || {};
        var currentUserEmail = session.email;

        var usersTableBody = document.getElementById("usersTableBody");
        var usersErrorEl = document.getElementById("usersError");
        var roleMatrixContainer = document.getElementById("roleMatrixContainer");
        var addUserBtn = document.getElementById("addUserBtn");

        var userModal = document.getElementById("userModal");
        var userModalTitle = document.getElementById("userModalTitle");
        var userModalError = document.getElementById("userModalError");
        var userModalName = document.getElementById("userModalName");
        var userModalEmail = document.getElementById("userModalEmail");
        var userModalPassword = document.getElementById("userModalPassword");
        var userModalPasswordGroup = document.getElementById("userModalPasswordGroup");
        var userModalRole = document.getElementById("userModalRole");
        var userModalSave = document.getElementById("userModalSave");

        var deleteUserModal = document.getElementById("deleteUserModal");
        var deleteUserNameEl = document.getElementById("deleteUserName");
        var deleteUserModalConfirm = document.getElementById("deleteUserModalConfirm");

        var roles = [];        // [{key, label}]
        var editingEmail = null;
        var pendingDeleteEmail = null;

        function escapeHtml(value) {
            return String(value == null ? "" : value)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function showUsersError(message) {
            usersErrorEl.textContent = message;
            usersErrorEl.style.display = "block";
        }

        function roleLabelFor(rawRole) {
            var match = roles.find(function (r) {
                return r.label.toLowerCase() === String(rawRole || "").toLowerCase() ||
                       r.key.toLowerCase() === String(rawRole || "").toLowerCase();
            });
            return match ? match.label : (rawRole || "\u2014");
        }

        async function loadRoles() {
            try {
                roles = await CareFlowAPI.request("/permissions/roles");
                userModalRole.innerHTML = roles.map(function (r) {
                    return '<option value="' + escapeHtml(r.key) + '">' + escapeHtml(r.label) + "</option>";
                }).join("");
            } catch (error) {
                roles = [];
                console.error("[Settings] Failed to load roles:", error);
            }
        }

        async function loadUsers() {
            usersTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">Loading users\u2026</td></tr>';
            try {
                var users = await CareFlowAPI.request("/users");
                if (!users.length) {
                    usersTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No users yet.</td></tr>';
                    return;
                }
                usersTableBody.innerHTML = users.map(function (u) {
                    var isSelf = u.email === currentUserEmail;
                    var isActive = u.is_active !== false;
                    return (
                        "<tr>" +
                        "<td>" + escapeHtml(u.name) + (isSelf ? ' <span class="badge badge-neutral" style="margin-left:0.4rem;">You</span>' : "") + "</td>" +
                        "<td>" + escapeHtml(u.email) + "</td>" +
                        "<td>" + escapeHtml(roleLabelFor(u.role)) + "</td>" +
                        "<td>" + (isActive
                            ? '<span class="badge badge-success">Active</span>'
                            : '<span class="badge badge-neutral">Deactivated</span>') + "</td>" +
                        '<td style="white-space:nowrap;">' +
                            '<button type="button" class="btn btn-sm btn-outline-primary" data-edit-user="' + escapeHtml(u.email) + '" title="Edit"><i class="fa-solid fa-pen"></i></button> ' +
                            (isSelf ? "" :
                                '<button type="button" class="btn btn-sm ' + (isActive ? 'btn-outline-danger' : 'btn-outline-primary') + '" data-toggle-active="' + escapeHtml(u.email) + '" data-next-active="' + (!isActive) + '" title="' + (isActive ? 'Deactivate' : 'Reactivate') + '"><i class="fa-solid ' + (isActive ? 'fa-user-slash' : 'fa-user-check') + '"></i></button> ' +
                                '<button type="button" class="btn btn-sm btn-danger" data-delete-user="' + escapeHtml(u.email) + '" title="Remove"><i class="fa-solid fa-trash"></i></button>') +
                        "</td>" +
                        "</tr>"
                    );
                }).join("");
            } catch (error) {
                usersTableBody.innerHTML = "";
                showUsersError(error.message || "Could not load users.");
            }
        }

        async function loadMatrix() {
            try {
                var data = await CareFlowAPI.request("/permissions/matrix");
                var moduleNames = Object.keys(data.modules);
                var html = '<table class="data-table"><thead><tr><th>Module</th>';
                data.roles.forEach(function (r) { html += "<th>" + escapeHtml(r.label) + "</th>"; });
                html += "</tr></thead><tbody>";
                moduleNames.forEach(function (moduleName) {
                    html += "<tr><td style=\"text-transform:capitalize;\">" + escapeHtml(moduleName.replace("-", " ")) + "</td>";
                    data.roles.forEach(function (r) {
                        var actions = data.modules[moduleName][r.key] || [];
                        html += '<td style="font-size:0.78rem;color:var(--text-muted);">' + (actions.length ? actions.map(function(a){return a.charAt(0).toUpperCase();}).join(" ") : "\u2014") + "</td>";
                    });
                    html += "</tr>";
                });
                html += "</tbody></table>";
                html += '<p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.5rem;">V = View, C = Create, E = Edit, D = Delete/Archive.</p>';
                roleMatrixContainer.innerHTML = html;
            } catch (error) {
                roleMatrixContainer.innerHTML = '<p style="color:var(--text-muted);">Could not load the permission matrix.</p>';
            }
        }

        function openUserModal(user) {
            userModalError.style.display = "none";
            if (user) {
                editingEmail = user.email;
                userModalTitle.textContent = "Edit User";
                userModalName.value = user.name || "";
                userModalEmail.value = user.email || "";
                userModalEmail.disabled = true;
                userModalPasswordGroup.style.display = "none";
                var matched = roles.find(function (r) { return r.label.toLowerCase() === String(user.role || "").toLowerCase() || r.key.toLowerCase() === String(user.role || "").toLowerCase(); });
                userModalRole.value = matched ? matched.key : (roles[0] ? roles[0].key : "");
            } else {
                editingEmail = null;
                userModalTitle.textContent = "Add User";
                userModalName.value = "";
                userModalEmail.value = "";
                userModalEmail.disabled = false;
                userModalPassword.value = "";
                userModalPasswordGroup.style.display = "";
                userModalRole.value = roles[0] ? roles[0].key : "";
            }
            userModal.classList.add("active");
            setTimeout(function () { userModalName.focus(); }, 100);
        }

        function closeUserModal() {
            userModal.classList.remove("active");
        }

        async function saveUser() {
            userModalError.style.display = "none";
            var name = userModalName.value.trim();
            var email = userModalEmail.value.trim();
            var role = userModalRole.value;

            if (!name) { userModalError.textContent = "Name is required."; userModalError.style.display = "block"; return; }

            userModalSave.disabled = true;
            userModalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            try {
                if (editingEmail) {
                    await CareFlowAPI.request("/users/" + encodeURIComponent(editingEmail), {
                        method: "PUT", body: JSON.stringify({ name: name, role: role })
                    });
                } else {
                    var password = userModalPassword.value;
                    if (!email) { throw new Error("Email is required."); }
                    if (password.length < 8) { throw new Error("Password must be at least 8 characters (with uppercase, lowercase, and a number)."); }
                    await CareFlowAPI.request("/users", {
                        method: "POST", body: JSON.stringify({ email: email, password: password, name: name, role: role })
                    });
                }
                closeUserModal();
                await loadUsers();
            } catch (error) {
                userModalError.textContent = error.message || "Could not save this user.";
                userModalError.style.display = "block";
            } finally {
                userModalSave.disabled = false;
                userModalSave.innerHTML = '<i class="fa-solid fa-check"></i> Save';
            }
        }

        addUserBtn.addEventListener("click", function () { openUserModal(null); });
        document.getElementById("userModalClose").addEventListener("click", closeUserModal);
        document.getElementById("userModalCancel").addEventListener("click", closeUserModal);
        userModalSave.addEventListener("click", saveUser);

        document.getElementById("deleteUserModalClose").addEventListener("click", function () { deleteUserModal.classList.remove("active"); });
        document.getElementById("deleteUserModalCancel").addEventListener("click", function () { deleteUserModal.classList.remove("active"); });
        deleteUserModalConfirm.addEventListener("click", async function () {
            if (!pendingDeleteEmail) return;
            deleteUserModalConfirm.disabled = true;
            try {
                await CareFlowAPI.request("/users/" + encodeURIComponent(pendingDeleteEmail), { method: "DELETE" });
                deleteUserModal.classList.remove("active");
                await loadUsers();
            } catch (error) {
                alert(error.message || "Could not remove this user.");
            } finally {
                deleteUserModalConfirm.disabled = false;
            }
        });

        usersTableBody.addEventListener("click", async function (event) {
            var editBtn = event.target.closest("[data-edit-user]");
            var deleteBtn = event.target.closest("[data-delete-user]");
            var toggleBtn = event.target.closest("[data-toggle-active]");
            if (editBtn) {
                var email = editBtn.getAttribute("data-edit-user");
                try {
                    var users = await CareFlowAPI.request("/users");
                    var user = users.find(function (u) { return u.email === email; });
                    if (user) openUserModal(user);
                } catch (error) {
                    showUsersError(error.message || "Could not load this user.");
                }
            }
            if (deleteBtn) {
                pendingDeleteEmail = deleteBtn.getAttribute("data-delete-user");
                deleteUserNameEl.textContent = pendingDeleteEmail;
                deleteUserModal.classList.add("active");
            }
            if (toggleBtn) {
                var toggleEmail = toggleBtn.getAttribute("data-toggle-active");
                var nextActive = toggleBtn.getAttribute("data-next-active") === "true";
                var confirmMsg = nextActive
                    ? "Reactivate " + toggleEmail + "?"
                    : "Deactivate " + toggleEmail + "? They will be signed out immediately and unable to log in until reactivated.";
                if (!window.confirm(confirmMsg)) return;
                toggleBtn.disabled = true;
                try {
                    await CareFlowAPI.request("/users/" + encodeURIComponent(toggleEmail), {
                        method: "PUT", body: JSON.stringify({ is_active: nextActive })
                    });
                    await loadUsers();
                } catch (error) {
                    showUsersError(error.message || "Could not update this user's status.");
                    toggleBtn.disabled = false;
                }
            }
        });

        await loadRoles();
        await Promise.all([loadUsers(), loadMatrix()]);
    })();

});
