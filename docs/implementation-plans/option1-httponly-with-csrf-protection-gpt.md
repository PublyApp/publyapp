## Option 1: HttpOnly Cookie Sessions with Direct API Access (Merged Plan - GPT)

> Note (2026-01): This document predates the RFC 7807 ProblemDetails migration. Any API error-response examples using `ApiResponse` should be updated to `TypedProblems.*` + `AppProblemDetails` / `ValidationProblemDetails` where applicable.

> **Status:** Draft, merged from `option1-httponly-with-csrf-protection.md` (Claude) and
> `httponly-cookie-migration-option-1.md` (GPT). This is the **single canonical plan** for Option 1.

---

### 1. Executive Summary

**Goal:**
Migrate PublyApp from JS-readable session cookies and `X-Session-Token` headers to:

- A single **httpOnly session cookie** (`SESSION_TOKEN_COOKIE_KEY`) used by the API for auth.
- **Direct browser → API** calls (no mandatory BFF), with robust, multi-layer **CSRF protection**.
- Frontend JS **never reads the session token**, it only:
  - Relies on loaders/actions and API responses,
  - Adds CSRF-related headers where required.

**Core security measures:**
- HttpOnly + Secure + SameSite cookie attributes.
- CSRF defense in depth:
  - SameSite on the session cookie.
  - Custom header on all mutating requests (e.g. `X-Requested-With` + optional `X-CSRF-Token`).
  - Origin/Referer validation on the API.
  - Optional explicit CSRF token (double-submit cookie pattern) for high-risk operations.

**High-level phases (approx 2–3 weeks):**
1. Inventory + backend cookie auth support.
2. Backend CSRF middleware (headers + origin checks).
3. Frontend cookie + CSRF handling (no more `X-Session-Token`).
4. End-to-end testing (including simulated CSRF/XSS attempts).
5. Staged rollout + monitoring.
6. Cleanup of legacy header-based auth and docs update.

---

### 2. Target Architecture

#### 2.1. Session Lifecycle

1. **Login / Accept Invitation / Any auth that creates a session**
   - API authenticates credentials and returns `sessionToken` + `sessionExpiresAt`.
   - Either:
     - **Preferred:** The API itself sets the httpOnly cookie via `Set-Cookie`, or
     - **Alternative (closer to current code):** Frontend action receives `sessionToken` and sets the httpOnly cookie in its own response.
   - Cookie attributes:
     - `name`: `SESSION_TOKEN_COOKIE_KEY` (already shared in TS/C# constants).
     - `httpOnly: true`
     - `secure: true` (production only; in dev, `secure` can be off for `http://localhost`).
     - `sameSite: 'strict'` (recommended) or `'lax'` if UX demands.
     - `path: '/'`
     - `expires: sessionExpiresAt`

2. **Authed API requests**
   - Browser automatically includes the httpOnly cookie on requests to the API origin.
   - No `X-Session-Token` header is set by JS.
   - API middleware reads the session token from `Request.Cookies[SESSION_TOKEN_COOKIE_KEY]`.

3. **Logout / Expiry**
   - API logout endpoint invalidates the session server-side (if persisted) and clears the cookie.
   - On expired/invalid session, API returns 401 with structured `ApiResponse`; frontend:
     - Clears any local state (React Query caches, etc.).
     - Redirects to login with a `redirect_cause` query param.

#### 2.2. CSRF Defense-in-Depth

We combine Claude’s layered approach with the double-submit model from the previous GPT plan. The result:

1. **Layer 1 – SameSite cookie attribute (first line of defense)**
   - On the session cookie:
     - **Default**: `SameSite=Strict` (maximum CSRF protection).
     - Fallback to `SameSite=Lax` if Strict breaks valid flows (e.g. email links, cross-site SSO).

2. **Layer 2 – Custom header on mutating requests**
   - Frontend sets at least:
     - `X-Requested-With: XMLHttpRequest` on all **mutating** requests (POST/PUT/PATCH/DELETE).
   - Optionally also:
     - `X-CSRF-Token: <token>` with a token sourced from a CSRF cookie or from loader data (see §3.2).
   - Browsers prevent cross-site forms/links from setting custom headers, so this blocks classic CSRF.

3. **Layer 3 – Origin/Referer validation**
   - On the API, for mutating requests:
     - Read `Origin` header, falling back to `Referer` if `Origin` is absent.
     - Check against an allowlist of front-end origins (`Security:AllowedOrigins` in config).
   - Requests from untrusted origins are rejected with 403 and structured `ApiResponse`.

4. **Optional Layer 4 – Double-submit CSRF token**
   - For especially sensitive operations (e.g. changing password, managing billing), add:
     - A non-httpOnly CSRF cookie (e.g. `PUBLYAPP-CSRF`) generated server-side.
     - Frontend reads this cookie (or loader-provided value) and sends `X-CSRF-Token`.
     - Middleware verifies that CSRF cookie value == header value.
   - This comes on top of Layers 1–3.

---

### 3. Backend Changes (API)

#### 3.1. Phase 1 – Support Cookie-Based Session Auth (1–2 days)

**Goal:** API can authenticate from either cookie or header, with a preference for cookie.

1. **Update `SessionAuthMiddleware`**
   - Read session token from cookie first:
     - `context.Request.Cookies[SESSION_TOKEN_COOKIE_KEY]` (host-only cookie, no `Domain`).
   - If missing, fall back to `X-Session-Token` header (backwards compatibility).
   - Validate the session token (existing service layer).
   - Populate `IAuthContext` as today.
   - Return 401 with `ApiResponse` when session is missing/invalid/expired.

2. **Share constants between TS and C#**
   - Ensure `SESSION_TOKEN_COOKIE_KEY` used in TS (`constants.ts`) is mirrored in C# (e.g. `SessionConstants.SessionTokenCookieKey`).
   - Avoid hard-coded literals spread across the codebase.

3. **Tests**
   - Cookie present → auth succeeds.
   - Only header present → auth succeeds (for now).
   - Neither present → 401 with expected `ApiResponse.Message`.

#### 3.2. Phase 2 – CSRF Middleware (2–3 days)

**Goal:** All mutating requests from browsers are protected by multiple checks.

1. **Create `CsrfProtectionMiddleware`**
   - Namespace: `MainApi.Src.Lib.Middleware`.
   - Responsibilities:
     - **Skip safe methods**: `GET`, `HEAD`, `OPTIONS` (idempotent).
     - **Check for authenticated session**:
       - If no valid session is present (e.g. `AuthContext` not set), let SessionAuthMiddleware produce 401, or simply proceed to existing auth logic.
     - **Custom header check**:
       - For state-changing methods, require `X-Requested-With: XMLHttpRequest`.
       - Optionally require `X-CSRF-Token` for selected endpoints (configurable).
     - **Origin/Referer validation**:
       - Read `Origin` or `Referer`.
       - Parse into scheme + host + optional port.
       - Check against `Security:AllowedOrigins` list from config.
     - On any failure:
       - Respond with 403 + `ApiResponse` (new `ResponseKeys.CsrfViolation` or similar).
       - Log with structured context (method, path, origin, user agent).

2. **Configuration (`appsettings*.json`)**
   - Add:
     - `Security.AllowedOrigins` array per environment:
       - Dev: `["http://localhost:5050", "http://127.0.0.1:5050"]`
       - Prod: `["https://app.publy.app", "https://www.publy.app"]` (adjust to real domains).

3. **Pipeline ordering**
   - Middleware order (high-level), respecting AGENTS.md:
     1. Security headers (CSP, etc.).
     2. Exception handling.
     3. CORS.
     4. **CSRF protection middleware**.
     5. Tenant/session header checks (existing).
     6. Session authentication.
     7. Staff/Tenant authorization.

4. **Tests**
   - Without `X-Requested-With` on POST → 403.
   - With wrong Origin/Referer → 403.
   - With valid headers + origin → pass-through.
   - Safe methods (GET/HEAD/OPTIONS) unaffected.

#### 3.3. Phase 3 – Auth Handlers Set/Clear HttpOnly Cookie (1–2 days)

**Goal:** Only the httpOnly cookie carries the session; token is never returned to the client as a JS-consumable credential.

1. **Login handler (`Login.cs` or equivalent)**
   - After successful login:
     - Generate/obtain `sessionToken` and `sessionExpiresAt`.
     - Set cookie via `HttpContext.Response.Cookies.Append` with:
       - `HttpOnly = true`, `Secure = true` (prod), `SameSite = Strict/Lax`, `Path = "/"`, `Expires = sessionExpiresAt`.
     - Return `Ok<LoginSuccess>` without including the raw token in the body.

2. **Accept-invitation / register / other session-creating handlers**
   - Same pattern as login.

3. **Logout handler**
   - Invalidate the session in the database/service.
   - Delete the cookie via `HttpContext.Response.Cookies.Delete` using matching options (host-only, same path).
   - Optionally also clear CSRF cookie (if using a double-submit token).

---

### 4. Frontend Changes (React + React Router)

#### 4.1. Phase 1 – API Client & CSRF Header Injection (1–2 days)

**Goal:** Ensure all mutating API requests include the custom CSRF header(s) and send cookies.

1. **Kiota client / fetch configuration**
   - Centralize configuration in `client-manager`:
     - All requests should:
       - Use `credentials: 'include'` so the browser sends cookies.
       - Add `X-Requested-With: XMLHttpRequest` on mutating requests.
       - Optionally add `X-CSRF-Token` if you adopt the double-submit token.
   - Ensure `X-Session-Token` is **no longer set** anywhere.

2. **Where to attach headers**
   - Prefer a single request middleware/hook, not per-call logic:
     - E.g. Kiota’s middleware pipeline or a fetch wrapper used by the generated client.

3. **Anonymous client**
   - For login/accept-invitation, use an anonymous client that:
     - Still sets `credentials: 'include'` (so `Set-Cookie` from the API is accepted).
     - Still sets `X-Requested-With` if the endpoint is mutating (login is a POST).

#### 4.2. Phase 2 – Stop Reading Session Cookie in JS (1–2 days)

**Goal:** JS no longer inspects `SESSION_TOKEN_COOKIE_KEY` or manages it directly.

1. **Remove cookie-based auth checks**
   - Deprecate and eventually remove:
     - `getSessionCookieFromClient()`.
     - JS paths that decide “logged in vs logged out” solely based on `document.cookie`.
   - Instead:
     - Use server loaders / auth endpoints to determine authenticated status.
     - For authed pages:
       - Either use a small “auth health check” API call on mount (cookie-based),
       - Or gradually move to a server-loader-first model where feasible.

2. **Existing httpOnly fix flows**
   - Keep the recent httpOnly-mismatch defense (clear legacy cookies when needed) as a **safety net** during migration.
   - Once all tokens are httpOnly and no JS code relies on reading them, you can simplify or remove those flows.

#### 4.3. Phase 3 – Login/Accept Invitation Actions (1–2 days)

**Goal:** Align auth actions with new backend behavior.

Depending on whether the API or the front sets the cookie:

1. **API sets cookie (preferred)**
   - Login action:
     - Calls backend login endpoint using anonymous client.
     - API sends `Set-Cookie` with the httpOnly session cookie.
     - Action checks response and redirects to the authed route; no cookie manipulation in front code.
   - Same for accept-invitation and other session-initializing flows.

2. **Frontend sets cookie (alternative, closer to current pattern)**
   - Login action:
     - Receives `sessionToken` and `sessionExpiresAt`.
     - Uses `cookie.serialize` to set httpOnly cookie attributes in the **action response headers**.
     - Redirects as before.
   - Ensure attributes match what the backend expects (host-only, same path, SameSite, etc.).

Either model is acceptable; prefer the one that causes fewer changes to your current vertical slices and avoids duplicating cookie logic across services.

---

### 5. CSRF Model Details (Merged)

#### 5.1. Baseline (Always On)

1. **SameSite**
   - Start with `SameSite=Strict` if possible:
     - Blocks cross-site form submits and many other CSRF vectors.
     - Evaluate whether it breaks email link flows or SSO.
   - If Strict is too restrictive:
     - Move to `SameSite=Lax`.
     - Keep Layers 2 and 3 (headers + origin) enforced strictly.

2. **Custom Header (X-Requested-With)**
   - Required for:
     - All mutating requests from the web app (POST/PUT/PATCH/DELETE).
   - Not required for:
     - GET/HEAD/OPTIONS.

3. **Origin/Referer validation**
   - Always enforced for mutating requests.
   - Configurable per environment via `Security:AllowedOrigins`.

#### 5.2. Optional Double-Submit Token (For High-Risk Ops)

For actions like password change, email change, payment operations:

1. **CSRF cookie (`PUBLYAPP-CSRF`)**
   - Non-httpOnly.
   - Random, opaque value.
   - `secure: true`, `sameSite: 'lax'`, `path: '/'`.

2. **Header (`X-CSRF-Token`)**
   - Frontend reads cookie and sets the header on those specific requests.

3. **Middleware**
   - For endpoints annotated as “requires CSRF token”:
     - Compare cookie value with header value.
     - If mismatch → 403 with explicit `ApiResponse` and log entry.

---

### 6. CORS & Deployment Considerations

1. **CORS configuration**
   - API must:
     - Use **specific origins** (no `*`) for `Access-Control-Allow-Origin`.
     - Include `Access-Control-Allow-Credentials: true`.
   - Frontend must:
     - Use `credentials: 'include'` on all fetches via Kiota.

2. **Cookie domain**
   - Do **not** set `Domain=` on the session cookie:
     - This keeps it **host-only**, preventing subdomain-based cookie injection.

3. **Environment differences**
   - Dev:
     - `http://localhost:5050` front, `http://localhost:5000` API.
     - `Secure=false` might be necessary for local HTTP.
   - Prod:
     - Enforce `secure: true` and HSTS on API/Frontend.

---

### 7. Testing & Hardening

#### 7.1. Automated Tests

- **Backend**
  - SessionAuthMiddleware cookie vs header behavior.
  - CSRF middleware:
    - Safe methods bypass.
    - Mutations without `X-Requested-With` → 403.
    - Mutations with invalid Origin/Referer → 403.
    - Valid requests → pass.
- **Frontend**
  - React Query hooks / API wrappers always go through the CSRF-header-injecting path.
  - No remaining references to `X-Session-Token` or JS reading the session cookie.

#### 7.2. Manual CSRF Simulations

- **Form-based CSRF**
  - Host a malicious HTML form on a different origin that POSTs to an API endpoint.
  - Expectation: browser cannot set custom headers; CSRF middleware rejects request.

- **Image / GET-based CSRF**
  - `<img src="https://api.publy.app/api/staff/delete?id=123" />`
  - Expectation:
    - Either: endpoint uses POST/DELETE and is thus not reachable.
    - Or: safe GET does not cause side effects.

- **Cross-origin fetch with `credentials: include`**
  - From an untrusted origin, attempt fetch with `credentials: 'include'` + custom headers.
  - Expectation: CORS blocks, or if somehow bypassed, Origin validation fails.

#### 7.3. XSS-related checks

- Verify in browser DevTools:
  - `document.cookie` does **not** contain the session cookie.
  - Session cookie is visible only in Application → Cookies with HttpOnly flag.

---

### 8. Monitoring & Incident Response

1. **Logging**
   - Log CSRF failures with:
     - Method, path, origin, user agent, IP.
   - Log session auth failures with reasons (missing cookie vs invalid vs expired).

2. **Metrics**
   - Number of:
     - CSRF blocks.
     - Origin validation failures.
     - 401/403 from authed endpoints.

3. **Alerts**
   - Thresholds (tune with experience):
     - More than N CSRF blocks from the same IP in 1 hour.
     - Sudden spike in 401/403 across all users.

4. **Playbook**
   - If CSRF attempts spike:
     - Confirm whether any succeeded.
     - Tighten SameSite / Origin policy if needed.
     - Consider mass logout (invalidate all sessions) only if there is clear compromise.

---

### 9. Rollout & Cleanup

1. **Flag-based rollout (optional but recommended)**
   - Add an env flag (e.g. `USE_COOKIE_SESSION_AUTH`) controlling:
     - Whether backend still honors `X-Session-Token`.
     - Whether frontend still sets `X-Session-Token`.
   - Stages:
     - Dev → staging → small % of prod → full prod.

2. **Cleanup (once stable)**
   - Remove header-based fallback from SessionAuthMiddleware.
   - Delete any `X-Session-Token` usage and non-httpOnly session cookie code.
   - Simplify httpOnly-mismatch “rescue” logic once no legacy tokens remain.
   - Update:
     - `AGENTS.md`,
     - Auth-related docs,
     - Onboarding notes for contributors.

---

### 10. Success Criteria

The migration is successful when:

- Session token:
  - Is **only** present in an httpOnly cookie.
  - Does **not** appear in `document.cookie` or any JS-accessible storage.
- All authed API requests:
  - Include the session cookie.
  - Include required CSRF headers on mutating methods.
- CSRF tests:
  - Simulated attacks are reliably blocked by middleware / CORS / origin checks.
- UX:
  - Login, logout, and authed flows behave as before (or better).
  - No significant increase in 401/403 in production after rollout.
- Operations:
  - Monitoring shows expected CSRF/401/403 patterns.
  - No incidents attributable to the new auth model.


