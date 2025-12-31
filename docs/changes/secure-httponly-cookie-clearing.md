# Secure HttpOnly Cookie Clearing Implementation

## Problem

1. **Logout CSRF Vulnerability**: The original implementation used a GET query parameter (`?clear_session_token_cookie=true`) to clear session cookies. This allowed attackers to craft malicious links that would force users to log out.

2. **HttpOnly Cookie Mismatch**: When a user manually sets the session cookie to `httpOnly` in DevTools (or if there's a cookie configuration mismatch), the server can see the cookie but JavaScript cannot. This caused infinite redirect loops between auth pages and authed pages.

3. **Double Page Load**: When redirecting from `authed-layout` to login, the `auth-layout` had to detect and clear any httpOnly cookie separately, causing an extra page reload.

---

## Solution Architecture

Created a dedicated POST-only route (`/auth/clear-session`) that handles all session cookie clearing. It uses **POST + Origin/Fetch-metadata validation** to prevent cross-site form submissions and provides a single entry point for clearing both regular and httpOnly cookies.

---

## Files Changed

### 1. `packages/shared/lib/constants.ts`

- Added `formActionKey.clear_httponly_session` constant for the form action identifier
- Added `FRONT_PATH_NAMES.auth.clearSession` path (`/auth/clear-session`)

### 2. `apps/front/app/routes.ts`

- Registered the new `/auth/clear-session` route as a standalone route (outside any layout)

### 3. `apps/front/app/routes/auth/clear-session.tsx` (NEW FILE)

- Action-only route (no loader, no component)
- Accepts POST requests with `action=clear_httponly_session`
- Optionally accepts `redirect_cause` to pass to the login page
- Clears session cookies using `createClearSessionCookieHeaders()`
- Redirects to login page with appropriate query params

### 4. `apps/front/app/routes/auth/_layout/auth-layout.tsx`

- Updated `clientLoader` to submit a form to `/auth/clear-session` when detecting httpOnly cookie mismatch (server sees token, JS doesn't)
- Uses `FRONT_PATH_NAMES.auth.clearSession` instead of hardcoded path

### 5. `apps/front/app/routes/authed/_layout/authed-layout.tsx`

- Replaced `clearSessionAndGetLoginUrl()` with `clearSessionAndRedirectToLogin()`
- New function submits a form to `/auth/clear-session` instead of directly redirecting to login
- Includes `redirect_cause=invalid_session` in the form data
- Updated all three usage locations: `clientLoader`, `ErrorBoundary`, and `AuthQueriesGuard`
- Removed unused `redirect` import

---

## Flow Diagrams

### Before (Vulnerable)

```
User clicks malicious link: /login?clear_session_token_cookie=true
  -> Cookie cleared via GET request (CSRF vulnerable!)
  -> User logged out without consent
```

### Before (Double reload issue)

```
User on authed page with httpOnly cookie mismatch
  -> authed-layout redirects to /login (doesn't clear httpOnly)
  -> auth-layout detects httpOnly mismatch
  -> auth-layout submits form to clear cookie
  -> Redirects to /login again (double load)
```

### After (Secure, single redirect)

```
User on authed page with httpOnly cookie mismatch
  -> authed-layout submits POST form to /auth/clear-session
  -> clear-session clears ALL cookies (including httpOnly)
  -> Redirects to /login?redirect_cause=invalid_session
  -> Login page loads once, shows "session expired" toast
```

---

## Security Improvements

1. **POST + Origin Validation**: Cookie clearing requires POST request with valid same-origin/same-site Origin header
2. **No Exploitable URLs**: Attackers cannot craft links to force logout (GET requests don't trigger actions)
3. **Cross-Site Form Protection**: Server validates `Origin` and `Sec-Fetch-Site` headers, rejecting cross-origin requests
4. **Single Source of Truth**: All cookie clearing goes through `/auth/clear-session`
5. **Proper HttpOnly Handling**: Server-side clearing handles cookies JavaScript cannot access

---

## Additional Changes (Unrelated to Security)

### `apps/front/app/lib/mui/theme/core/components/textfield.tsx`

- Fixed autofill background styling (transparent background, proper text color inheritance)
- Fixed input height to fill container (changed `minHeight` to `height` on container)
- Fixed adornment (eye icon) vertical centering using `alignItems: 'center'` on root and `alignSelf: 'stretch'` on input
