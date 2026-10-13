/* ============================================
   CAREFLOW AI - DASHBOARD MODULE
   KPI Cards, Recent Patients, Appointments Table
   ------------------------------------------------
   Always loads the latest patients / appointments /
   lab reports straight from the backend (instead of
   the login-time cache) and keeps refreshing itself
   while the page stays open, so the dashboard reflects
   real-time changes (from other staff or the AI
   assistant) without needing a manual reload.
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {
  if (!Auth.requireAuth()) return;

  var REFRESH_INTERVAL_MS = 20000; // keep the dashboard live while it's left open
  var latestNotifications = [];

  /* ---- Date / status helpers ----
     "Today" must be the user's LOCAL calendar day. new Date().toISOString()
     is UTC, which is still "yesterday" for the first hours of the day in
     India (UTC+5:30) and made today's numbers wrong. */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function localDateString(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function addDays(dateString, days) {
    var p = dateString.split('-');
    return localDateString(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + days));
  }
  function isActivePatient(p) { return p && p.status !== 'Discharged' && !p.isArchived; }
  function isAlertPatient(p) { return isActivePatient(p) && (p.severity === 'Critical' || p.severity === 'High'); }
  function isOpenAppointment(a) { return a.status !== 'Completed' && a.status !== 'Cancelled'; }

  function timeToMinutes(value) {
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(value || '').trim());
    if (!m) return 24 * 60;
    var h = Number(m[1]);
    var mer = m[3] ? m[3].toUpperCase() : '';
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    return h * 60 + Number(m[2]);
  }
  function formatTime(value) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());   // 24h "17:41" -> "5:41 PM"
    if (!m) return String(value || '');
    var h = Number(m[1]);
    return ((h % 12) || 12) + ':' + m[2] + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function formatDay(dateString, today) {
    if (dateString === today) return 'Today';
    if (dateString === addDays(today, 1)) return 'Tomorrow';
    var p = String(dateString || '').split('-');
    if (p.length !== 3) return String(dateString || '');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
      .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function upcomingFromList(appointments, today) {
    return appointments.filter(function(a) { return a.date >= today && isOpenAppointment(a); })
      .sort(function(x, y) {
        return String(x.date).localeCompare(String(y.date)) || (timeToMinutes(x.time) - timeToMinutes(y.time));
      });
  }
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderNotifications(patients, labReports) {
    var list = document.getElementById('notificationList');
    var dot = document.getElementById('notificationDot');
    if (!list || !dot) return;

    var dismissed = Storage.get('dismissed_notifications', []);
    if (!Array.isArray(dismissed)) dismissed = [];
    var alerts = [];

    patients.filter(isAlertPatient).forEach(function(patient) {
      alerts.push({
        id: 'patient-' + patient.id,
        icon: patient.severity === 'Critical' ? 'fa-triangle-exclamation' : 'fa-user-clock',
        tone: patient.severity === 'Critical' ? 'critical' : 'warning',
        title: patient.severity + ' priority: ' + (patient.name || patient.id),
        detail: 'Triage ' + (patient.triageScore == null ? 'N/A' : patient.triageScore) + ' • ' + (patient.status || 'Status unavailable'),
        href: 'patient-details.html?id=' + encodeURIComponent(patient.id)
      });
    });
    labReports.filter(function(report) { return report.status === 'Abnormal'; }).forEach(function(report) {
      alerts.push({
        id: 'lab-' + report.id,
        icon: 'fa-flask', tone: 'warning',
        title: 'Abnormal lab result: ' + (report.patientName || report.patientId || report.id),
        detail: report.test || 'Lab report needs review',
        href: 'lab-reports.html'
      });
    });

    latestNotifications = alerts;
    var activeAlerts = alerts.filter(function(alert) { return dismissed.indexOf(alert.id) === -1; });
    dot.hidden = activeAlerts.length === 0;
    list.innerHTML = '';
    if (!activeAlerts.length) {
      list.innerHTML = '<p class="notification-empty">You are all caught up.</p>';
      return;
    }
    activeAlerts.forEach(function(alert) {
      var link = document.createElement('a');
      link.className = 'notification-item ' + alert.tone;
      link.href = alert.href;
      link.innerHTML = '<i class="fa-solid ' + alert.icon + '"></i><span><strong>' + escapeHtml(alert.title) + '</strong><small>' + escapeHtml(alert.detail) + '</small></span>';
      list.appendChild(link);
    });
  }

  document.addEventListener('careflow:notifications-cleared', function() {
    Storage.set('dismissed_notifications', latestNotifications.map(function(alert) { return alert.id; }));
    renderNotifications(
      CareFlowAPI.getCached('patients') || [],
      CareFlowAPI.getCached('labReports') || []
    );
  });

  /* ---- Escape HTML Utility ---- */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ---- Load latest data from the backend ---- */
  async function loadDashboardData() {
    var patients;
    var appointments;
    var labReports;
    var analytics = null;

    try {
      patients = await CareFlowAPI.request('/patients');
      CareFlowAPI.setCached('patients', patients);
    } catch (error) {
      console.error('[Dashboard] Failed to load patients:', error);
      patients = CareFlowAPI.getCached('patients') || [];
    }

    try {
      appointments = await CareFlowAPI.request('/appointments');
      CareFlowAPI.setCached('appointments', appointments);
    } catch (error) {
      console.error('[Dashboard] Failed to load appointments:', error);
      appointments = CareFlowAPI.getCached('appointments') || [];
    }

    try {
      labReports = await CareFlowAPI.request('/lab-reports');
      CareFlowAPI.setCached('labReports', labReports);
    } catch (error) {
      console.error('[Dashboard] Failed to load lab reports:', error);
      labReports = CareFlowAPI.getCached('labReports') || [];
    }

    // Server-side aggregation (real DB counts - see app/routers/dashboard.py).
    // Used for the stat cards and charts so the numbers match the true
    // database state even when the lists above are paginated. If this
    // call fails for any reason, the stat cards/charts below fall back to
    // counting the (possibly paginated) lists already fetched - still
    // real data, never randomized or seeded.
    try {
      analytics = await CareFlowAPI.request('/dashboard/analytics?today=' + encodeURIComponent(localDateString()));
    } catch (error) {
      console.error('[Dashboard] Failed to load analytics:', error);
      analytics = null;
    }

    renderDashboard(patients, appointments, labReports, analytics);
  }

  /* ---- Render everything from the given data ---- */
  function renderDashboard(patients, appointments, labReports, analytics) {
    var today = localDateString();
    var pat = analytics && analytics.patients;
    var appt = analytics && analytics.appointments;
    var labs = analytics && analytics.labs;

    renderNotifications(patients, labReports);
    renderCharts(patients, appointments, analytics);

    /* Every number below is real data. Prefer the server-side counts (right
       even when the lists are paginated) and fall back to counting the lists
       already loaded if the analytics call failed. */
    var alertPatients = patients.filter(isAlertPatient);
    var activeCount = patients.filter(isActivePatient).length;

    var totalPatientsCount = pat ? pat.total : patients.length;
    var todaysAppointmentsCount = appt ? appt.today
      : appointments.filter(function(a) { return a.date === today && a.status !== 'Cancelled'; }).length;
    var criticalAlertsCount = pat ? pat.alerts : alertPatients.length;
    var pendingReportsCount = labs ? labs.pending
      : labReports.filter(function(r) { return !r.documentFilename; }).length;

    setText('totalPatients', totalPatientsCount);
    setText('todaysAppointments', todaysAppointmentsCount);
    setText('criticalAlerts', criticalAlertsCount);
    setText('pendingReports', pendingReportsCount);

    /* Sub-lines under each number (previously hard-coded placeholder text) */
    var activePatients = pat ? pat.active : activeCount;
    var dischargedPatients = pat ? pat.discharged : (patients.length - activeCount);
    setText('totalPatientsNote', activePatients + ' active \u00b7 ' + dischargedPatients + ' discharged');

    var weekTotal = appt ? appt.next_7_days_total
      : appointments.filter(function(a) { return a.date >= today && a.date <= addDays(today, 6) && a.status !== 'Cancelled'; }).length;
    var laterThisWeek = Math.max(0, weekTotal - todaysAppointmentsCount);
    setText('todaysAppointmentsNote', laterThisWeek > 0
      ? laterThisWeek + ' more in the next 7 days'
      : (todaysAppointmentsCount > 0 ? 'None after today this week' : 'Nothing scheduled this week'));

    var alertCritical = pat ? pat.alerts_critical : alertPatients.filter(function(p) { return p.severity === 'Critical'; }).length;
    var alertHigh = pat ? pat.alerts_high : alertPatients.filter(function(p) { return p.severity === 'High'; }).length;
    setText('criticalAlertsNote', criticalAlertsCount > 0
      ? alertCritical + ' critical \u00b7 ' + alertHigh + ' high priority'
      : 'No active alerts');

    var abnormalCount = labs ? labs.abnormal : labReports.filter(function(r) { return r.status === 'Abnormal'; }).length;
    setText('pendingReportsNote', pendingReportsCount === 0
      ? 'All reports uploaded'
      : (abnormalCount > 0 ? abnormalCount + ' with abnormal results' : 'Awaiting document upload'));

    /* Update Patient Count Badge */
    var patientCountBadge = document.getElementById('patientCountBadge');
    if (patientCountBadge) patientCountBadge.textContent = totalPatientsCount;

    /* Populate Recent Patients Grid */
    var recentPatientsContainer = document.getElementById('recentPatients');
    if (recentPatientsContainer) {
      recentPatientsContainer.innerHTML = '';

      /* Priority queue: patients still in care, most severe first, then by
         triage score - not simply the first four rows (which put a
         discharged patient at the top). */
      var severityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      var displayPatients = patients.filter(isActivePatient).sort(function(x, y) {
        var rx = severityRank[x.severity] == null ? 4 : severityRank[x.severity];
        var ry = severityRank[y.severity] == null ? 4 : severityRank[y.severity];
        return (rx - ry) || ((y.triageScore || 0) - (x.triageScore || 0));
      }).slice(0, 4);

      if (!displayPatients.length) {
        recentPatientsContainer.innerHTML = '<p class="dash-empty-cell">No patients currently in the queue.</p>';
      }

      displayPatients.forEach(function(p) {
        var severity = p.severity || 'Medium';
        var severityClass = 'severity-' + severity.toLowerCase();
        if (severity === 'Critical') severityClass = 'severity-critical';
        else if (severity === 'High') severityClass = 'severity-high';
        else if (severity === 'Medium') severityClass = 'severity-medium';
        else if (severity === 'Low') severityClass = 'severity-low';

        var badgeClass = 'badge-neutral';
        if (severity === 'Critical') badgeClass = 'badge-danger';
        else if (severity === 'High') badgeClass = 'badge-warning';
        else if (severity === 'Low') badgeClass = 'badge-success';

        var name = p.name || 'Unknown Patient';
        var symptoms = Array.isArray(p.symptoms) ? p.symptoms : [];
        var initials = name.split(' ').filter(Boolean).map(function(n) { return n[0]; }).join('');

        var card = document.createElement('div');
        card.className = 'patient-card priority-' + severity.toLowerCase();

        card.innerHTML =
          '<div class="patient-card-badge">' +
            '<span class="badge ' + badgeClass + ' badge-dot">' + escapeHtml(severity) + '</span>' +
          '</div>' +
          '<div class="patient-card-header">' +
            '<div class="patient-card-avatar" style="background:' + escapeHtml(p.avatarBg || '#4f46e5') + '">' + escapeHtml(initials) + '</div>' +
            '<div class="patient-card-info">' +
              '<div class="patient-card-name">' + escapeHtml(name) + '</div>' +
              '<div class="patient-card-mrn">' + escapeHtml(p.mrn) + ' | ' + escapeHtml(p.gender) + ', ' + escapeHtml(p.age) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="patient-card-body">' +
            '<div class="patient-card-detail">' +
              '<span class="patient-card-detail-label">Chief Complaint</span>' +
              '<span class="patient-card-detail-value">' + escapeHtml(symptoms[0] || '\u2014') + '</span>' +
            '</div>' +
            '<div class="patient-card-detail">' +
              '<span class="patient-card-detail-label">Triage Score</span>' +
              '<span class="patient-card-detail-value font-semibold">' + escapeHtml(p.triageScore != null ? p.triageScore : '\u2014') + '/10</span>' +
            '</div>' +
          '</div>' +
          '<div class="patient-card-symptoms">' +
            symptoms.map(function(s) {
              return '<span class="symptom-tag ' + severityClass + '">' + escapeHtml(s) + '</span>';
            }).join('') +
          '</div>' +
          '<div class="patient-card-footer">' +
            '<span class="patient-card-time"><i class="fa-regular fa-clock"></i> ' + escapeHtml(p.status) + '</span>' +
            '<a href="patient-details.html?id=' + encodeURIComponent(p.id) + '" class="btn btn-sm btn-primary">View</a>' +
          '</div>';

        recentPatientsContainer.appendChild(card);
      });
    }

    renderActivity(patients, appointments, labReports, today);

    /* Populate Upcoming Appointments (today onward, not completed/cancelled) */
    var appointmentsTableBody = document.getElementById('appointmentsTableBody');
    if (appointmentsTableBody) {
      appointmentsTableBody.innerHTML = '';

      var displayAppointments = (appt && Array.isArray(appt.upcoming))
        ? appt.upcoming
        : upcomingFromList(appointments, today).slice(0, 5);

      if (!displayAppointments.length) {
        var emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="6" class="dash-empty-cell">No upcoming appointments. ' +
          '<a href="appointments.html">Schedule one</a></td>';
        appointmentsTableBody.appendChild(emptyRow);
      }

      displayAppointments.forEach(function(a) {
        var patient = patients.find(function(p) { return p.id === a.patientId; });
        var avatarBg = patient ? patient.avatarBg : '#64748b';
        var patientName = a.patientName || (patient ? patient.name : 'Unknown Patient');
        var initials = patientName.split(' ').filter(Boolean).map(function(n) { return n[0]; }).join('');

        var statusClass = 'pending';
        if (a.status === 'In Progress' || a.status === 'Checked In') statusClass = 'active';

        /* eye button and the row both open this appointment on the Appointments page */
        var target = 'appointments.html?id=' + encodeURIComponent(a.id);

        var row = document.createElement('tr');
        row.className = 'dash-appt-row';
        row.innerHTML =
          '<td>' +
            '<div class="table-patient">' +
              '<div class="table-patient-avatar" style="background:' + escapeHtml(avatarBg) + '">' + escapeHtml(initials) + '</div>' +
              '<div class="table-patient-name">' + escapeHtml(patientName) + '</div>' +
            '</div>' +
          '</td>' +
          '<td><span class="badge badge-primary">' + escapeHtml(a.type) + '</span></td>' +
          '<td><span class="status-indicator ' + statusClass + '">' + escapeHtml(a.status) + '</span></td>' +
          '<td>' + escapeHtml(formatDay(a.date, today)) + ', ' + escapeHtml(formatTime(a.time)) + '</td>' +
          '<td>' + escapeHtml(a.doctor) + '</td>' +
          '<td><a href="' + target + '" class="btn btn-sm btn-ghost" title="Open in Appointments" aria-label="Open appointment for ' + escapeHtml(patientName) + '"><i class="fa-solid fa-eye"></i></a></td>';

        row.addEventListener('click', function(event) {
          if (event.target.closest('a')) return;      // let the eye link work normally
          window.location.href = target;
        });

        appointmentsTableBody.appendChild(row);
      });
    }
  }

  /* ---- Recent Activity: built from real records (was a hard-coded list) ----
     Only dates are stored for these records, so entries show a date rather
     than an invented "x minutes ago". */
  function renderActivity(patients, appointments, labReports, today) {
    var list = document.getElementById('activityList');
    if (!list) return;

    var items = [];
    patients.forEach(function(p) {
      if (!p.admissionDate || p.admissionDate > today) return;
      var complaint = Array.isArray(p.symptoms) && p.symptoms[0] ? ' with ' + String(p.symptoms[0]).toLowerCase() : '';
      items.push({
        date: p.admissionDate,
        tone: p.severity === 'Critical' ? 'critical' : (p.severity === 'High' ? 'warning' : 'info'),
        html: '<strong>' + escapeHtml(p.name) + '</strong> admitted' + escapeHtml(complaint)
      });
    });
    appointments.forEach(function(a) {
      if (!a.date || a.date > today) return;
      items.push({
        date: a.date,
        tone: a.status === 'Completed' ? 'success' : (a.status === 'Cancelled' ? 'critical' : 'info'),
        html: escapeHtml(a.type || 'Appointment') + ' appointment for <strong>' + escapeHtml(a.patientName) + '</strong> \u2014 ' + escapeHtml(a.status)
      });
    });
    labReports.forEach(function(r) {
      if (!r.date || r.date > today) return;
      var uploaded = !!r.documentFilename;
      items.push({
        date: r.date,
        tone: r.status === 'Abnormal' ? 'warning' : 'info',
        html: escapeHtml(r.test) + ' for <strong>' + escapeHtml(r.patientName) + '</strong> \u2014 ' + (uploaded ? 'report uploaded' : 'report pending')
      });
    });

    items.sort(function(x, y) { return String(y.date).localeCompare(String(x.date)); });
    items = items.slice(0, 5);

    if (!items.length) {
      list.innerHTML = '<li class="activity-empty">No recent activity yet.</li>';
      return;
    }
    list.innerHTML = items.map(function(item) {
      return '<li class="activity-item"><span class="activity-dot ' + item.tone + '"></span>' +
        '<div class="activity-content"><div class="activity-text">' + item.html + '</div>' +
        '<div class="activity-time"><i class="fa-regular fa-clock"></i> ' + escapeHtml(formatDay(item.date, today)) + '</div></div></li>';
    }).join('');
  }

  /* ---- Charts (Chart.js) ---- */
  var severityChartInstance = null;
  var appointmentsChartInstance = null;

  function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  /* Shows/hides a "no data" message next to a chart canvas without ever
     substituting fake numbers into the chart itself. */
  function setChartEmptyState(canvas, show, message) {
    if (!canvas) return;
    var wrapper = canvas.parentElement;
    if (!wrapper) return;
    var empty = wrapper.querySelector('.chart-empty-state');
    if (show) {
      canvas.style.display = 'none';
      if (!empty) {
        empty = document.createElement('p');
        empty.className = 'chart-empty-state';
        empty.style.cssText = 'text-align:center;padding:2rem 1rem;color:var(--text-secondary,#64748b);font-size:0.9rem;';
        wrapper.appendChild(empty);
      }
      empty.textContent = message;
      empty.style.display = '';
    } else {
      canvas.style.display = '';
      if (empty) empty.style.display = 'none';
    }
  }

  function renderCharts(patients, appointments, analytics) {
    if (typeof Chart === 'undefined') return;

    var severityCanvas = document.getElementById('severityChart');
    var appointmentsCanvas = document.getElementById('appointmentsChart');
    var gridColor = isDarkTheme() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    var textColor = isDarkTheme() ? '#cbd5e1' : '#475569';

    /* -- Patients by Severity (Doughnut) -- */
    if (severityCanvas) {
      var severityCounts;
      if (analytics && analytics.patients) {
        // Server-computed, from real (unpaginated) DB counts.
        severityCounts = {
          Critical: analytics.patients.critical || 0,
          High: analytics.patients.high || 0,
          Medium: analytics.patients.medium || 0,
          Low: analytics.patients.low || 0
        };
      } else {
        // Fallback: count whatever page of patients we have client-side.
        severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        patients.forEach(function (p) {
          var s = p.severity;
          if (severityCounts[s] === undefined) severityCounts[s] = 0;
          severityCounts[s]++;
        });
      }

      var labels = Object.keys(severityCounts).filter(function (k) { return severityCounts[k] > 0; });
      var data = labels.map(function (k) { return severityCounts[k]; });
      var colorMap = {
        Critical: '#ef4444',
        High: '#f59e0b',
        Medium: '#3b82f6',
        Low: '#10b981'
      };

      if (severityChartInstance) severityChartInstance.destroy();

      if (!labels.length) {
        severityChartInstance = null;
        setChartEmptyState(severityCanvas, true, 'No patient data available yet.');
      } else {
        setChartEmptyState(severityCanvas, false);
        severityChartInstance = new Chart(severityCanvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: labels.map(function (l) { return colorMap[l] || '#94a3b8'; }),
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: textColor, boxWidth: 12, padding: 12 }
              }
            }
          }
        });
      }
    }

    /* -- Appointments over the NEXT 7 days, today first (Bar) -- */
    if (appointmentsCanvas) {
      var dayLabels = [];
      var counts = [];
      var todayString = localDateString();
      var todayIndex = 0;

      var days;
      if (analytics && analytics.appointments && Array.isArray(analytics.appointments.next_7_days)) {
        // Real per-day counts straight from the database (see
        // app/routers/dashboard.py); a day with none is 0, never filled in.
        days = analytics.appointments.next_7_days;
      } else {
        // Fallback: count the appointments already loaded.
        days = [];
        for (var i = 0; i < 7; i++) {
          var key = addDays(todayString, i);
          days.push({
            date: key,
            count: appointments.filter(function(a) { return a.date === key && a.status !== 'Cancelled'; }).length
          });
        }
      }

      days.forEach(function(day) {
        var p = day.date.split('-');
        var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        dayLabels.push(day.date === todayString ? 'Today' : dt.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + dt.getDate());
        counts.push(day.count);
      });

      if (appointmentsChartInstance) appointmentsChartInstance.destroy();

      var allZero = counts.every(function (count) { return count === 0; });
      if (allZero) {
        appointmentsChartInstance = null;
        setChartEmptyState(appointmentsCanvas, true, 'No appointments scheduled in the next 7 days.');
      } else {
        setChartEmptyState(appointmentsCanvas, false);
        appointmentsChartInstance = new Chart(appointmentsCanvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: dayLabels,
            datasets: [{
              label: 'Appointments',
              data: counts,
              backgroundColor: dayLabels.map(function (label) { return label === 'Today' ? '#4f46e5' : '#818cf8'; }),
              borderRadius: 6,
              maxBarThickness: 36
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: textColor } },
              y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: textColor }, grid: { color: gridColor } }
            }
          }
        });
      }
    }
  }

  /* ---- Initial load ---- */
  loadDashboardData();

  /* Charts pick their grid/text colours from the theme when drawn - redraw
     when the theme is toggled so they don't stay in the old colours. */
  new MutationObserver(function() { loadDashboardData(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---- Keep the dashboard live while it stays open ---- */
  setInterval(loadDashboardData, REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) loadDashboardData();
  });
  window.addEventListener('focus', loadDashboardData);
});
