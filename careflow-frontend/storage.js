/* ============================================
   CAREFLOW AI - STORAGE MODULE
   localStorage wrapper with JSON serialization
   ------------------------------------------------
   "session" and "token" are special: they follow the
   "Remember Me" preference from the login page.
     - Remember Me checked   -> localStorage (survives
       closing the browser, so the user stays logged in
       the next time they come to the site).
     - Remember Me unchecked (default) -> sessionStorage
       (lives only for this browser tab/session, so the
       user isn't logged in every time they come back,
       but they're also not asked to log in again on
       every single page while they're using the app).
   Everything else (theme, cached API data, etc.) keeps
   working exactly as before, in localStorage.
   ============================================ */

var Storage = {
  _authKeys: ['session', 'token'],

  _isRemembered: function() {
    try {
      return localStorage.getItem('careflow_remember_me') === '1';
    } catch (e) {
      return false;
    }
  },

  _storeFor: function(key) {
    if (this._authKeys.indexOf(key) !== -1 && !this._isRemembered()) {
      return sessionStorage;
    }
    return localStorage;
  },

  // Called once, right when the user submits the login form, based on
  // the "Remember Me" checkbox.
  setRememberMe: function(remember) {
    try {
      localStorage.setItem('careflow_remember_me', remember ? '1' : '0');
      return true;
    } catch (e) {
      console.error('Storage.setRememberMe error:', e.message);
      return false;
    }
  },

  set: function(key, value) {
    try {
      var serialized = JSON.stringify(value);
      this._storeFor(key).setItem('careflow_' + key, serialized);
      return true;
    } catch (e) {
      console.error('Storage.set error for key "' + key + '":', e.message);
      return false;
    }
  },

  get: function(key, defaultValue) {
    if (defaultValue === undefined) {
      defaultValue = null;
    }
    try {
      var primary = this._storeFor(key);
      var raw = primary.getItem('careflow_' + key);
      if (raw === null && this._authKeys.indexOf(key) !== -1) {
        // Fall back to the other storage in case the Remember Me
        // preference changed after this value was originally written.
        var other = (primary === localStorage) ? sessionStorage : localStorage;
        raw = other.getItem('careflow_' + key);
      }
      if (raw === null) {
        return defaultValue;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.error('Storage.get error for key "' + key + '":', e.message);
      return defaultValue;
    }
  },

  remove: function(key) {
    try {
      localStorage.removeItem('careflow_' + key);
      sessionStorage.removeItem('careflow_' + key);
      return true;
    } catch (e) {
      console.error('Storage.remove error:', e.message);
      return false;
    }
  },

  clear: function() {
    try {
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key.indexOf('careflow_') === 0) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(function(key) {
        localStorage.removeItem(key);
      });

      var sessionKeysToRemove = [];
      for (var j = 0; j < sessionStorage.length; j++) {
        var sKey = sessionStorage.key(j);
        if (sKey.indexOf('careflow_') === 0) {
          sessionKeysToRemove.push(sKey);
        }
      }
      sessionKeysToRemove.forEach(function(key) {
        sessionStorage.removeItem(key);
      });

      return true;
    } catch (e) {
      console.error('Storage.clear error:', e.message);
      return false;
    }
  },

  exists: function(key) {
    return localStorage.getItem('careflow_' + key) !== null ||
      sessionStorage.getItem('careflow_' + key) !== null;
  }
};
