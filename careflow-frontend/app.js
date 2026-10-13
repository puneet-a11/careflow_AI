/* ============================================
   CAREFLOW AI - GLOBAL APP LOGIC
   Sidebar, Header, Theme, Navigation
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {
  /* ---- Require Authentication ---- */
  var isLoginPage = window.location.pathname.indexOf('login.html') > -1;
  if (!isLoginPage && !Auth.requireAuth()) {
    return;
  }

  /* ---- Set User Info ---- */
  var userName = Auth.getUserName();
  var userAvatar = Auth.getUserAvatar();
  var userRole = Auth.getUserRole();

  var sidebarName = document.getElementById('sidebarUserName');
  if (sidebarName) sidebarName.textContent = userName;

  var sidebarRole = document.getElementById('sidebarUserRole');
  if (sidebarRole) sidebarRole.textContent = userRole;

  var headerName = document.getElementById('headerUserName');
  if (headerName) headerName.textContent = userName;

  var headerRole = document.getElementById('headerUserRole');
  if (headerRole) headerRole.textContent = userRole;

  var welcomeName = document.getElementById('welcomeName');
  if (welcomeName) welcomeName.textContent = userName.split(' ').pop();

  var headerAvatar = document.querySelector('.header-user-avatar');
  if (headerAvatar) headerAvatar.textContent = userAvatar;

  var sidebarAvatar = document.querySelector('.sidebar-footer-avatar');
  if (sidebarAvatar) sidebarAvatar.textContent = userAvatar;

  /* ---- Sidebar Toggle (Desktop) ---- */
  var sidebar = document.getElementById('sidebar');
  var toggleBtn = document.getElementById('sidebarToggle');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
      var icon = toggleBtn.querySelector('i');
      if (sidebar.classList.contains('collapsed')) {
        icon.className = 'fa-solid fa-chevron-right';
      } else {
        icon.className = 'fa-solid fa-chevron-left';
      }
    });
  }

  /* ---- SIDEBAR A11Y / DRAWER ----
     One helper pair so every close path (overlay click, nav click,
     Escape, resize back to desktop) goes through the SAME code and can
     never leave the page in a half-open state with a locked body. */
  var mobileBtn = document.getElementById('mobileMenuBtn');
  var overlay = document.getElementById('sidebarOverlay');

  function openDrawer() {
    if (!sidebar) return;
    sidebar.classList.add('mobile-open');
    if (overlay) overlay.classList.add('active');
    document.body.classList.add('sidebar-open');
    if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
    // Always clear the scroll lock, even if the drawer was never open -
    // a stuck `overflow:hidden` body was the "page won't scroll after
    // closing the menu" bug.
    document.body.classList.remove('sidebar-open');
    if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
  }

  if (mobileBtn && sidebar) {
    mobileBtn.setAttribute('aria-expanded', 'false');
    if (sidebar.id) mobileBtn.setAttribute('aria-controls', sidebar.id);
    mobileBtn.addEventListener('click', function() {
      if (sidebar.classList.contains('mobile-open')) closeDrawer();
      else openDrawer();
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeDrawer);
  }

  // Escape closes the drawer (only when it is actually open, so it does
  // not swallow Escape from modals on desktop).
  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      closeDrawer();
      if (mobileBtn) mobileBtn.focus();
    }
  });

  /* Full label as a native tooltip on every nav item, so nothing is ever
     unidentifiable when the rail is collapsed or a long label ellipsises.
     data-label also feeds the CSS tooltip for the collapsed rail. */
  if (sidebar) {
    var labelled = sidebar.querySelectorAll('.sidebar-nav-item');
    for (var li = 0; li < labelled.length; li++) {
      var textEl = labelled[li].querySelector('.nav-text');
      var label = textEl ? textEl.textContent.trim() : '';
      if (label) {
        labelled[li].setAttribute('data-label', label);
        if (!labelled[li].getAttribute('title')) {
          labelled[li].setAttribute('title', label);
        }
      }
    }
    var brandText = sidebar.querySelector('.sidebar-brand-text');
    if (brandText && !brandText.getAttribute('title')) {
      brandText.setAttribute('title', brandText.textContent.trim());
    }
  }

  // Selecting a menu item closes the mobile drawer (harmless no-op on
  // desktop, where the drawer classes are never applied in the first
  // place). Logout keeps its own confirm/redirect flow - this only
  // closes the drawer visually, it doesn't intercept the click.
  if (sidebar) {
    var navItems = sidebar.querySelectorAll('.sidebar-nav-item');
    for (var ni = 0; ni < navItems.length; ni++) {
      navItems[ni].addEventListener('click', function() {
        closeDrawer();
      });
    }
  }

  /* ---- Responsive Handler ---- */
  function handleResize() {
    if (window.innerWidth <= 1024) {
      if (mobileBtn) mobileBtn.style.display = 'flex';
      if (sidebar && !sidebar.classList.contains('mobile-open')) {
        closeDrawer();
      }
    } else {
      if (mobileBtn) mobileBtn.style.display = 'none';
      // Rotating back to desktop must always unlock the body and drop
      // the drawer/overlay state.
      closeDrawer();
    }
  }
  window.addEventListener('resize', handleResize);
  handleResize();

  /* ---- Theme Toggle ----
     Apply the saved theme to every page unconditionally, not just
     pages that happen to have a #themeToggle button. Previously this
     whole block was nested inside `if (themeToggle)`, so on any page
     without that button (e.g. add-patient.html) the saved dark/light
     preference was never applied and the page silently reset to
     light mode. */
  var currentTheme = Storage.get('theme', 'light');
  document.documentElement.setAttribute('data-theme', currentTheme);

  var themeToggle = document.getElementById('themeToggle');

  function updateThemeIcon(theme) {
    if (!themeToggle) return;
    var icon = themeToggle.querySelector('i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
  }

  if (themeToggle) {
    updateThemeIcon(currentTheme);

    themeToggle.addEventListener('click', function() {
      var newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      Storage.set('theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }

  /* ---- Dark Mode Toggle on Settings Page ---- */
  var darkModeToggle = document.getElementById('darkModeSwitch');
  if (darkModeToggle) {
    darkModeToggle.checked = (document.documentElement.getAttribute('data-theme') === 'dark');
    darkModeToggle.addEventListener('change', function() {
      var newTheme = darkModeToggle.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      Storage.set('theme', newTheme);
      if (themeToggle) {
        updateThemeIcon(newTheme);
      }
    });
  }

  /* ---- Logout Handler ---- */
  var logoutBtns = document.querySelectorAll('#logoutBtn');
  logoutBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      Auth.logout();
      window.location.href = 'login.html';
    });
  });

  /* ---- Dashboard Notifications ---- */
  var notificationBtn = document.getElementById('notificationBtn');
  var notificationMenu = document.getElementById('notificationMenu');
  var clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
  if (notificationBtn && notificationMenu) {
    notificationBtn.addEventListener('click', function(event) {
      event.stopPropagation();
      var willOpen = notificationMenu.hidden;
      notificationMenu.hidden = !willOpen;
      notificationBtn.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', function(event) {
      if (!notificationMenu.hidden && !notificationMenu.contains(event.target)) {
        notificationMenu.hidden = true;
        notificationBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        notificationMenu.hidden = true;
        notificationBtn.setAttribute('aria-expanded', 'false');
      }
    });
    if (clearNotificationsBtn) {
      clearNotificationsBtn.addEventListener('click', function() {
        document.dispatchEvent(new CustomEvent('careflow:notifications-cleared'));
      });
    }
  }

  /* ---- AI Chat Widget (Floating) ---- */
  var chatFab = document.getElementById('chatFab');
  var chatPanel = document.getElementById('aiChatPanel');
  var chatPanelClose = document.getElementById('chatPanelClose');

  if (chatFab && chatPanel) {
    chatFab.addEventListener('click', function() {
      chatPanel.classList.toggle('open');
      var badge = chatFab.querySelector('.fab-badge');
      if (badge) badge.style.display = 'none';
    });

    if (chatPanelClose) {
      chatPanelClose.addEventListener('click', function() {
        chatPanel.classList.remove('open');
      });
    }

    var chatInput = document.getElementById('chatInput');
    var chatSendBtn = document.getElementById('chatSendBtn');
    var chatMessages = document.getElementById('chatMessages');
    var chatStatus = document.getElementById('chatStatus');
    var dashboardChatClear = document.getElementById('dashboardChatClear');

    if (chatSendBtn && chatInput && chatMessages) {
      var chatQuickReplies = chatMessages.querySelector('.ai-chat-quick-replies');

      function appendChatMessage(text, sender, extraClass) {
        var message = document.createElement('div');
        message.className = 'ai-chat-message ' + sender + (extraClass ? ' ' + extraClass : '');
        message.innerHTML = '<div class="ai-chat-message-avatar"><i class="fa-solid ' +
          (sender === 'user' ? 'fa-user' : 'fa-robot') +
          '"></i></div><div class="ai-chat-bubble">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>';
        if (chatQuickReplies) chatMessages.insertBefore(message, chatQuickReplies);
        else chatMessages.appendChild(message);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return message;
      }

      function setChatBusy(isBusy) {
        chatSendBtn.disabled = isBusy;
        chatInput.disabled = isBusy;
      }

      function setChatStatus(text, isError) {
        if (!chatStatus) return;
        chatStatus.textContent = text;
        chatStatus.classList.toggle('is-error', Boolean(isError));
      }

      async function sendChatMessage(text) {
        if (!text || !text.trim()) return;
        text = text.trim();
        appendChatMessage(text, 'user');
        chatInput.value = '';
        setChatBusy(true);
        setChatStatus('CareFlow is thinking…');
        var typingMessage = appendChatMessage('Thinking…', 'bot', 'is-typing');

        try {
          // Dashboard chat is intentionally isolated from the full AI
          // Assistant's context and saved transcript.
          var result = await CareFlowAPI.chat(text, 'dashboard');
          typingMessage.remove();
          appendChatMessage(result && result.response ? result.response : 'The assistant did not return a response.', 'bot');
          setChatStatus('Connected – Triage support');
        } catch (error) {
          typingMessage.remove();
          appendChatMessage(error.message || 'Unable to contact the AI assistant. Please ensure the backend is running.', 'bot');
          setChatStatus('Backend unavailable', true);
        } finally {
          setChatBusy(false);
          chatInput.focus();
        }
      }

      if (dashboardChatClear) {
        dashboardChatClear.addEventListener('click', async function() {
          if (!window.confirm('Delete this chat history? This cannot be undone.')) return;
          dashboardChatClear.disabled = true;
          try {
            await CareFlowAPI.deleteChatHistory();
            chatMessages.querySelectorAll('.ai-chat-message').forEach(function(message) { message.remove(); });
            setChatStatus('Connected – Triage support');
          } catch (error) {
            alert(error.message || 'Could not delete chat history.');
          } finally {
            dashboardChatClear.disabled = false;
          }
        });
      }

      chatSendBtn.addEventListener('click', function() {
        sendChatMessage(chatInput.value);
      });

      chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendChatMessage(chatInput.value);
        }
      });

      setChatStatus('Connected – Triage support');
    }

    var chatChips = document.querySelectorAll('.ai-chat-chip');
    chatChips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        var reply = chip.getAttribute('data-reply');
        if (chatInput && reply) {
          sendChatMessage(reply);
        }
      });
    });
  }

  /* ---- Escape HTML Utility ---- */
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ---- Table Sorting (Generic) ---- */
  document.querySelectorAll('.data-table th.sortable').forEach(function(th) {
    th.addEventListener('click', function() {
      var table = th.closest('table');
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var rows = Array.from(tbody.querySelectorAll('tr'));
      var index = Array.from(th.parentNode.children).indexOf(th);
      var isAsc = th.classList.contains('sorted-asc');

      table.querySelectorAll('th').forEach(function(h) {
        h.classList.remove('sorted-asc', 'sorted-desc');
      });

      if (isAsc) {
        th.classList.add('sorted-desc');
      } else {
        th.classList.add('sorted-asc');
      }

      rows.sort(function(a, b) {
        var aVal = (a.children[index] && a.children[index].textContent) ? a.children[index].textContent.trim() : '';
        var bVal = (b.children[index] && b.children[index].textContent) ? b.children[index].textContent.trim() : '';
        var comparison = aVal.localeCompare(bVal, undefined, { numeric: true });
        return isAsc ? -comparison : comparison;
      });

      rows.forEach(function(row) {
        tbody.appendChild(row);
      });
    });
  });

  /* ---- Tabs ---- */
  document.querySelectorAll('.tab-item').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var parent = tab.parentElement;
      if (!parent) return;
      parent.querySelectorAll('.tab-item').forEach(function(t) {
        t.classList.remove('active');
      });
      tab.classList.add('active');
      var tabName = tab.getAttribute('data-tab');
      if (typeof window.filterAppointmentsByTab === 'function') {
        window.filterAppointmentsByTab(tabName);
      }
    });
  });

  /* ============================================
     GLOBAL SEARCH (Ctrl/Cmd + K)
     Only present on pages where the header search
     wasn't already wired to a local list filter
     (Dashboard, Patients, Doctors, Departments).
     Searches across patients, doctors, appointments
     and prescriptions using the data already cached
     by CareFlowAPI at login/hydrate.
     ============================================ */
  (function () {
    var searchInput = document.getElementById('globalSearchInput');
    var resultsPanel = document.getElementById('globalSearchResults');
    if (!searchInput || !resultsPanel) return;

    var DEBOUNCE_MS = 200;
    var debounceTimer = null;
    var activeIndex = -1;
    var currentItems = [];

    function esc(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function getCache(name) {
      try {
        return (window.CareFlowAPI && CareFlowAPI.getCached(name)) || [];
      } catch (e) {
        return [];
      }
    }

    function buildResults(term) {
      term = term.toLowerCase().trim();
      var groups = [];

      var patients = getCache('patients').filter(function (p) {
        return (String(p.name || '').toLowerCase().indexOf(term) > -1) ||
               (String(p.mrn || '').toLowerCase().indexOf(term) > -1);
      }).slice(0, 5).map(function (p) {
        return {
          icon: 'fa-user-injured',
          title: p.name || 'Unknown Patient',
          sub: (p.mrn ? 'MRN ' + p.mrn : '') + (p.doctor ? (p.mrn ? ' \u00b7 ' : '') + p.doctor : ''),
          href: 'patient-details.html?id=' + encodeURIComponent(p.id)
        };
      });
      if (patients.length) groups.push({ label: 'Patients', items: patients });

      var doctors = getCache('doctors').filter(function (d) {
        return (String(d.name || '').toLowerCase().indexOf(term) > -1) ||
               (String(d.specialization || '').toLowerCase().indexOf(term) > -1);
      }).slice(0, 5).map(function (d) {
        return {
          icon: 'fa-user-doctor',
          title: d.name || 'Unknown Doctor',
          sub: d.specialization || d.department || '',
          href: 'doctors.html'
        };
      });
      if (doctors.length) groups.push({ label: 'Doctors', items: doctors });

      var appointments = getCache('appointments').filter(function (a) {
        return (String(a.patientName || '').toLowerCase().indexOf(term) > -1) ||
               (String(a.doctor || '').toLowerCase().indexOf(term) > -1) ||
               (String(a.type || '').toLowerCase().indexOf(term) > -1);
      }).slice(0, 5).map(function (a) {
        return {
          icon: 'fa-calendar-check',
          title: (a.patientName || 'Appointment') + (a.type ? ' \u2013 ' + a.type : ''),
          sub: (a.doctor || '') + (a.date ? ' \u00b7 ' + a.date : ''),
          href: 'appointments.html'
        };
      });
      if (appointments.length) groups.push({ label: 'Appointments', items: appointments });

      var prescriptions = getCache('prescriptions').filter(function (rx) {
        var medicines = Array.isArray(rx.medicines) ? rx.medicines.join(' ') : '';
        return (String(rx.patientName || '').toLowerCase().indexOf(term) > -1) ||
               (medicines.toLowerCase().indexOf(term) > -1);
      }).slice(0, 5).map(function (rx) {
        return {
          icon: 'fa-file-prescription',
          title: rx.patientName || 'Prescription',
          sub: Array.isArray(rx.medicines) ? rx.medicines.join(', ') : '',
          href: 'prescriptions.html'
        };
      });
      if (prescriptions.length) groups.push({ label: 'Prescriptions', items: prescriptions });

      return groups;
    }

    function render(term) {
      if (!term) {
        resultsPanel.classList.add('hidden');
        resultsPanel.innerHTML = '';
        currentItems = [];
        activeIndex = -1;
        return;
      }

      var groups = buildResults(term);
      currentItems = [];

      if (!groups.length) {
        resultsPanel.innerHTML = '<div class="global-search-empty">No matches for "' + esc(term) + '"</div>';
        resultsPanel.classList.remove('hidden');
        return;
      }

      var html = '';
      groups.forEach(function (group) {
        html += '<div class="global-search-group-label">' + esc(group.label) + '</div>';
        group.items.forEach(function (item) {
          currentItems.push(item);
          html +=
            '<a class="global-search-item" href="' + esc(item.href) + '">' +
              '<i class="fa-solid ' + item.icon + '"></i>' +
              '<span>' +
                '<span class="global-search-item-title">' + esc(item.title) + '</span><br>' +
                '<span class="global-search-item-sub">' + esc(item.sub) + '</span>' +
              '</span>' +
            '</a>';
        });
      });

      resultsPanel.innerHTML = html;
      resultsPanel.classList.remove('hidden');
      activeIndex = -1;
    }

    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var value = searchInput.value;
      debounceTimer = setTimeout(function () { render(value); }, DEBOUNCE_MS);
    });

    searchInput.addEventListener('focus', function () {
      if (searchInput.value.trim()) render(searchInput.value);
    });

    searchInput.addEventListener('keydown', function (e) {
      var links = resultsPanel.querySelectorAll('.global-search-item');
      if (e.key === 'Escape') {
        resultsPanel.classList.add('hidden');
        searchInput.blur();
        return;
      }
      if (!links.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, links.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === 'Enter') {
        if (activeIndex > -1 && links[activeIndex]) {
          e.preventDefault();
          window.location.href = links[activeIndex].getAttribute('href');
        }
        return;
      } else {
        return;
      }
      links.forEach(function (link, i) {
        link.classList.toggle('active', i === activeIndex);
      });
      links[activeIndex].scrollIntoView({ block: 'nearest' });
    });

    document.addEventListener('click', function (e) {
      if (!resultsPanel.contains(e.target) && e.target !== searchInput) {
        resultsPanel.classList.add('hidden');
      }
    });

    /* Ctrl/Cmd + K focuses the global search box from anywhere on the page */
    document.addEventListener('keydown', function (e) {
      var isShortcut = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
      if (isShortcut) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  })();

});
