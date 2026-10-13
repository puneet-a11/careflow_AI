

/* =========================================================
   CareFlow API Client
   ---------------------------------------------------------
   - Central API communication
   - JWT authentication
   - Persistent frontend cache
   - Automatic cache refresh after AI database changes
   - Automatic cache refresh after CRUD mutations
   - Handles session expiration
   ========================================================= */

var CareFlowAPI = (function () {

  /*
   * baseUrl resolution:
   *  - Web (browser): keeps the old behaviour - localStorage override,
   *    else localhost:8000 for local dev.
   *  - Native app (Capacitor/Android/iOS): there is no backend on the
   *    below will surface a clear "server not configured" error instead
   *    of silently trying (and failing) to reach the phone's own loopback.
   */
  var baseUrl = (function () {
    if (window.ServerConfig) {
      var configured = window.ServerConfig.getApiBase();
      if (configured) return configured;
      // Not configured yet: only the native app (no backend on-device)
      // should be blocked and sent through the setup screen. A web page
      // that simply happens to load server-config.js (every page does,
      // for the shared gear-icon settings link) must NOT lose the old
      // "just default to localhost" convenience for local dev.
      if (window.ServerConfig.isNative()) return null;
    }
    return (
      localStorage.getItem('careflow_api_base') ||
      'http://127.0.0.1:8000/api'
    );
  }());

  var resources = {
    patients: 'patients',
    doctors: 'doctors',
    appointments: 'appointments',
    departments: 'departments',
    labReports: 'lab-reports',
    prescriptions: 'prescriptions',
    billing: 'billing'
  };


  /* =========================================================
     PERMISSIONS
     ---------------------------------------------------------
     Not a CRUD resource, so it isn't in `resources` above, but
     it's refreshed at the same points (login, hydrate) so the
     frontend's view of "what can I do" never gets far out of
     sync with the backend, which is the only thing actually
     enforcing it.
     ========================================================= */

  async function getPermissions() {
    var data = await request('/permissions/me', { skipCacheRefresh: true });
    setCached('permissions', data);
    return data;
  }


  /* =========================================================
     AUTH
     ========================================================= */

  function token() {
    return Storage.get('token');
  }


  function cacheKey(name) {
    return 'api_' + name;
  }


  /* =========================================================
     RESOURCE DETECTION
     ========================================================= */

  function resourceFromPath(path) {

    if (!path) return null;

    var cleanPath = path.split('?')[0];

    if (cleanPath.charAt(0) === '/') {
      cleanPath = cleanPath.substring(1);
    }

    var parts = cleanPath.split('/');

    if (parts[0] === 'api') {
      parts.shift();
    }

    var endpoint = parts[0];

    for (var name in resources) {
      if (
        resources[name] === endpoint ||
        name === endpoint
      ) {
        return name;
      }
    }

    return null;
  }


  /* =========================================================
     CACHE
     ========================================================= */

  function getCached(name) {
    return Storage.get(cacheKey(name));
  }


  function setCached(name, value) {
    Storage.set(cacheKey(name), value);
    return value;
  }


  function removeCached(name) {
    Storage.remove(cacheKey(name));
  }


  /* =========================================================
     REFRESH SINGLE RESOURCE
     ========================================================= */

  async function refreshResource(name) {

    if (!resources[name]) {
      return null;
    }

    try {

      var data = await request(
        '/' + resources[name],
        {
          method: 'GET',
          skipCacheRefresh: true
        }
      );

      setCached(name, data);

      return data;

    } catch (error) {

      if (error.careFlowStatus === 403) {
        // Expected for many roles - e.g. a doctor can't view billing.
        // Cache an empty list (not "leave whatever was cached before")
        // so any page reading this resource sees a consistent, current
        // "you have none" rather than a stale or undefined value.
        console.info(
          '[CareFlow] Skipping resource (no permission):',
          name
        );

        setCached(name, []);

        return [];
      }

      console.error(
        '[CareFlow] Failed to refresh resource:',
        name,
        error
      );

      // Deliberately NOT re-thrown: hydrate() runs every resource in
      // parallel right after login, and one flaky/forbidden resource
      // must never be able to take down login for the whole app.
      // Pages that actually need this data do their own live fetch
      // (see patients.js) and handle failure with a visible retry.
      return null;
    }
  }


  /* =========================================================
     REFRESH MULTIPLE RESOURCES
     ========================================================= */

  async function refreshResources(names) {

    if (!Array.isArray(names) || names.length === 0) {
      return;
    }

    var uniqueNames = [];

    names.forEach(function (name) {

      if (
        resources[name] &&
        uniqueNames.indexOf(name) === -1
      ) {
        uniqueNames.push(name);
      }

    });

    if (uniqueNames.length === 0) {
      return;
    }

    await Promise.all(
      uniqueNames.map(function (name) {
        return refreshResource(name);
      })
    );
  }


  /* =========================================================
     FULL DATABASE HYDRATION
     ========================================================= */

  async function hydrate() {

    var names = Object.keys(resources);

    await Promise.all(
      names.map(function (name) {
        return refreshResource(name);
      }).concat([
        getPermissions().catch(function (error) {
          console.error('[CareFlow] Failed to load permissions:', error);
        })
      ])
    );

    return true;
  }


  /* =========================================================
     ENTITY → RESOURCE MAPPING
     ---------------------------------------------------------
     Gemini/backend may return:
       patients
       patient
       doctors
       appointments
       lab_reports
       prescriptions
       billing
       departments
     ========================================================= */

  function normalizeEntity(entity) {

    if (!entity) {
      return null;
    }

    var value = String(entity)
      .trim()
      .toLowerCase()
      .replace(/-/g, '_')
      .replace(/\s+/g, '_');

    var aliases = {

      patient: 'patients',
      patients: 'patients',

      doctor: 'doctors',
      doctors: 'doctors',

      appointment: 'appointments',
      appointments: 'appointments',

      department: 'departments',
      departments: 'departments',

      lab: 'labReports',
      labs: 'labReports',

      lab_report: 'labReports',
      lab_reports: 'labReports',
      labreport: 'labReports',
      labreports: 'labReports',

      prescription: 'prescriptions',
      prescriptions: 'prescriptions',

      billing: 'billing',
      bill: 'billing',

      invoice: 'billing',
      invoices: 'billing'
    };

    return aliases[value] || null;
  }


  /* =========================================================
     AI CHANGE → CACHE REFRESH
     ========================================================= */

  async function refreshAfterAIChange(result) {

    if (!result) {
      return;
    }

    /*
     * Backend sends:
     *
     * data_changed
     * affected_entities
     * affected_patient_id
     */

    if (!result.data_changed) {
      return;
    }

    var entities = [];

    if (Array.isArray(result.affected_entities)) {

      result.affected_entities.forEach(function (entity) {

        var normalized = normalizeEntity(entity);

        if (
          normalized &&
          entities.indexOf(normalized) === -1
        ) {
          entities.push(normalized);
        }

      });
    }


    /*
     * If backend didn't specify entities,
     * safest option is to refresh everything.
     */

    if (entities.length === 0) {

      console.log(
        '[CareFlow] AI changed database. Refreshing all resources.'
      );

      await hydrate();

      return;
    }


    console.log(
      '[CareFlow] AI changed:',
      entities
    );


    await refreshResources(entities);
  }


  /* =========================================================
     HTTP REQUEST
     ========================================================= */

  // Bare GETs to these paths return a paginated list from the backend
  // (default 100 / max 200 per page - see app/crud_factory.py). Every
  // page in this app expects the FULL list from a call like
  // CareFlowAPI.request('/patients'), so request() transparently walks
  // every page and concatenates them here, in one place, instead of
  // each of patients.js/appointments.js/doctors.js/etc. having to know
  // about pagination individually (and risking silently showing only
  // the first page once a hospital has more than 100 of something).
  var PAGINATED_LIST_PATHS = [
    '/patients', '/doctors', '/appointments', '/departments',
    '/lab-reports', '/prescriptions', '/billing'
  ];
  var LIST_PAGE_SIZE = 200;

  function _isPaginatedListGet(path, options) {
    var method = (options && options.method) ? String(options.method).toUpperCase() : 'GET';
    var basePath = String(path).split('?')[0];
    return method === 'GET' && PAGINATED_LIST_PATHS.indexOf(basePath) !== -1;
  }

  function _withPageParams(path, offset) {
    var sep = path.indexOf('?') === -1 ? '?' : '&';
    return path + sep + 'limit=' + LIST_PAGE_SIZE + '&offset=' + offset;
  }

  async function request(path, options) {
    if (_isPaginatedListGet(path, options)) {
      var all = [];
      var offset = 0;
      // Safety cap: stop after 100 pages (20,000 records at 200/page)
      // rather than looping forever against a misbehaving backend.
      for (var guard = 0; guard < 100; guard++) {
        var page = await _requestSinglePage(_withPageParams(path, offset), options);
        if (!Array.isArray(page)) return page; // unexpected shape - don't paginate blindly
        all = all.concat(page);
        if (page.length < LIST_PAGE_SIZE) break;
        offset += LIST_PAGE_SIZE;
      }
      return all;
    }
    return _requestSinglePage(path, options);
  }

  async function _requestSinglePage(path, options) {

    if (!baseUrl) {
      var err = new Error(
        'No CareFlow server configured. Set your hospital\u2019s backend URL first.'
      );
      err.careFlowServerNotConfigured = true;
      throw err;
    }

    options = options || {};

    options.headers = options.headers || {};

    /*
     * Authorization
     */

    if (token()) {
      options.headers.Authorization =
        'Bearer ' + token();
    }


    /*
     * JSON Content-Type
     */

    if (
      options.body &&
      !(options.body instanceof FormData)
    ) {
      options.headers['Content-Type'] =
        'application/json';
    }


    var response;


    try {

      response = await fetch(
        baseUrl + path,
        options
      );

    } catch (error) {

      error.careFlowNetworkError = true;

      throw error;
    }


    /* =====================================================
       SESSION EXPIRED
       ===================================================== */

    if (response.status === 401) {

      Storage.remove('session');
      Storage.remove('token');

      throw new Error(
        'Your session has expired. Please sign in again.'
      );
    }


    /* =====================================================
       SERVER ERROR
       ===================================================== */

    if (!response.ok) {

      var detail =
        await response
          .json()
          .catch(function () {
            return {};
          });

      var requestError = new Error(
        detail.detail ||
        'Request failed (' +
        response.status +
        ')'
      );
      requestError.careFlowStatus = response.status;

      throw requestError;
    }


    /* =====================================================
       NO CONTENT
       ===================================================== */

    if (response.status === 204) {
      return null;
    }


    return response.json();
  }


  /* =========================================================
     LOGIN
     ========================================================= */

  async function login(email, password) {

    var response = await request(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          password: password
        })
      }
    );


    Storage.set(
      'token',
      response.access_token
    );


    Storage.set(
      'session',
      Object.assign(
        {},
        response.user,
        {
          loginTime: Date.now()
        }
      )
    );


    /*
     * Login ke baad fresh database state.
     */

    await hydrate();


    return response.user;
  }


  /* =========================================================
     AI CHAT
     ========================================================= */

  async function chat(message, channel) {

    var result = await request(
      '/ai-assistant/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          message: message,
          channel: channel || 'assistant'
        })
      }
    );


    /*
     * IMPORTANT FIX
     *
     * Gemini agar DB mein patient/doctor/etc update kare,
     * frontend cache ko immediately refresh karo.
     */

    if (result && result.data_changed) {

      try {

        await refreshAfterAIChange(result);

      } catch (refreshError) {

        /*
         * AI response ko fail mat karo sirf cache
         * refresh fail hone ki wajah se.
         */

        console.error(
          '[CareFlow] AI change detected but cache refresh failed:',
          refreshError
        );
      }
    }


    return result;
  }


  /* =========================================================
     CHAT HISTORY
     ========================================================= */

  async function getChatHistory(limit) {

    var url = '/ai-assistant/history';

    if (limit) {
      url += '?limit=' + encodeURIComponent(limit);
    }

    return request(url);
  }

  async function deleteChatHistory() {
    return request('/ai-assistant/history', { method: 'DELETE' });
  }


  /* =========================================================
     RESET AI SESSION
     ========================================================= */

  async function resetConversation() {

    return request(
      '/ai-assistant/reset',
      {
        method: 'POST'
      }
    );
  }


  /* =========================================================
     REPORT ANALYSIS
     ========================================================= */

  async function analyzeReport(file, question) {

    var formData = new FormData();

    formData.append('file', file);

    if (question) {
      formData.append('question', question);
    }


    return request(
      '/ai-assistant/analyze-report',
      {
        method: 'POST',
        body: formData
      }
    );
  }


  /* =========================================================
     LAB REPORT DOCUMENT ATTACHMENTS
     ========================================================= */

  async function uploadLabReportDocument(reportId, formData) {
    // formData is built by the caller (must contain a 'file' field) -
    // request() already skips setting Content-Type for FormData bodies,
    // letting the browser set the correct multipart boundary itself.
    return request(
      '/lab-reports/' + encodeURIComponent(reportId) + '/document',
      { method: 'POST', body: formData }
    );
  }

  async function downloadLabReportDocument(reportId) {
    // Can't use request() here - it always calls response.json(), which
    // would fail on binary PDF/image bytes. This needs the raw fetch so
    // the Authorization header still goes out (a plain <a href> can't
    // send custom headers, so the file's normal RBAC/auth check would
    // otherwise 401 a direct link click).
    if (!baseUrl) {
      var err = new Error('No CareFlow server configured. Set your hospital\u2019s backend URL first.');
      err.careFlowServerNotConfigured = true;
      throw err;
    }
    var headers = {};
    if (token()) headers.Authorization = 'Bearer ' + token();

    var response;
    try {
      response = await fetch(
        baseUrl + '/lab-reports/' + encodeURIComponent(reportId) + '/document',
        { headers: headers }
      );
    } catch (error) {
      error.careFlowNetworkError = true;
      throw error;
    }

    if (response.status === 401) {
      Storage.remove('session');
      Storage.remove('token');
      throw new Error('Your session has expired. Please sign in again.');
    }
    if (!response.ok) {
      var detail = await response.json().catch(function () { return {}; });
      var requestError = new Error(detail.detail || 'Request failed (' + response.status + ')');
      requestError.careFlowStatus = response.status;
      throw requestError;
    }

    var blob = await response.blob();
    var disposition = response.headers.get('Content-Disposition') || '';
    var match = /filename="([^"]*)"/.exec(disposition);
    return {
      blob: blob,
      filename: match ? match[1] : 'document',
      contentType: response.headers.get('Content-Type') || blob.type
    };
  }


  /* =========================================================
     PATIENTS
     ========================================================= */

  async function getPatients() {
    return refreshResource('patients');
  }


  /* =========================================================
     DOCTORS
     ========================================================= */

  async function getDoctors() {
    return refreshResource('doctors');
  }


  /* =========================================================
     APPOINTMENTS
     ========================================================= */

  async function getAppointments() {
    return refreshResource('appointments');
  }


  /* =========================================================
     DEPARTMENTS
     ========================================================= */

  async function getDepartments() {
    return refreshResource('departments');
  }


  /* =========================================================
     LAB REPORTS
     ========================================================= */

  async function getLabReports() {
    return refreshResource('labReports');
  }


  /* =========================================================
     PRESCRIPTIONS
     ========================================================= */

  async function getPrescriptions() {
    return refreshResource('prescriptions');
  }


  /* =========================================================
     BILLING
     ========================================================= */

  async function getBilling() {
    return refreshResource('billing');
  }


  /* =========================================================
     NETWORK ERROR
     ========================================================= */

  function isNetworkError(error) {

    return Boolean(
      error &&
      error.careFlowNetworkError
    );
  }



  /* =========================================================
     HUMAN-READABLE ERROR MESSAGES
     ---------------------------------------------------------
     One place that turns a thrown request() error into text a
     receptionist/nurse can act on. request() already attaches
     `careFlowStatus` (HTTP status) and `careFlowNetworkError`
     (fetch itself failed - server down / offline / CORS), and
     uses the backend's own `detail` string as error.message
     when the backend sent one. This keeps that detail (it is
     the most specific thing available - e.g. the department
     409 text) and only falls back to a generic per-status
     sentence when the backend said nothing useful.
     ========================================================= */

  var STATUS_FALLBACKS = {
    400: 'The server rejected this request as invalid. Please check the values and try again.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have permission to perform this action.',
    404: 'That record no longer exists. It may have been deleted by someone else.',
    409: 'This conflicts with existing data and was not saved.',
    413: 'That file is too large.',
    415: 'That file type is not supported.',
    422: 'Some values are not valid. Please correct the highlighted fields and try again.',
    429: 'Too many attempts. Please wait a few minutes and try again.',
    500: 'The server hit an unexpected error. Nothing was saved. Please try again.',
    502: 'The server is temporarily unreachable. Please try again shortly.',
    503: 'The server is temporarily unavailable. Please try again shortly.',
    504: 'The server took too long to respond. Please try again shortly.'
  };

  function describeError(error, action) {
    var what = action ? action : 'complete that action';

    if (!error) return 'Could not ' + what + '.';

    if (error.careFlowServerNotConfigured) {
      return 'No CareFlow server is configured yet. Set your hospital\u2019s backend URL in Settings first.';
    }

    if (error.careFlowNetworkError) {
      return 'Could not reach the CareFlow server, so nothing was saved. ' +
        'Check your connection (or that the backend is running) and try again.';
    }

    var status = error.careFlowStatus;
    var detail = error.message;

    // A message the backend actually sent is always more useful than a
    // generic one - but request() also synthesises "Request failed (500)"
    // when the backend sent no detail, and that is not worth showing.
    var isGeneric = !detail || /^Request failed \(\d+\)$/.test(detail);

    if (!isGeneric) return detail;

    if (status && STATUS_FALLBACKS[status]) return STATUS_FALLBACKS[status];
    if (status >= 500) return STATUS_FALLBACKS[500];

    return 'Could not ' + what + '.';
  }


  /* =========================================================
     PUBLIC API
     ========================================================= */

  return {

    request: request,

    login: login,

    hydrate: hydrate,

    refreshResource: refreshResource,

    refreshResources: refreshResources,

    getCached: getCached,

    setCached: setCached,

    removeCached: removeCached,

    chat: chat,

    getChatHistory: getChatHistory,

    deleteChatHistory: deleteChatHistory,

    resetConversation: resetConversation,

    analyzeReport: analyzeReport,

    uploadLabReportDocument: uploadLabReportDocument,

    downloadLabReportDocument: downloadLabReportDocument,

    getPatients: getPatients,

    getDoctors: getDoctors,

    getAppointments: getAppointments,

    getDepartments: getDepartments,

    getLabReports: getLabReports,

    getPrescriptions: getPrescriptions,

    getBilling: getBilling,

    getPermissions: getPermissions,

    resources: resources,

    isNetworkError: isNetworkError,

    describeError: describeError,

    getBaseUrl: function () { return baseUrl; }

  };

}());
