## HttpOnly Cookie Migration – Option 1 (Direct API Cookie Auth) Implementation Plan

> **Status:** Draft – describes the preferred direction (Option 1) and the security model to implement.
> **Goal:** Move PublyApp to httpOnly cookie–based auth for API access, with a solid CSRF story and minimal disruption to existing UX.

---

### 1. Executive Summary

**Current state:**
- Session token is stored in a **non-httpOnly cookie**, read by frontend JS.
- JS attaches the token as `X-Session-Token` on API calls via the Kiota client.
- Authed React Router routes are client-only and assume JS can see the session token.

**Target state (Option 1):**
- Session token is stored in a **single httpOnly cookie** (`SESSION_TOKEN_COOKIE_KEY`).
- Browser automatically sends this cookie on all API requests.
- **API** reads the session token from the `Cookie` header (not from JS).
- **JS no longer needs access** to the session token (no `X-Session-Token` header).
- All CSRF and related security concerns for cookie-based sessions are explicitly addressed.

---

### 2. Target Architecture (Option 1)

#### 2.1. High-Level Flow

1. **Login / Accept Invitation**
   - Backend returns `sessionToken` and `sessionExpiresAt`.
   - Frontend server action sets a **single** httpOnly session cookie:
     - `SESSION_TOKEN_COOKIE_KEY = sessionToken`
     - `httpOnly: true`, `secure: true` (prod), `sameSite: 'lax'`, `path: '/'`.
   - Frontend redirects to the appropriate authed route.

2. **Authed API Calls**
   - Browser automatically includes the httpOnly cookie with all requests to the API origin.
   - The Kiota client **no longer** injects `X-Session-Token`.
   - API processes the cookie in `SessionAuthMiddleware`, sets `AuthContext`, etc.

3. **Logout / Session Expiry**
   - Logout endpoint:
     - Invalidates the session server-side (if sessions are persisted).
     - Returns `Set-Cookie` with `SESSION_TOKEN_COOKIE_KEY` cleared (expired).
   - On invalid or expired session, API returns 401/403; frontend clears any UI state and redirects to login.

4. **CSRF Protection**
   - Because session is cookie-based, CSRF must be explicitly mitigated:
     - `SameSite=Lax` on session cookie.
     - **Double-submit CSRF token** (CSRF cookie + header) for mutating requests.
     - Optional **Origin/Referer checks** on mutating endpoints.

---

### 3. Security Model for Option 1

#### 3.1. Session Cookie Properties

**Session cookie (`SESSION_TOKEN_COOKIE_KEY`):**
- `httpOnly: true` – JS cannot read or write the cookie.
- `secure: true` – only sent over HTTPS (in production).
- `sameSite: 'lax'` – blocks most cross-site form/GET CSRF, still allows common flows.
- `path: '/'` – valid for all API endpoints.
- **Domain:**
  - In dev: default host-only (e.g. `localhost`).
  - In prod: configured so that frontend and API share the same site (e.g. both on `*.publy.app`), or otherwise via CORS + `credentials: 'include'`.

#### 3.2. CSRF Protection (Double-Submit + SameSite)

We adopt a **double-submit token** model on top of `SameSite=Lax`:

- **CSRF cookie (`PUBLYAPP-CSRF` or similar):**
  - Random, opaque value (e.g. 128-bit base64).
  - **Non-httpOnly** so that JS can read it safely (it is not a credential).
  - `secure: true`, `sameSite: 'lax'`, `path: '/'`.

- **CSRF header (`X-CSRF-Token`):**
  - For **all mutating requests** (`POST`, `PUT`, `PATCH`, `DELETE`), frontend:
    - Reads CSRF token (from cookie or from initial loader data).
    - Sends it as `X-CSRF-Token: <token>` header.

- **Server-side CSRF middleware:**
  - For mutating methods **only**:
    1. Check that a session exists (otherwise respond 401/403 via existing auth).
    2. Read CSRF cookie and `X-CSRF-Token` header.
    3. If either is missing or they don’t match → reject with 403 and consistent `ApiResponse`.
    4. Optionally, check `Origin` or `Referer` header matches expected front origins.

- **Why this is robust:**
  - A cross-site attacker can cause the browser to send the **session cookie**, but:
    - They **cannot read** the CSRF cookie (same-origin).
    - They cannot set a matching `X-CSRF-Token` header from a plain form or link.
    - Only scripts running on the trusted origin can read the CSRF cookie and set the header.

#### 3.3. Additional Concerns

- **XSS:**
  - HttpOnly means the session cookie can’t be exfiltrated by XSS.
  - XSS can still perform actions using the current session (as the user).
  - Mitigations (independent of this plan):
    - Strong CSP (no inline scripts where possible).
    - Careful handling of untrusted HTML (no `dangerouslySetInnerHTML` without sanitization).

- **Session Fixation:**
  - Always **generate a new session token on login** and overwrite any existing session cookie.
  - If you add “remember me” or magic-link flows later, ensure they also rotate tokens on successful authentication.

- **Logout:**
  - Explicit logout endpoint must:
    - Invalidate server-side session (if persisted).
    - Send `Set-Cookie` that clears `SESSION_TOKEN_COOKIE_KEY` (and ideally CSRF cookie as well).

---

### 4. Implementation Phases

#### Phase 0 – Preconditions / Inventory (0.5–1 day)

1. **Baseline understanding:**
   - Confirm all places where:
     - `SESSION_TOKEN_COOKIE_KEY` is set/cleared (login, accept-invitation, logout, error flows).
     - `X-Session-Token` is read on the backend (middleware, tests).
     - `X-Session-Token` is set on the frontend (Kiota client config).
2. **Decide production domain strategy:**
   - Same origin (e.g. `app.publy.app/api`), or
   - Subdomains (e.g. `app.publy.app` + `api.publy.app`), with CORS + `credentials: 'include'`.

Deliverable: Short checklist of all auth touchpoints in backend + frontend.

---

#### Phase 1 – Backend: Cookie-Based Auth Support (1–2 days)

**Goal:** API can authenticate using httpOnly session cookies, while still accepting `X-Session-Token` headers for backwards compatibility.

1. **Update `SessionAuthMiddleware` (or equivalent):**
   - Pseudocode in C#:
   - Prefer cookie over header:
     - Read `SESSION_TOKEN_COOKIE_KEY` from `HttpContext.Request.Cookies`.
     - If present and valid → use it.
     - Else, fall back to `X-Session-Token` header (for old clients).
   - Keep all existing logging, error semantics, and `AuthContext` behavior.

2. **Add configuration/constants for cookie name and attributes:**
   - Ensure same `SESSION_TOKEN_COOKIE_KEY` is shared in backend and frontend (TS + C#).

3. **Add tests:**
   - Auth succeeds when cookie is present.
   - Auth succeeds when only header is present (compat).
   - Auth fails when neither is present.

Deliverable: Backend can handle both header-based and cookie-based sessions, with a clear preference order.

---

#### Phase 2 – Backend: CSRF Middleware (2–3 days)

**Goal:** Add robust CSRF protection for all mutating endpoints when using cookie-based sessions.

1. **Design CSRF configuration:**
   - Allowed origins (frontend URLs per environment).
   - CSRF cookie name (e.g. `PUBLYAPP-CSRF`).
   - Header name (`X-CSRF-Token`).

2. **Implement CSRF middleware:**
   - Placed **after** CORS & auth middleware, **before** endpoint execution.
   - For methods `POST`, `PUT`, `PATCH`, `DELETE`:
     - If no authenticated session → let existing auth middleware handle (401).
     - Else:
       - Read CSRF cookie value and header value.
       - If missing or mismatch → return 403 with `ApiResponse` and appropriate `ResponseKeys` entry.
       - Optionally, validate `Origin`/`Referer` header matches configured front origins.

3. **Wire it into the pipeline in correct order** (see AGENTS.md middleware order).

4. **Add tests:**
   - Valid CSRF cookie + header → request passes through.
   - Missing or mismatched CSRF → 403.
   - GET/HEAD/OPTIONS remain unaffected.

Deliverable: CSRF middleware in place and covered by unit/integration tests.

---

#### Phase 3 – Frontend: Session Cookie & CSRF Token Management (2–3 days)

**Goal:** Frontend sets/clears the httpOnly session cookie and manages CSRF tokens, without ever reading the session cookie in JS.

1. **Session cookie on login / accept invitation:**
   - In `login-page.tsx` and `accept-invitation-page.tsx` actions:
     - Stop setting non-httpOnly session cookies.
     - Use a shared helper (e.g. `createSessionCookieHeader()`) to:
       - Create httpOnly cookie with correct flags.
       - Append it to response `Set-Cookie` header.

2. **CSRF cookie issuance:**
   - When a session is created (login/accept-invitation) or on first authed request:
     - Generate a random CSRF token server-side.
     - Set a **non-httpOnly** CSRF cookie (e.g. `PUBLYAPP-CSRF`) with:
       - `secure: true`, `sameSite: 'lax'`, `path: '/'`.
     - Optionally, also include the CSRF token in loader data for immediate use on the first page.

3. **CSRF header injection in frontend API client:**
   - Extend the Kiota client setup or global fetch wrapper to:
     - Read CSRF token from cookie (via JS) or from an in-memory cache seeded by loaders.
     - Attach `X-CSRF-Token` header to all mutating requests.
   - Ensure **all** authed POST/PUT/PATCH/DELETE requests go through this code path.

4. **Logout flow:**
   - Ensure logout action:
     - Calls API’s logout endpoint (if present).
     - Returns `Set-Cookie` headers that clear both:
       - `SESSION_TOKEN_COOKIE_KEY`,
       - CSRF cookie.

Deliverable: Frontend no longer sets non-httpOnly session tokens, always attaches CSRF header for mutations, and has a consistent session/CSRF lifecycle.

---

#### Phase 4 – Frontend: Stop Using `X-Session-Token` in JS (1–2 days)

**Goal:** JS no longer touches session tokens; all auth flows rely on httpOnly cookies and server-side validation.

1. **Kiota client configuration:**
   - Remove any code that:
     - Reads session token from cookies (`getSessionCookieFromClient`).
     - Sets `X-Session-Token` header.
   - Client becomes “cookie-aware” only via `fetch` defaults.

2. **Auth/layout logic:**
   - Ensure `auth-layout` / `authed-layout` no longer **require** reading the session cookie for navigation decisions.
   - Initial check for “authenticated or not” should:
     - Rely on backend loaders (or equivalent) where possible, or
     - Use a request to an auth endpoint that is protected by the cookie + CSRF.
   - Existing httpOnly-mismatch handling from the recent fix may remain as a defensive layer against any stray legacy cookies, but should not be required for normal operation.

3. **Clean up old utilities:**
   - Deprecate or delete helpers that:
     - Read `SESSION_TOKEN_COOKIE_KEY` from `document.cookie`.
     - Manually manage `X-Session-Token`.

Deliverable: No remaining frontend code depends on reading the session token; authentication is purely cookie + server-side validation.

---

#### Phase 5 – Testing & Hardening (3–4 days)

1. **Automated tests:**
   - Backend:
     - SessionAuthMiddleware: cookie vs header cases.
     - CSRF middleware: positive/negative cases and origin checks.
   - Frontend:
     - Ensure all mutating React Query hooks / API wrappers pass through the CSRF-injecting layer.

2. **Manual security testing:**
   - **CSRF:**
     - Try a crafted HTML form on another origin pointing at your API.
     - Confirm that it **fails** because the CSRF header is missing.
   - **XSS:**
     - In dev, simulate injected scripts and confirm:
       - `document.cookie` does not show the session cookie.
       - Session cookie is only visible under Application → Cookies with `HttpOnly` checked.

3. **Browser DevTools validation:**
   - Verify session cookie:
     - Has `HttpOnly`, `Secure` (where applicable), `SameSite=Lax`, `path=/`.
   - Verify CSRF cookie:
     - Is non-httpOnly, and has correct flags.
   - Verify network:
     - Session cookie is automatically included.
     - `X-Session-Token` header is absent.
     - `X-CSRF-Token` header is present on mutating requests.

Deliverable: Confidence that cookie-based auth + CSRF are functioning as intended, with regressions addressed.

---

#### Phase 6 – Rollout & Cleanup (2–3 days)

1. **Staged rollout:**
   - Optionally gate cookie-only auth behind an environment flag (e.g. `USE_COOKIE_SESSION_AUTH`).
   - Enable in dev → staging → partial production → full production.
   - Monitor:
     - 401/403 rates,
     - Login success rates,
     - Any spikes in CSRF-related 403s.

2. **Remove `X-Session-Token` support (once stable):**
   - Remove header fallback from `SessionAuthMiddleware`.
   - Delete frontend code and docs referencing `X-Session-Token`.

3. **Documentation updates:**
   - Update `AGENTS.md` with:
     - New auth model (httpOnly cookie + CSRF).
     - Where to hook into session / CSRF logic.
   - Update any onboarding docs describing how to make authenticated API calls.

Deliverable: System uses httpOnly cookie + CSRF exclusively, with old header-based patterns fully removed and documentation up to date.

---

### 5. Summary of Security Guarantees

Once this plan is fully implemented:

- **Session secrecy:**
  - Session token is never exposed to JS (`HttpOnly` cookie).
- **CSRF resistance:**
  - Attacker cannot forge valid `X-CSRF-Token` because:
    - They cannot read the CSRF cookie (same-origin).
    - They cannot set custom headers from plain cross-site forms/links.
  - `SameSite=Lax` further reduces CSRF surface.
- **Session lifecycle:**
  - Tokens are rotated on login, explicitly cleared on logout, and expire server-side.
- **Future-proofing:**
  - Backend remains compatible with other clients (e.g. mobile) during migration by temporarily supporting `X-Session-Token`, then converging on cookies as the standard for the web app.


