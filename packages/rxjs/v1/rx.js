class Engine {
    config = {};
    baseURL = "https://www.beaapis.com/1";

    isIPAddress(domain) {
        // Remove port if present
        const hostWithoutPort = domain.split(':')[0];

        // Check for IPv4
        const ipv4Pattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

        // Check for IPv6 (basic check)
        const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        const ipv6Compressed = /^::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$/;

        return ipv4Pattern.test(hostWithoutPort) ||
            ipv6Pattern.test(hostWithoutPort) ||
            ipv6Compressed.test(hostWithoutPort);
    }
    _cookies = {
        getItem: function (sKey) {
            if (!sKey) { return null; }
            return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
        },
        setItem: function (sKey, sValue, vEnd, sPath, sDomain, bSecure) {
            if (!sKey || /^(?:expires|max\-age|path|domain|secure)$/i.test(sKey)) { return false; }
            var sExpires = "";
            if (vEnd) {
                switch (vEnd.constructor) {
                    case Number:
                        sExpires = vEnd === Infinity ? "; expires=Fri, 31 Dec 9999 23:59:59 GMT" : "; max-age=" + vEnd;
                        break;
                    case String:
                        sExpires = "; expires=" + vEnd;
                        break;
                    case Date:
                        sExpires = "; expires=" + vEnd.toUTCString();
                        break;
                }
            }

            if (!sDomain) sDomain = window.location.hostname;
            if (!sPath) sPath = "/";

            document.cookie = encodeURIComponent(sKey) + "=" + encodeURIComponent(sValue) + sExpires + /*(sDomain ? "; domain=" + sDomain : "") + */ (sPath ? "; path=" + sPath : "") + (bSecure ? "; secure" : "");
            return true;
        },
        removeItem: function (sKey, sPath, sDomain) {
            if (!this.hasItem(sKey)) { return false; }

            if (!sDomain) sDomain = window.location.hostname;
            if (!sPath) sPath = "/";

            document.cookie = encodeURIComponent(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT" + /*(sDomain ? "; domain=" + sDomain : "") +*/ (sPath ? "; path=" + sPath : "");
            return true;
        },
        hasItem: function (sKey) {
            if (!sKey) { return false; }
            return (new RegExp("(?:^|;\\s*)" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=")).test(document.cookie);
        },
        keys: function () {
            var aKeys = document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g, "").split(/\s*(?:\=[^;]*)?;\s*/);
            for (var nLen = aKeys.length, nIdx = 0; nIdx < nLen; nIdx++) { aKeys[nIdx] = decodeURIComponent(aKeys[nIdx]); }
            return aKeys;
        }
    };

    cookies = new Proxy(this._cookies, {
        get(target, key) {
            return Reflect.get(target, key) ?? target.getItem(key);
        },
        set(target, key, value) {
            if (Reflect.has(target, key)) return false;
            return target.setItem(key, value);
        },
        deleteProperty(target, key) {
            if (!Reflect.has(target, key)) return false;
            return target.removeItem(key);
        },
        ownKeys: target => target.keys(),
        has: (target, key) => Reflect.has(target, key) || target.hasItem(key),
        getOwnPropertyDescriptor(target, key) {
            return target.getItem(key) ? {
                value: target.getItem(key),
                writable: true,
                enumerable: true,
                configurable: true
            } : undefined;
        }
    });

    constructor(config) {
        this.config = config;
    }

    Obj2Par(obj, prefix = "") {
        const params = [];
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const paramName = prefix ? `${prefix}[${key}]` : key;
                if (typeof value === "object" && value !== null) {
                    params.push(this.Obj2Par(value, paramName));
                } else {
                    const encodedKey = encodeURIComponent(paramName);
                    const encodedValue = encodeURIComponent(value);
                    params.push(`${encodedKey}=${encodedValue}`);
                }
            }
        }
        return params.join("&");
    }

    rtrim(str, ch) {
        const escapedCh = ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escapedCh + "+$", "g");
        return str.replace(regex, "");
    }

    get(u, d, h, opts) {
        return this.req(u, d, h, "GET", opts);
    }
    put(u, d, h, opts) {
        return this.req(u, d, h, "PUT", opts);
    }
    post(u, d, h, opts) {
        return this.req(u, d, h, "POST", opts);
    }
    delete(u, d, h, opts) {
        return this.req(u, d, h, "DELETE", opts);
    }
    patch(u, d, h, opts) {
        return this.req(u, d, h, "PATCH", opts);
    }

    async reqToken(refresh_token) {
        let r = await this.post(
            "/Auth",
            { scope: "public" },
            refresh_token
                ? {
                    "x-bea-refresh-token": refresh_token,
                }
                : {
                    "X-BEA-Application-ID": this.config["Application-ID"],
                    "X-BEA-JavaScript-Key": this.config["JavaScript-KEY"],
                },
            {
                skipToken: true,
            }
        );
        return r;
    }

    // Spend the refresh token for a fresh session/access token and persist the
    // new cookies. Single-flight: a burst of parallel 401s triggers one refresh,
    // not one per call. Returns true on success, false if there is no usable
    // refresh token or the BaaS rejects it (caller should then surface the auth
    // error / sign the user out).
    _refreshSession() {
        if (this._refreshing) return this._refreshing;

        var rt = this.getCookie("_rxr_");
        if (!rt) return Promise.resolve(false);

        var self = this;
        var p = (async function () {
            try {
                var r = await self.reqToken(rt);
                if (r && (r.session_token || r.access_token)) {
                    self.setCookie(
                        r.session_token ? "_rxs_" : "_rxa_",
                        r.session_token || r.access_token,
                        null,
                        null,
                        1000 * r.expires_in - 100
                    );
                    if (r.refresh_token) {
                        self.setCookie(
                            "_rxr_",
                            r.refresh_token,
                            null,
                            null,
                            1000 * 3600 * 24 * 7 - 100
                        );
                    }
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        })();

        this._refreshing = p;
        p.then(
            function () { if (self._refreshing === p) self._refreshing = null; },
            function () { if (self._refreshing === p) self._refreshing = null; }
        );
        return p;
    }

    getCookie(n) {
        return this.cookies[n];
    }

    setCookie(n, v, d, p, e) {
        var now = new Date();
        var time = now.getTime();
        if (!e) e = time + 24 * 60 * 60 * 1000 * 365;
        else e = time + e;
        if (!d) d = window.location.hostname;
        if (!p) p = "/";
        now.setTime(e);
        return this.cookies.setItem(n, v, now.toGMTString(), p, d, this.isIPAddress(d) ? false : true);
    }


    deleteCookies() {
        this.setCookie(
            "_rxa_",
            "",
            null,
            null,
            1
        );
        this.setCookie(
            "_rxs_",
            "",
            null,
            null,
            1
        );
        this.setCookie(
            "_rxr_",
            "",
            null,
            null,
            1
        );
    }

    setSessionToken(r) {
        this.setCookie(
            "_rxa_",
            "",
            null,
            null,
            1
        );
        this.setCookie(
            "_rxs_",
            r.session_token,
            null,
            null,
            1000 * r.expires_in - 100
        );
        this.setCookie(
            "_rxr_",
            r.refresh_token,
            null,
            null,
            1000 * 3600 * 24 * 7 - 100
        );
    }

    async getAccessToken() {
        var reqNewToken = false;
        if (this.getCookie("_rxs_") != undefined) {
            return {
                session_token: this.getCookie("_rxs_"),
                refresh_token: this.getCookie("_rxr_"),
            };
        } else if (this.getCookie("_rxa_") != undefined) {
            return {
                access_token: this.getCookie("_rxa_"),
                refresh_token: this.getCookie("_rxr_"),
            };
        } else if (this.getCookie("_rxr_") != undefined) {
            var r = await this.reqToken(this.getCookie("_rxr_"));
            if (r.hasOwnProperty("access_token") || r.hasOwnProperty("session_token")) {
                this.setCookie(
                    r.hasOwnProperty("access_token") ? "_rxa_" : "_rxs_",
                    r.hasOwnProperty("access_token") ? r.access_token : r.session_token,
                    null, //domain
                    null, //path
                    1000 * r.expires_in - 100 //expiry
                );
                this.setCookie(
                    "_rxr_",
                    r.refresh_token,
                    null,
                    null,
                    1000 * 3600 * 24 * 7 - 100
                );
                return r;
            } else {
                reqNewToken = true;
            }
        } else {
            reqNewToken = true;
        }

        if (reqNewToken) {
            var r = await this.reqToken();
            if (r.hasOwnProperty("access_token")) {
                this.setCookie(
                    "_rxa_",
                    r.access_token,
                    null,
                    null,
                    1000 * r.expires_in - 100
                );
                this.setCookie(
                    "_rxr_",
                    r.refresh_token,
                    null,
                    null,
                    1000 * 3600 * 24 * 7 - 100
                );
                return r;
            }
        }
        return false;
    }

    async req(u, d, h, m, opts, _retried) {
        if (!opts) opts = { skipToken: false, full: false, progress: true };
        let prog = opts.hasOwnProperty("progress") ? opts.progress : true;
        let full = opts.hasOwnProperty("full") ? opts.full : false;
        let skipToken = opts.hasOwnProperty("skipToken") ? opts.skipToken : false;

        if (!skipToken) {
            var token = await this.getAccessToken();
            h = token && token.session_token ? { "x-bea-session-token": token.session_token, } : { "x-bea-access-token": token && token.access_token, };
        }

        let r = await fetch(
            this.baseURL +
            this.rtrim(u, "?") +
            "?" +
            (m === "GET" ? this.Obj2Par(d) : ""),
            {
                method: m,
                headers: h,
                body: m !== "GET" ? JSON.stringify(d) : null,
            }
        );

        // The _rxs_ cookie can still be present after the server has expired the
        // token behind it (the cookie is set to outlive it on purpose). That call
        // comes back 401. Spend the refresh token once, then replay the request
        // with the new session token. _retried stops a loop; skipToken calls
        // (login, the /Auth refresh itself) never take this path.
        if (r.status === 401 && !skipToken && !_retried) {
            let refreshed = await this._refreshSession();
            if (refreshed) {
                return this.req(u, d, h, m, opts, true);
            }
        }

        return r.json();
    }

    defer() {
        var res, rej;
        var promise = new Promise((resolve, reject) => {
            res = resolve;
            rej = reject;
        });
        promise.resolve = res;
        promise.reject = rej;
        promise.success = res;
        promise.failed = rej;
        return promise;
    }

    isLoggedIn() {
        return this.getCookie('_rxs_');
    }

    login(d, _prom) {
        if (!_prom) _prom = this.defer();
        this.post("/Auth/login", d)
            .then((r) => {
                // cl("LOGIN", r);
                // return;
                try {
                    if (r?.session_token) {
                        _prom.resolve("success");
                        this.setSessionToken(r);
                    } else {
                        _prom.resolve({
                            code: 1063,
                            error: "Wrong Email or Password!",
                            type: "CredentialsError"
                        });
                    }
                } catch (e) {
                    _prom.resolve({
                        code: 1063,
                        error: "Wrong Email or Password!",
                        type: "CredentialsError"
                    });
                    // console.error("Error in Login:", e);
                }
            })
            .catch((r) => {
                _prom.reject({
                    code: 1060,
                    error: "Connection Error!",
                    type: "ConnectionError"
                });
            });
        return _prom;
    }

    register(d) {
        let _self = this;
        let _prom = this.defer();
        this.post("/Auth/register", d).then((r) => {
            // cl("REGISTER", r);
            // return;
            try {
                if (r.results[0].hasOwnProperty("objectId")) {
                    _self.login({ ...d, ...r.results[0] }, _prom);
                } else {
                    _prom.resolve(r.results[0]);
                }
            } catch (e) {
                _prom.resolve({
                    code: 1063,
                    error: "Wrong Email or Password!",
                    type: "CredentialsError"
                });
            }
        })
            .catch((r) => {
                _prom.reject({
                    code: 1060,
                    error: "Connection Error!",
                    type: "ConnectionError"
                });
            });
        return _prom;
    }

    logout() {
        let _prom = this.defer();
        this.post("/Auth/logout").then((r) => {
            // cl("LOGOUT", r);
            if (r.success) {
                this.deleteCookies();
                _prom.resolve("success");
            } else {
                _prom.reject("error logout");
            }
        });
        return _prom;
    }

    me() {
        let _prom = this.defer();
        this.post("/Auth/me").then((r) => {
            // cl("ME", r);
            if (r.objectId) {
                _prom.resolve(r);
            } else {
                _prom.reject("error me");
            }
        });
        return _prom;
    }
}


class RX extends Engine {
    constructor(config) {
        super(config);
    }
    test() {
        console.log("BasicShot#update");
    }
}