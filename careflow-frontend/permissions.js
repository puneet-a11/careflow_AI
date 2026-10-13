/* ============================================
   CAREFLOW AI - PERMISSIONS MODULE
   ------------------------------------------------
   Frontend mirror of the backend's RBAC matrix
   (app/permissions.py). This ONLY controls what the
   UI shows - the backend independently re-checks
   every request and is the real security boundary.
   Hiding a button here is a UX courtesy, not a fence.

   Usage:
     await Permissions.ensureLoaded();
     if (Permissions.can('patients', 'delete')) { ... }
     Permissions.hide(document.getElementById('addPatientBtn'));
   ============================================ */

var Permissions = (function () {

  var CACHE_KEY = 'permissions';
  var loadingPromise = null;

  function getCached() {
    return CareFlowAPI.getCached(CACHE_KEY);
  }

  // Fetches once and caches; safe to call from every page - concurrent
  // callers share the same in-flight request instead of firing it twice.
  function ensureLoaded() {
    var cached = getCached();
    if (cached) return Promise.resolve(cached);

    if (!loadingPromise) {
      loadingPromise = CareFlowAPI.getPermissions()
        .then(function (data) {
          loadingPromise = null;
          return data;
        })
        .catch(function (error) {
          loadingPromise = null;
          console.error('[CareFlow] Could not load permissions:', error);
          throw error;
        });
    }
    return loadingPromise;
  }

  // Fail-closed: until permissions have actually loaded, `can()` says
  // no. Pages should `await Permissions.ensureLoaded()` before deciding
  // what to render, rather than relying on this default.
  function can(moduleName, action) {
    var cached = getCached();
    if (!cached || !cached.modules) return false;
    var actions = cached.modules[moduleName];
    return Array.isArray(actions) && actions.indexOf(action) !== -1;
  }

  function role() {
    var cached = getCached();
    return cached ? cached.role : null;
  }

  function roleLabel() {
    var cached = getCached();
    return cached ? cached.role_label : null;
  }

  function isAdmin() {
    return role() === 'admin';
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  function show(el, displayValue) {
    if (el) el.style.display = displayValue || '';
  }

  function disable(el, reason) {
    if (!el) return;
    el.disabled = true;
    el.classList.add('is-disabled');
    if (reason) el.title = reason;
  }

  // Convenience: hide `el` unless the current role can `action` on
  // `moduleName`. Returns whether it stayed visible, in case the
  // caller wants to skip wiring a click handler for a hidden button.
  function guard(el, moduleName, action) {
    var allowed = can(moduleName, action);
    if (!allowed) hide(el);
    return allowed;
  }

  function clearCache() {
    CareFlowAPI.removeCached(CACHE_KEY);
  }

  return {
    ensureLoaded: ensureLoaded,
    can: can,
    role: role,
    roleLabel: roleLabel,
    isAdmin: isAdmin,
    hide: hide,
    show: show,
    disable: disable,
    guard: guard,
    clearCache: clearCache
  };

}());
