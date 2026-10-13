/* ============================================
   CAREFLOW AI - SERVER CONFIG MODULE
   ------------------------------------------------
   Owns the backend URL the app talks to.

   - On the web build, this is optional: api.js falls back
     to http://127.0.0.1:8000/api if nothing is set, same as
     before.
   - Inside the Capacitor app (Android/iOS), there is no
     backend running on the device. The app must be pointed
     at your real, cloud-hosted CareFlow backend (HTTPS) the
     first time it's opened. This module renders that
     "Connect to your server" screen and remembers the
     answer (localStorage), same key api.js already reads:
     'careflow_api_base'.
   ============================================ */

var ServerConfig = (function () {

  var STORAGE_KEY = 'careflow_api_base';

  function isNative() {
    return Boolean(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  }

  function getApiBase() {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  // Accepts what the admin/receptionist pastes in (e.g.
  // "https://careflow.myhospital.com" or with a trailing
  // "/api" already) and normalizes it to ".../api" with no
  // trailing slash.
  function normalize(rawUrl) {
    var url = String(rawUrl || '').trim();
    if (!url) return null;
    url = url.replace(/\/+$/, '');
    if (!/\/api$/i.test(url)) url += '/api';
    return url;
  }

  function isLoopbackOrLan(url) {
    // 127.0.0.1 / localhost / 10.0.2.2 (Android emulator alias for
    // the host machine) / private LAN ranges - only relevant for
    // local development, never for a real device in production.
    return /^https?:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)([:/]|$)/i.test(url);
  }

  function validate(rawUrl) {
    var url = normalize(rawUrl);
    if (!url) return { ok: false, error: 'Enter your server URL.' };

    if (isNative() && !/^https:\/\//i.test(url) && !isLoopbackOrLan(url)) {
      return {
        ok: false,
        error: 'Use an HTTPS URL (e.g. https://careflow.yourhospital.com). ' +
               'Plain http:// only works for local Wi-Fi testing.'
      };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'URL must start with http:// or https://' };
    }
    return { ok: true, url: url };
  }

  function setApiBase(rawUrl) {
    var result = validate(rawUrl);
    if (!result.ok) return result;
    try {
      localStorage.setItem(STORAGE_KEY, result.url);
    } catch (e) {
      return { ok: false, error: 'Could not save (storage unavailable).' };
    }
    return result;
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // Hits /api/health on the candidate URL. Used by the setup screen
  // so a hospital admin gets an immediate "yes this is reachable"
  // instead of only finding out after trying to log in.
  async function testConnection(rawUrl) {
    var result = validate(rawUrl);
    if (!result.ok) return result;

    var healthUrl = result.url + '/health';
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;

    try {
      var res = await fetch(healthUrl, {
        method: 'GET',
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok) {
        return { ok: false, error: 'Server responded with an error (' + res.status + ').' };
      }
      return { ok: true, url: result.url };
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      return {
        ok: false,
        error: e.name === 'AbortError'
          ? 'No response from server (timed out). Check the URL and your connection.'
          : 'Could not reach that server. Check the URL and your connection.'
      };
    }
  }

  // True when the app genuinely needs the setup screen before anything
  // else can work: native app with no server saved yet.
  function needsSetup() {
    return isNative() && !getApiBase();
  }

  return {
    isNative: isNative,
    getApiBase: getApiBase,
    setApiBase: setApiBase,
    clear: clear,
    testConnection: testConnection,
    needsSetup: needsSetup
  };

}());
