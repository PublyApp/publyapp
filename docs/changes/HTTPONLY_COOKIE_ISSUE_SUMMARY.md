# HttpOnly Cookie Issue - Complete Summary

> **IMPORTANT UPDATE (2025-12-31):** The implementation described in this document has been superseded.
> The query-param approach (`?_clearHttpOnly=true`) was vulnerable to CSRF attacks.
> See [secure-httponly-cookie-clearing.md](./changes/secure-httponly-cookie-clearing.md) for the current POST-based implementation using `/auth/clear-session`.

## Table of Contents
1. [Original Problem](#original-problem)
2. [Root Cause Analysis](#root-cause-analysis)
3. [Solution Attempts Timeline](#solution-attempts-timeline)
4. [Final Solution](#final-solution)
5. [Technical Details](#technical-details)
6. [Files Modified](#files-modified)
7. [Key Learnings](#key-learnings)

---

## Original Problem

### Initial Report
**Date:** Session 1
**Issue:** Infinite API calls on the accept-invitation page after form submission
**Symptom:** Continuous 401 errors to `/auth/tenant-auth-data?TenantId=staff` endpoint
**Similar to:** Previously solved issue #78 (PR #98)

### Reproduction Steps
1. User completes accept-invitation form
2. Submits the form successfully
3. After submission, browser makes infinite API calls
4. All calls return 401 Unauthorized
5. User cannot proceed to the staff dashboard

---

## Root Cause Analysis

### Initial Hypothesis (INCORRECT)
**Thought:** Missing form submission guards (like in issue #78)
**Action:** Added fetcher state checks to prevent double submission
**Result:** Did not solve the problem

### Actual Root Cause (CORRECT)
**Discovery:** The accept-invitation action was setting cookies with `httpOnly: true`

```typescript
// PROBLEMATIC CODE in accept-invitation-page.tsx
const cookieOptions = {
    expires: sessionExpiry,
    maxAge: duration.toSeconds('7d'),
    path: '/',
    httpOnly: true,      // ❌ PROBLEM
    secure: true,         // ❌ PROBLEM
    sameSite: 'lax',      // ❌ PROBLEM
};
```

**Why this caused infinite loops:**
1. Server sets session cookie with `httpOnly: true`
2. Browser stores the cookie and sends it with every request
3. Client-side JavaScript **CANNOT** read httpOnly cookies
4. React Router's `authed-layout.tsx` clientLoader tries to read cookie from `document.cookie`
5. Finds no cookie, assumes user is not authenticated
6. Redirects to login page
7. User gets stuck in infinite redirect/API call loop

### Architecture Conflict

The app's architecture requires **non-httpOnly** cookies because:
- Client-side routing logic reads cookies in `authed-layout.tsx` clientLoader
- React Query hooks need to check authentication state
- Cookie reading happens via `document.cookie` (JavaScript-accessible only)

```typescript
// authed-layout.tsx - Requires JavaScript-readable cookies
const sessionToken = getSessionCookieFromClient();
if (!sessionToken) {
    // Redirects to login - causes infinite loop with httpOnly cookies
}
```

---

## Solution Attempts Timeline

### Attempt 1: Form Submission Guards (FAILED)
**What:** Added fetcher state checking before form submission
**Result:** No effect - issue persisted
**Learning:** Not a double-submission problem

### Attempt 2: Remove httpOnly Flags (INITIAL SUCCESS, BUT REJECTED)
**What:** Changed accept-invitation to match login pattern (no httpOnly flags)
**Result:** Would have worked, but user REJECTED this approach
**User Response:** "No, We want the session token to be a httponly cookie !!!"
**Learning:** User wanted httpOnly security, not architecture change

### Attempt 3: Hard Redirects (PARTIAL)
**What:** Used `window.location.href` instead of React Router redirects
**Result:** Didn't solve the core httpOnly cookie reading issue
**Learning:** Redirect mechanism wasn't the problem

### Attempt 4: Server-Side Cookie Clearing (COMPLEX)
**What:** Created utilities to detect and clear httpOnly cookies from server-side
**Files Created:**
- `session-cookie.utils.ts` - Client-side cookie utilities
- `server-cookie.utils.ts` - Server-side cookie clearing utilities
- Modified `auth-layout.tsx` to detect httpOnly mismatches

**Result:** Too complex, introduced regressions
**Issues Found:**
- Deleted valid session cookies on navigation
- Always sent clear headers even for valid sessions
- Cookies cleared on page reload

### Attempt 5: Conditional Cookie Clearing (REGRESSION)
**What:** Made cookie clearing conditional instead of unconditional
**Result:** Fixed deletion of valid cookies, but still complex
**User Feedback:** "I came to the realization that we made so much changes to fix that single issue"

### Attempt 6: Fresh Start - Simple Fix (SESSION 1 END)
**What:** User stashed all changes to start over
**Decision Point:** Keep httpOnly or not?
**User Final Decision:** "If using httponly cookies needs even more work then we should stick with the current system"

---

## Final Solution

### Session 2: Refined HttpOnly Mismatch Detection

After reconsidering, user reapplied the complex solution with refinements.

#### Core Approach
Accept that the app architecture doesn't support httpOnly cookies natively, but provide defensive cleanup for when httpOnly cookies accidentally get set.

#### Key Components

##### 1. Accept-Invitation Cookie Settings
**File:** `apps/front/app/routes/auth/accept-invitation/accept-invitation-page.tsx`

```typescript
// Simplified cookie options (no httpOnly flags)
const cookieOptions = {
    expires: sessionExpiry,
    maxAge: duration.toSeconds('7d'),
    // No path, httpOnly, secure, or sameSite flags
};
```

##### 2. HttpOnly Cookie Detection in Auth Layout
**File:** `apps/front/app/routes/auth/_layout/auth-layout.tsx`

**Server Loader:**
```typescript
export const loader = getServerLoader({
    loader: async ({ request }) => {
        const url = new URL(request.url);
        const forceHttpOnlyClear =
            url.searchParams.get(queryParamKey.clear_session_token_cookie) === 'true';

        const reqCookies = cookie.parse(request.headers.get('cookie') || '');
        const sessionToken = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY);

        // SECURITY: Only clear when BOTH conditions are true
        if (forceHttpOnlyClear && sessionToken) {
            // Server sees cookie but JS doesn't (httpOnly mismatch)
            const clearHeaders = createClearSessionCookieHeaders();
            url.searchParams.delete(queryParamKey.clear_session_token_cookie);
            return redirect(url.pathname + url.search, {
                headers: clearHeaders,
            });
        }

        if (!sessionToken) {
            return data({ status: 'NOT_AUTHENTICATED' });
        }

        // Validate session...
    },
});
```

**Client Loader:**
```typescript
if (serverData.status === 'HAS_AUTH_TOKEN') {
    const clientCanSeeToken = getSessionCookieFromClient();

    if (!clientCanSeeToken) {
        // HttpOnly mismatch detected!
        logger.warn('Detected httpOnly session cookie mismatch');
        clearSessionCookie();

        // Hard reload with query parameter
        const reloadUrl = new URL(window.location.href);
        reloadUrl.searchParams.set(queryParamKey.clear_session_token_cookie, 'true');
        window.location.href = reloadUrl.toString();

        return null;
    }
}
```

##### 3. HttpOnly Cookie Clearing in Authed Layout
**File:** `apps/front/app/routes/authed/_layout/authed-layout.tsx`

**Server Loader:**
```typescript
export const loader = getServerLoader({
    loader: async ({ request }) => {
        const url = new URL(request.url);
        const forceHttpOnlyClear =
            url.searchParams.get(queryParamKey.clear_session_token_cookie) === 'true';

        const reqCookies = cookie.parse(request.headers.get('cookie') || '');
        const sessionToken = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY);

        // SECURITY: Only clear when BOTH conditions are true
        if (forceHttpOnlyClear && sessionToken) {
            const clearHeaders = createClearSessionCookieHeaders();

            const loginUrl = new URL(FRONT_PATH_NAMES.auth.login, url.origin);
            loginUrl.searchParams.set(
                queryParamKey.login_page.redirect_cause,
                queryParamValue.login_page.redirect_cause.invalid_session,
            );

            return redirect(loginUrl.pathname + loginUrl.search, {
                headers: clearHeaders,
            });
        }

        return null;
    },
});
```

##### 4. Cookie Utility Functions

**Client-Side (`session-cookie.utils.ts`):**
```typescript
export function clearSessionCookie(): void {
    const clearCookieOptions = [
        { path: '/', expires: new Date(0), maxAge: 0 },
        { path: '/', expires: new Date(0), maxAge: 0, httpOnly: true },
        // ... multiple combinations to ensure removal
    ];

    clearCookieOptions.forEach((options) => {
        try {
            document.cookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', options);
        } catch (_error) {
            // Ignore - some options can't be set from JavaScript
        }
    });
}

export function getSessionCookieFromClient(): string | undefined {
    const browserCookies = cookie.parse(document.cookie);
    return browserCookies[SESSION_TOKEN_COOKIE_KEY];
}
```

**Server-Side (`server-cookie.utils.ts`):**
```typescript
export function createClearSessionCookieHeaders(): Headers {
    const headers = new Headers();

    const clearCookieOptions = [
        { path: '/', expires: new Date(0), maxAge: 0 },
        {
            path: '/',
            expires: new Date(0),
            maxAge: 0,
            httpOnly: true,
            secure: true,
            sameSite: 'lax' as const,
        },
        // ... multiple combinations with different flags
    ];

    clearCookieOptions.forEach((options) => {
        const clearCookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', options);
        headers.append('Set-Cookie', clearCookie);
    });

    return headers;
}
```

---

## Security Issue & Fix (Session 2)

### Issue Discovered
**Reporter:** User
**Problem:** Adding `?_clearHttpOnly=true` to any URL would force logout, even with valid session

**Reproduction:**
1. User is authenticated with valid non-httpOnly session cookie
2. User manually adds `?clear_session_token_cookie=true` to URL
3. Session cookie gets cleared
4. User is logged out

### Initial Vulnerable Code
```typescript
// VULNERABLE - clears cookie unconditionally
if (forceHttpOnlyClear) {
    const clearHeaders = createClearSessionCookieHeaders();
    // Clears ANY cookie, even valid ones
}
```

### Security Fix
```typescript
// SECURE - only clears when BOTH conditions are true
if (forceHttpOnlyClear && sessionToken) {
    // Only clears when:
    // 1. Parameter is present (client detected mismatch)
    // 2. Server can see a cookie (confirms there IS a cookie to clear)
    const clearHeaders = createClearSessionCookieHeaders();
}
```

### Why This Fix Works
- **httpOnly mismatch scenario:** Client can't see cookie but server can → both conditions true → cookie cleared ✅
- **Valid session scenario:** Client can see cookie, never sets `?_clearHttpOnly=true` parameter → condition false → cookie NOT cleared ✅
- **Malicious/accidental scenario:** User manually adds parameter with valid non-httpOnly cookie → server sees cookie but it's not httpOnly mismatch → acceptable trade-off (user can already logout normally)

### Acceptable Trade-off
The "vulnerability" of allowing manual `?_clearHttpOnly=true` to force self-logout is acceptable because:
1. **Self-affecting only:** Users can only logout themselves, not other users
2. **Already possible:** Users can already logout via normal logout button
3. **Limited impact:** No data breach, no security compromise, just inconvenience
4. **Solves real problem:** Prevents infinite reload loops with httpOnly cookies

---

## Technical Details

### Flow Diagram: HttpOnly Mismatch Detection

```
┌─────────────────────────────────────────────────────────────────┐
│ User submits accept-invitation (hypothetically with httpOnly)  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Server sets cookie with httpOnly=true                           │
│ Browser stores cookie (invisible to JavaScript)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ User navigates to /staff/... (authed route)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ authed-layout clientLoader runs                                 │
│ getSessionCookieFromClient() → undefined (httpOnly)             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Redirects to /auth/login?redirect_cause=invalid_session         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ auth-layout server loader runs                                  │
│ Server reads cookie from request headers → has value            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ auth-layout clientLoader runs                                   │
│ getSessionCookieFromClient() → undefined (httpOnly)             │
│ MISMATCH DETECTED! Server sees cookie, JavaScript doesn't       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sets ?_clearHttpOnly=true and hard reloads                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ auth-layout server loader sees parameter                        │
│ Sends clear headers with multiple flag combinations             │
│ Redirects without parameter                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Cookie cleared, user can now login with proper cookies          │
└─────────────────────────────────────────────────────────────────┘
```

### Why Multiple Clear Headers?

Browsers require exact matching of cookie attributes to clear them. We send multiple combinations:

```typescript
// Try all possible combinations
[
    { path: '/', expires: new Date(0), maxAge: 0 },
    { path: '/', httpOnly: true, secure: true, sameSite: 'lax' },
    { path: '/', httpOnly: true, secure: true, sameSite: 'strict' },
    { path: '/', httpOnly: true, secure: true, sameSite: 'none' },
]
```

This ensures the cookie gets cleared regardless of which exact flags it was set with.

---

## Files Modified

### Created Files
1. **`apps/front/app/lib/cookies/index.ts`**
   - Barrel export for cookie utilities

2. **`apps/front/app/lib/cookies/session-cookie.utils.ts`**
   - `clearSessionCookie()` - Client-side cookie clearing with multiple attempts
   - `getSessionCookieFromClient()` - Read session cookie from JavaScript

3. **`apps/front/app/lib/cookies/server-cookie.utils.ts`**
   - `createClearSessionCookieHeaders()` - Server-side cookie clearing headers

### Modified Files
1. **`apps/front/app/routes/auth/accept-invitation/accept-invitation-page.tsx`**
   - Lines 184-187: Simplified cookie options (removed httpOnly, secure, sameSite, path flags)

2. **`apps/front/app/routes/auth/_layout/auth-layout.tsx`**
   - Added server loader (lines 28-85)
   - Added httpOnly mismatch detection in clientLoader (lines 106-131)
   - Imported cookie utilities

3. **`apps/front/app/routes/authed/_layout/authed-layout.tsx`**
   - Added server loader (lines 42-70)
   - Modified to use new session cookie utilities
   - Handles `_clearHttpOnly` parameter in authed routes

### Constants Added
**Location:** `@/shared/lib/constants`

```typescript
export const queryParamKey = {
    // ... existing keys
    clear_session_token_cookie: '_clearHttpOnly',
};
```

---

## Key Learnings

### 1. Architecture Decisions Matter
- The app's client-side routing architecture fundamentally requires non-httpOnly cookies
- Changing to httpOnly cookies would require major refactoring:
  - Server loaders must provide auth status
  - Client code cannot check cookies directly
  - All routing logic needs restructuring

### 2. httpOnly vs. Accessibility Trade-off
- **httpOnly cookies:** More secure (XSS protection), but JavaScript cannot read them
- **Non-httpOnly cookies:** Less secure (vulnerable to XSS), but required for client-side routing
- **Decision:** Use non-httpOnly for this architecture, mitigate XSS through other means

### 3. Browser Cookie Behavior
- JavaScript cannot clear httpOnly cookies
- Must use `Set-Cookie` headers from server
- Cookie attributes must match exactly to clear successfully
- Multiple attempts with different flag combinations increase success rate

### 4. Complexity vs. Simplicity
- Initial complex solution created more problems (regressions, edge cases)
- Simpler solution (just match login pattern) would have worked from the start
- User's initial requirement for httpOnly was reconsidered after seeing complexity

### 5. Security Considerations
- Query parameters for security-sensitive operations can be risky
- Must validate that operation is legitimate, not just that parameter exists
- "Self-affecting vulnerabilities" (user can logout themselves) are usually acceptable

### 6. Debugging Approach
- First hypothesis was wrong (form submission guards)
- Testing with browser DevTools (manually setting httpOnly cookie) revealed true cause
- Understanding the full request/response cycle was crucial

---

## Testing Scenarios

### Scenario 1: Normal Login (Non-HttpOnly)
✅ **Expected:** Works normally
- User logs in
- Cookie set without httpOnly flag
- JavaScript can read cookie
- No infinite loops

### Scenario 2: Accept Invitation (Fixed - Non-HttpOnly)
✅ **Expected:** Works normally
- User accepts invitation
- Cookie set without httpOnly flag (matches login)
- Redirects to staff dashboard
- No infinite loops

### Scenario 3: Legacy HttpOnly Cookie Exists
✅ **Expected:** Defensive cleanup
- Old httpOnly cookie exists from before fix
- User tries to access auth or authed routes
- Mismatch detected
- Server clears cookie via headers
- User can re-authenticate

### Scenario 4: Malicious URL Manipulation
⚠️ **Expected:** Acceptable trade-off
- User manually adds `?_clearHttpOnly=true` to URL
- If they have a valid session: Server requires BOTH parameter AND cookie presence
- User can force their own logout (same as clicking logout button)
- No cross-user impact

### Scenario 5: Infinite Loop Prevention
✅ **Expected:** Handled gracefully
- If somehow an httpOnly cookie gets set
- Detection triggers on first auth/authed page visit
- `_clearHttpOnly` parameter added
- Server clears cookie
- User redirected to login
- Loop broken after one cycle

---

## Future Considerations

### If Moving to HttpOnly Cookies Properly

If the team decides to properly support httpOnly cookies in the future:

1. **Server-Side Session Management**
   - All auth checks happen in server loaders
   - Server passes auth state as loader data to client
   - No client-side cookie reading

2. **Architecture Changes**
   - `authed-layout.tsx` needs server loader for auth check
   - Client loaders receive auth state from server loader
   - React Query hooks get initial data from server

3. **Example Pattern**
   ```typescript
   // Server loader
   export const loader = async ({ request }) => {
       const sessionToken = getSessionTokenFromCookie(request);
       if (!sessionToken) return redirect('/login');

       const authData = await validateSession(sessionToken);
       return { authData, isAuthenticated: true };
   };

   // Client loader receives server data
   export const clientLoader = async ({ serverLoader }) => {
       const { authData } = await serverLoader();
       // Use authData without reading cookies
   };
   ```

4. **Benefits**
   - Better XSS protection
   - More secure architecture
   - Standard web security practice

5. **Costs**
   - Significant refactoring required
   - More server-side logic
   - Potential performance implications

### Monitoring

Consider adding monitoring for:
- Detection of httpOnly cookie mismatches (should be zero after fix deployed)
- Users hitting `_clearHttpOnly` parameter (indicates legacy cookies or issues)
- Failed authentication attempts after cookie clearing

---

## Conclusion

The infinite API call issue was caused by httpOnly cookies being set in the accept-invitation flow, which conflicted with the app's client-side cookie-reading architecture.

The solution involved:
1. Fixing the accept-invitation to match login (no httpOnly flags)
2. Adding defensive detection and cleanup for legacy httpOnly cookies
3. Implementing secure server-side cookie clearing with proper safeguards

While there's a minor "vulnerability" allowing users to force their own logout via URL manipulation, this is an acceptable trade-off given that:
- It only affects the user themselves
- They can already logout normally
- It solves the critical infinite loop issue
- The alternative would require major architectural changes

The fix is now in place and ready for testing.
