## HttpOnly Cookie Migration – Architecture Options (Unapproved)

This document captures the **design space of possible architectures** for moving PublyApp to httpOnly session cookies.  
It is **exploratory** and **not an approved implementation plan**. The concrete migration plan, when agreed, will live in its own document (for example `httponly-cookie-migration.md`).

---

### Option 1 – Cookie-Based API Auth (Browser → API Direct, No BFF)

- **Idea**
  - The browser sends an httpOnly `SESSION_TOKEN_COOKIE_KEY` cookie automatically with every API call.
  - The API reads the session token from the `Cookie` header instead of `X-Session-Token`.

- **Backend**
  - Update `SessionAuthMiddleware` to first look at `Request.Cookies[SESSION_TOKEN_COOKIE_KEY]`.
  - Keep `X-Session-Token` support temporarily for backward compatibility during rollout.
  - Login/accept-invitation set a single httpOnly cookie with:
    - `httpOnly: true`
    - `secure: true` (in production)
    - `sameSite: 'lax'` (or stricter)
    - `path: '/'`

- **Frontend**
  - Stop reading the session cookie for auth decisions.
  - Stop attaching `X-Session-Token` in the Kiota client; just call the API normally.
  - Ensure all API calls either:
    - Use same-origin, or
    - Use `credentials: 'include'` with CORS configured appropriately.

- **Security / CSRF**
  - With cookie-based sessions, CSRF must be handled explicitly:
    - Use `SameSite=Lax`/`Strict` on the session cookie.
    - Optionally add a CSRF token (e.g. from a loader) in a custom header for unsafe HTTP methods.

- **Pros**
  - Simple, “classic” cookie-based session model.
  - Minimal conceptual change on the backend: only where the session token is read.

- **Cons**
  - CSRF protection needs a clear, well-documented strategy.
  - Still a direct browser → API relationship (no BFF indirection).

---

### Option 2 – BFF / API Proxy in the Frontend Server

In this family of options, the React Router server runtime acts as a **Backend-for-Frontend (BFF)** that sits between browser and API.

#### 2.1 – Full BFF (No Direct API Calls from Browser)

- **Idea**
  - All authed data flows through the frontend server:
    - Browser → React Router loaders/actions/custom endpoints.
    - Frontend server reads httpOnly cookie and calls API with `X-Session-Token`.

- **Behavior**
  - API remains header-based (`X-Session-Token`) internally.
  - Browser never calls the API directly, only the frontend app server.
  - Auth decisions and data fetching for authed routes happen server-side.

- **Pros**
  - Very strong isolation: JS never sees or handles the session token.
  - Centralized spot (BFF) for auth, CSRF, logging, throttling, etc.

- **Cons**
  - Large refactor of authed routes: move from client-only fetching to loaders/actions for most data.
  - Extra network hop (Browser → BFF → API) adds some complexity and potential latency.

#### 2.2 – Hybrid BFF (React Query Still Used, But Targets BFF Endpoints)

- **Idea**
  - Preserve the current “client-only authed pages” UX but:
    - TanStack Query hooks call `/front-api/*` endpoints on the frontend server.
    - Those endpoints:
      - Read the httpOnly cookie,
      - Call the backend API,
      - Return JSON to the browser.

- **Pros**
  - Retains existing react-query patterns and `QueryDisplay` usage.
  - HttpOnly cookie never leaves the BFF boundary.
  - Can migrate feature-by-feature (start with critical flows).

- **Cons**
  - Additional boilerplate: each proxied API call needs a small BFF endpoint.
  - Still need CSRF protection for BFF endpoints that mutate state.

---

### Option 3 – Split Token: HttpOnly Session Cookie + Frontend Token

- **Idea**
  - Use **two tokens**:
    - HttpOnly session cookie: the “real” session id, never visible to JS.
    - Short-lived frontend token: JS-readable (e.g. via response body or non-httpOnly cookie), used in headers for API calls.

- **Flow**
  - On login:
    - Server sets httpOnly session cookie with long-lived session.
    - Server also returns a short-lived frontend token (JWT or opaque).
  - JS stores the frontend token (preferably in memory) and uses it in `Authorization` or a custom header.
  - API validates the frontend token and maps it back to the underlying session.

- **Pros**
  - HttpOnly session cookie protects the primary credential against theft.
  - Frontend keeps header-based auth semantics; smaller changes to Kiota integration.
  - Can constrain frontend token lifetime and scope.

- **Cons**
  - More complex lifecycle (minting, rotation, revocation of frontend tokens).
  - XSS can still act as the user using the frontend token until it expires.
  - Significantly more moving parts than a single-cookie/session model.

---

### Option 4 – Full Server-Side Auth & Data Loading (Maximal Refactor)

- **Idea**
  - Make **all meaningful auth checks and core data loading server-side** via loaders/actions:
    - Session lives only as an httpOnly cookie.
    - Loaders/actions:
      - Read cookie,
      - Validate session against the API,
      - Return structured auth/data objects.
    - Client code consumes loader data instead of reading cookies or making direct API calls for critical data.

- **Behavior**
  - Browser never needs the raw session token at all.
  - Authed routes become SSR/SR-first, with client hydration.
  - TanStack Query becomes an optimization layer (prefetch/rehydration) rather than the single source of truth.

- **Pros**
  - Strongest security story and very clean conceptual model.
  - Auth logic centralized in server loaders/actions, easier to reason about.

- **Cons**
  - Large change to the current pattern (“authed pages are client-only”).
  - Requires careful planning and incremental rollout to avoid UX/perf regressions.

---

### Option 5 – Strengthen Non-HttpOnly Model (If HttpOnly Is Deferred)

Even if the goal is to move to httpOnly long-term, it’s useful to explicitly document the “stay non-httpOnly, but harden everything else” path.

- **Idea**
  - Keep non-httpOnly session cookies but:
    - Apply strict CSP (no inline scripts, limited script-src).
    - Minimize or sandbox 3rd-party scripts.
    - Use `SameSite='lax'|'strict'` and `secure: true` for cookies.
    - Enforce strong input validation and output encoding across the app.

- **Pros**
  - Minimal refactor of existing auth flows.
  - Can significantly raise the bar against many XSS vectors.

- **Cons**
  - Session token remains accessible via `document.cookie`; XSS can still exfiltrate it if CSP or other defenses are bypassed.
  - Usually not sufficient for stricter audits/compliance requirements.

---

### How to Use This Document

- **Not a decision record:**  
  This file enumerates **options**, not choices. It is intended to support architectural discussion.

- **Next steps could include:**
  - Selecting one or two preferred options (e.g. Option 1 vs. Option 2.2).
  - Writing an **ADR** (Architecture Decision Record) or updating the implementation plan once a direction is chosen.
  - Creating per-option spike tasks to validate feasibility and complexity on a small slice of the app.


