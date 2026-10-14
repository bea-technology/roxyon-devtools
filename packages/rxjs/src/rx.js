/*!
 * rx.js 2.0.4: Roxyon BaaS V2 client for the browser.
 * 2.0.4: a batch item asking for every row (limit -1, or over 200) is read page by page instead of returning one row.
 * 2.0.3: get('/_Locale') reads the app's site texts (when the project opened them), not an engine endpoint.
 * 2.0.2: get('/Class/categories') lists a class's categories; rx.contact({ name, email, subject, message }) sends
 * the site's contact form (to the address the project owner set, never one the page names).
 * 2.0.1: everything is inside one function scope; only window.RX (and window.RXEngine) are set, so a page can also
 * load V1's own script (which declares a global `class Engine`) without a clash.
 *
 * Same calls as rx.js 1.0.0, so a site moves by changing its script tag and config:
 *
 *   <script src="https://cdn.roxyon.com/libs/rxjs/2.0.2/rx.js"></script>
 *   const rx = new RX({ publishableKey: 'rxpk_...' });
 *   rx.get('/Plans', { where: { Status: 'active' }, limit: 20 });   // -> { results: [...] }
 *
 * What is different underneath (V2):
 *  - No keys that grant anything by themselves: the publishable key only opens a public session; every class is
 *    governed by its V2 rules (public / user / owner / member / server).
 *  - Sign-in is by email code: login({ email }) -> { challengeId }, then login({ challengeId, code }).
 *  - Tokens are scoped and bound to this device; they are kept in localStorage, not cookies.
 *  - Errors resolve (never reject) as { error: message, code, status }, like 1.0.0's failed writes.
 *  - limit -1 ("everything") is read page by page, up to 5000 rows.
 */
(function () {
"use strict";

class Engine {
    config = {};
    baseURL = "https://www.beaapis.com/2";

    constructor(config) {
        this.config = config || {};
        if (this.config.baseURL) this.baseURL = String(this.config.baseURL).replace(/\/+$/, "");
        this.key = this.config.publishableKey || this.config["Publishable-Key"] || "";
        this._mem = {};
        this._authing = null;
    }

    // --- storage (localStorage when it works, memory otherwise) ------------------------------------

    _get(k) {
        try { const v = window.localStorage.getItem(k); if (v !== null) return v; } catch (e) { }
        return this._mem[k] ?? null;
    }
    _set(k, v) {
        this._mem[k] = v;
        try { window.localStorage.setItem(k, v); } catch (e) { }
    }
    _del(k) {
        delete this._mem[k];
        try { window.localStorage.removeItem(k); } catch (e) { }
    }
    _ns(k) {
        return "rx2:" + (this.key ? this.key.slice(0, 24) : "default") + ":" + k;
    }

    /** A stable id for this browser: V2 tokens are bound to it. */
    device() {
        let d = this._get("rx2:device");
        if (!d) {
            const a = new Uint8Array(16);
            (window.crypto || globalThis.crypto).getRandomValues(a);
            d = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
            this._set("rx2:device", d);
        }
        return d;
    }

    _token(kind) {
        const raw = this._get(this._ns(kind));
        if (!raw) return null;
        try {
            const t = JSON.parse(raw);
            if (!t.token || (t.exp && Date.now() > t.exp - 30000)) {
                this._del(this._ns(kind));
                return null;
            }
            return t.token;
        } catch (e) {
            this._del(this._ns(kind));
            return null;
        }
    }
    _saveToken(kind, r) {
        if (!r || !r.access_token) return false;
        const exp = r.expires_in ? Date.now() + 1000 * r.expires_in : 0;
        this._set(this._ns(kind), JSON.stringify({ token: r.access_token, exp }));
        return true;
    }

    /** The signed-in user's id, read from the user token (null when signed out). */
    userId() {
        const t = this._token("user");
        if (!t) return null;
        try {
            const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
            return p.uid || null;
        } catch (e) {
            return null;
        }
    }

    isLoggedIn() {
        return !!this._token("user");
    }

    // --- transport ------------------------------------------------------------------------------------

    Obj2Par(obj, prefix = "") {
        const params = [];
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (value === undefined) continue;
                const paramName = prefix ? `${prefix}[${key}]` : key;
                if (typeof value === "object" && value !== null) params.push(this.Obj2Par(value, paramName));
                else params.push(`${encodeURIComponent(paramName)}=${encodeURIComponent(value)}`);
            }
        }
        return params.filter(Boolean).join("&");
    }

    async _raw(method, path, body, query, token) {
        const headers = { "x-bea-installation-id": this.device() };
        if (token) headers.authorization = "Bearer " + token;
        if (method !== "GET") headers["content-type"] = "application/json";
        const qs = method === "GET" && query && Object.keys(query).length ? "?" + this.Obj2Par(query) : "";
        let res;
        try {
            res = await fetch(this.baseURL + path + qs, { method, headers, body: method !== "GET" ? JSON.stringify(body || {}) : undefined });
        } catch (e) {
            return { status: 0, body: { ok: false, error: "connection", message: "Could not reach the server" } };
        }
        let json = {};
        try { json = await res.json(); } catch (e) { }
        return { status: res.status, body: json || {} };
    }

    /** A public session from the publishable key (one at a time, however many calls need it). */
    async _publicToken(force) {
        if (!force) {
            const t = this._token("public");
            if (t) return t;
        }
        if (!this.key) return null;
        if (!this._authing) {
            this._authing = this._raw("POST", "/auth/public", { key: this.key }).then((r) => {
                this._authing = null;
                return this._saveToken("public", r.body) ? r.body.access_token : null;
            });
        }
        return this._authing;
    }

    /** Signed in: the user's token; otherwise the public one. A rejected public token is renewed once. */
    async _call(method, path, body, query) {
        const user = this._token("user");
        let r = await this._raw(method, path, body, query, user || (await this._publicToken(false)));
        if (r.status === 401) {
            if (user) {
                this._del(this._ns("user"));
                if (typeof this.config.onSignedOut === "function") {
                    try { this.config.onSignedOut(); } catch (e) { }
                }
            } else {
                r = await this._raw(method, path, body, query, await this._publicToken(true));
            }
        }
        return r;
    }

    static _err(r) {
        const b = r.body || {};
        return { error: b.message || b.error || "request failed", code: b.error || "error", status: r.status, ...(b.details ? { details: b.details } : {}) };
    }

    // --- 1.0.0-compatible calls -----------------------------------------------------------------------

    get(u, d, h, opts) { return this.req(u, d, h, "GET", opts); }
    put(u, d, h, opts) { return this.req(u, d, h, "PUT", opts); }
    post(u, d, h, opts) { return this.req(u, d, h, "POST", opts); }
    delete(u, d, h, opts) { return this.req(u, d, h, "DELETE", opts); }
    patch(u, d, h, opts) { return this.req(u, d, h, "PUT", opts); }

    /**
     * u = "/Class", "/Class/<id>", "/batch", "/tasks", "/_endpoint/...", "/Auth/<login|me|logout>".
     * Answers in 1.0.0's shapes: { results: [...] } (+ count), a bare array for batch, the endpoint's own body.
     */
    async req(u, d, h, m) {
        const parts = String(u || "").replace(/\?+$/, "").split("/").filter(Boolean);
        const data = d && typeof d === "object" ? { ...d } : {};
        const head = parts[0] || "";
        if (head.toLowerCase() === "auth") return this._auth(parts[1] || "", data);
        if (head.toLowerCase() === "batch") return this._batch(data);
        if (head.toLowerCase() === "contact") return this.contact(data);
        if (head.toLowerCase() === "tasks") {
            const r = await this._call("POST", "/tasks", data);
            return r.body && r.body.ok ? r.body : Engine._err(r);
        }
        if (head.charAt(0) === "_" && head !== "_Locale") {
            const r = await this._call(m, "/engine/" + parts.map(encodeURIComponent).join("/"), m === "GET" ? undefined : data, m === "GET" ? data : undefined);
            return r.body && r.body.ok !== false && "result" in r.body ? r.body.result : Engine._err(r);
        }
        return this._records(m, head, parts[1] || null, data);
    }

    async _records(m, cls, id, data) {
        if (!id && (m === "PUT" || m === "DELETE") && data.objectId) id = String(data.objectId);
        delete data.objectId;
        const path = "/records/" + encodeURIComponent(cls) + (id ? "/" + encodeURIComponent(id) : "");
        if (m === "GET" && !id) return this._list(path, data);
        if (m === "GET" && id === "categories") {
            const c = await this._call("GET", path);
            return c.body && c.body.ok ? { results: c.body.results || [] } : Engine._err(c);
        }
        const r = await this._call(m, path, m === "GET" || m === "DELETE" ? undefined : { data }, m === "GET" ? data : undefined);
        if (!(r.body && r.body.ok)) return Engine._err(r);
        if (m === "DELETE") return { results: [{ objectId: id }] };
        return { results: r.body.result ? [r.body.result] : [] };
    }

    /** A list; limit -1 (or over 200) reads page by page, up to 5000 rows. */
    async _list(path, q) {
        const want = Number(q.limit);
        const all = want < 0 || want > 200;
        if (!all) {
            const r = await this._call("GET", path, undefined, q);
            return r.body && r.body.ok ? { results: r.body.results || [], ...("count" in r.body ? { count: r.body.count } : {}) } : Engine._err(r);
        }
        const cap = want < 0 ? 5000 : Math.min(want, 5000);
        const out = [];
        let skip = Number(q.skip) || 0;
        let count;
        for (;;) {
            const page = Math.min(200, cap - out.length);
            const r = await this._call("GET", path, undefined, { ...q, limit: page, skip });
            if (!(r.body && r.body.ok)) return Engine._err(r);
            const rows = r.body.results || [];
            if ("count" in r.body) count = r.body.count;
            out.push(...rows);
            if (rows.length < page || out.length >= cap) break;
            skip += rows.length;
        }
        return { results: out, ...(count !== undefined ? { count } : {}) };
    }

    /**
     * POST /batch { requests: [{ path, method, body }] } -> [each request's 1.0.0-shaped answer].
     * A list asking for every row (limit -1, or over 200) can't be one batch item, since V2 caps a page at 200:
     * it is read on its own, page by page like get(), and its answer keeps its place in the array.
     */
    async _batch(data) {
        const requests = (data.requests || []).map((x) => ({ path: x.path, method: String(x.method || "GET").toUpperCase(), body: x.body || {} }));
        const listOf = (x) => {
            const parts = String(x.path || "").split("/").filter(Boolean);
            if (parts[0] && parts[0].toLowerCase() === "records") parts.shift();
            const want = Number(x.body.limit);
            return x.method === "GET" && parts.length === 1 && (want < 0 || want > 200) ? parts[0] : null;
        };
        const out = new Array(requests.length);
        const paged = requests.map((x, i) => [i, listOf(x)]).filter(([, cls]) => cls);
        const rest = requests.map((x, i) => i).filter((i) => !paged.some(([j]) => j === i));
        const pages = Promise.all(paged.map(([i, cls]) => this._records("GET", cls, null, { ...requests[i].body }).then((a) => { out[i] = a; })));
        if (rest.length) {
            const r = await this._call("POST", "/batch", { requests: rest.map((i) => requests[i]) });
            if (!(r.body && r.body.ok)) return Engine._err(r);
            (r.body.results || []).forEach((x, k) => {
                const i = rest[k];
                const m = requests[i].method;
                if (x.ok === false) out[i] = { error: x.message || x.error, code: x.error, status: x.status };
                else if ("results" in x) out[i] = { results: x.results, ...("count" in x ? { count: x.count } : {}) };
                else if (m === "DELETE") out[i] = { results: [{ objectId: x.id }] };
                else out[i] = { results: x.result ? [x.result] : [] };
            });
        }
        await pages;
        return out;
    }

    // --- sign-in --------------------------------------------------------------------------------------

    async _auth(what, d) {
        what = what.toLowerCase();
        if (what === "login") return this.login(d);
        if (what === "me") return this.me().catch(() => ({ error: "not signed in", code: "not_signed_in" }));
        if (what === "logout") return this.logout().then(() => ({ success: true }), () => ({ success: true }));
        return { error: "not available on V2", code: "not_available" };
    }

    defer() {
        let res, rej;
        const promise = new Promise((resolve, reject) => { res = resolve; rej = reject; });
        promise.resolve = res;
        promise.reject = rej;
        promise.success = res;
        promise.failed = rej;
        return promise;
    }

    /**
     * Email-code sign-in. Step 1: login({ email }) -> { challengeId, destination, resendAfter }.
     * Step 2: login({ challengeId, code }) -> "success" (the user is signed in on this device).
     * Password sign-in doesn't exist on V2.
     */
    async login(d) {
        d = d || {};
        if (d.challengeId && d.code) {
            const r = await this._raw("POST", "/auth/login/verify", { key: this.key, challengeId: d.challengeId, code: String(d.code) });
            if (this._saveToken("user", r.body)) return "success";
            return Engine._err(r);
        }
        const email = d.email || d.Email;
        if (!email) return { code: 1063, error: "Enter your email", type: "CredentialsError" };
        if (d.password || d.Password) {
            // 1.0.0 callers pass a password; V2 signs in by emailed code instead (same first step).
        }
        const r = await this._raw("POST", "/auth/login", { key: this.key, email: String(email) });
        if (r.body && r.body.challengeId) return { challengeId: r.body.challengeId, destination: r.body.destination, resendAfter: r.body.resendAfter };
        return Engine._err(r);
    }

    /** The site's contact form: { name, email, subject?, message } -> { ok: true, sent: true } or { error }. */
    async contact(d) {
        d = d || {};
        const r = await this._call("POST", "/contact", { name: d.name || d.Name, email: d.email || d.Email, subject: d.subject || d.Subject || "", message: d.message || d.Message, website: d.website || "" });
        return r.body && r.body.ok ? r.body : Engine._err(r);
    }

    register() {
        return Promise.resolve({ code: "not_available", error: "Accounts are created on first email-code sign-in" });
    }

    /** Roxyon Console only: turn a console (V1) session into a V2 token for this app. */
    async consoleSignIn(session) {
        const r = await this._raw("POST", "/auth/console/app", { session });
        return this._saveToken("user", r.body) ? "success" : Engine._err(r);
    }

    async logout() {
        const t = this._token("user");
        if (t) await this._raw("POST", "/auth/logout", {}, undefined, t);
        this._del(this._ns("user"));
        return "success";
    }

    /** The signed-in user's own Users row (needs the app's Users rule to allow owners to read it). */
    async me() {
        const uid = this.userId();
        if (!uid) throw "error me";
        const r = await this._call("GET", "/records/Users/" + encodeURIComponent(uid));
        if (r.body && r.body.ok && r.body.result) return r.body.result;
        throw "error me";
    }
}

class RX extends Engine {
    constructor(config) {
        super(config);
    }
}

if (typeof window !== "undefined") {
    window.RX = RX;
    window.RXEngine = Engine;
}
})();
