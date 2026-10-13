/* ============================================
   CAREFLOW AI - AUTHENTICATION MODULE
   Login, Logout, Session Management
   ============================================ */

var Auth = {

    login: function(email, password) {
        return CareFlowAPI.login(email, password).catch(function(error) {
            // The backend is unreachable (DNS/connection failure, server down,
            // wrong server URL configured, etc.) - surface that plainly rather
            // than creating any kind of session. This app must never grant an
            // authenticated session without a successful backend response.
            if (CareFlowAPI.isNetworkError(error)) {
                throw new Error(
                    'Cannot reach the CareFlow server right now. Check your ' +
                    'connection or server settings and try again.'
                );
            }
            // Any other error (wrong credentials, validation, rate limiting,
            // etc.) already has a user-facing message from the backend/api.js -
            // pass it through unchanged.
            throw error;
        });
    },

    logout: function() {
        var theme = Storage.get('theme');
        Storage.clear();
        if (theme) Storage.set('theme', theme);
        window.location.href = 'login.html';
    },

    getSession: function() {
        return Storage.get('session');
    },

    isLoggedIn: function() {

        var session = this.getSession();

        return session !== null &&
               session.email !== undefined;
    },

    requireAuth: function() {

        if (!this.isLoggedIn()) {

            var currentUrl = window.location.href;

            var redirectParam = '';

            if (currentUrl.indexOf('login.html') === -1) {
                redirectParam =
                    '?redirect=' +
                    encodeURIComponent(currentUrl);
            }

            window.location.href =
                'login.html' + redirectParam;

            return false;
        }

        return true;
    },

    getUserName: function() {

        var session = this.getSession();

        return session ? session.name : 'User';
    },

    getUserAvatar: function() {

        var session = this.getSession();

        return session ? session.avatar : 'U';
    },

    getUserRole: function() {

        var session = this.getSession();

        return session ? session.role : '';
    }
};
