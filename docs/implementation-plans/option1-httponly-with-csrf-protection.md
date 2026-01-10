# Option 1: HttpOnly Cookies with Direct API Access - Implementation Plan

> Note (2026-01): This document predates the RFC 7807 ProblemDetails migration. Any API error-response examples using `ApiResponse` should be updated to `TypedProblems.*` + `AppProblemDetails` / `ValidationProblemDetails` where applicable.

## Executive Summary

This plan implements **Option 1** from the architecture options document: cookie-based API auth with httpOnly session cookies, maintaining direct browser-to-API communication. Security is the primary focus, with comprehensive CSRF protection.

**Core Changes:**
- Backend reads session token from Cookie header (not X-Session-Token)
- Frontend stops reading cookies, browser handles them automatically
- **Multi-layered CSRF protection** (SameSite + custom headers + origin validation)

**Timeline:** 2-3 weeks for full implementation and testing

---

## Security Architecture

### Defense-in-Depth: Multiple CSRF Protection Layers

We implement **three complementary CSRF defenses** (not just one):

#### Layer 1: SameSite Cookie Attribute ✅
```csharp
// Primary defense against CSRF
sameSite: 'strict'  // Blocks ALL cross-site requests (recommended)
// OR
sameSite: 'lax'     // Allows safe cross-site navigation (if needed)
```

**Protection Level:**
- `Strict`: Prevents CSRF completely, but breaks some legitimate flows (e.g., email links)
- `Lax`: Prevents CSRF for POST/PUT/DELETE, allows GET from external links

**Recommendation:** Start with `Strict`, fallback to `Lax` only if user complaints about email links not working.

#### Layer 2: Custom Request Headers (Double Submit Pattern) ✅
```typescript
// Frontend adds custom header to ALL requests
headers: {
  'X-Requested-With': 'XMLHttpRequest',  // Standard anti-CSRF header
  'X-CSRF-Token': csrfToken,             // Optional additional token
}
```

```csharp
// Backend validates header presence
if (request.Headers["X-Requested-With"] != "XMLHttpRequest") {
  return Results.Unauthorized();
}
```

**Why this works:**
- Cross-site requests from `<form>` or `<img>` cannot set custom headers (browser security)
- Only same-origin JavaScript can set these headers
- Simple origin forgery attack cannot bypass this

#### Layer 3: Origin Validation ✅
```csharp
// Backend validates Origin/Referer headers
var origin = request.Headers["Origin"].FirstOrDefault()
          ?? request.Headers["Referer"].FirstOrDefault();

if (!IsAllowedOrigin(origin)) {
  return Results.Forbidden();
}
```

**Protection:**
- Ensures requests come from allowed domains
- Blocks requests from malicious sites even if they somehow bypass other layers

---

## Implementation Plan

### Phase 1: Backend - CSRF Protection Infrastructure (Days 1-3)

#### 1.1 Create CSRF Validation Middleware

**File:** `apps/api/Src/Lib/Middleware/CsrfProtectionMiddleware.cs`

```csharp
using Microsoft.AspNetCore.Http;
using System.Linq;
using System.Threading.Tasks;

namespace MainApi.Src.Lib.Middleware;

public class CsrfProtectionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CsrfProtectionMiddleware> _logger;
    private readonly string[] _allowedOrigins;

    public CsrfProtectionMiddleware(
        RequestDelegate next,
        ILogger<CsrfProtectionMiddleware> logger,
        IConfiguration configuration
    )
    {
        _next = next;
        _logger = logger;

        // Load allowed origins from configuration
        _allowedOrigins = configuration
            .GetSection("Security:AllowedOrigins")
            .Get<string[]>() ?? Array.Empty<string>();
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Skip CSRF checks for safe HTTP methods (GET, HEAD, OPTIONS)
        if (IsSafeMethod(context.Request.Method))
        {
            await _next(context);
            return;
        }

        // Layer 1: Validate SameSite cookie (automatic via cookie settings)
        // This is enforced by setting SameSite=Strict on the session cookie

        // Layer 2: Validate custom request header
        var requestedWith = context.Request.Headers["X-Requested-With"].FirstOrDefault();
        if (requestedWith != "XMLHttpRequest")
        {
            _logger.LogWarning(
                "CSRF: Missing X-Requested-With header. Method: {Method}, Path: {Path}",
                context.Request.Method,
                context.Request.Path
            );

            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new ApiResponse
            {
                Message = "Invalid request headers",
            });
            return;
        }

        // Layer 3: Validate Origin/Referer
        var origin = context.Request.Headers["Origin"].FirstOrDefault()
                  ?? context.Request.Headers["Referer"].FirstOrDefault();

        if (!IsAllowedOrigin(origin))
        {
            _logger.LogWarning(
                "CSRF: Invalid origin. Origin: {Origin}, Method: {Method}, Path: {Path}",
                origin ?? "(null)",
                context.Request.Method,
                context.Request.Path
            );

            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new ApiResponse
            {
                Message = "Invalid request origin",
            });
            return;
        }

        // All CSRF checks passed
        await _next(context);
    }

    private static bool IsSafeMethod(string method)
    {
        return method is "GET" or "HEAD" or "OPTIONS";
    }

    private bool IsAllowedOrigin(string? origin)
    {
        if (string.IsNullOrEmpty(origin))
        {
            // No origin header - this is suspicious but might be legitimate
            // in some cases (e.g., same-origin requests from old browsers)
            // Log and allow, but monitor
            _logger.LogInformation("Request with no Origin or Referer header");
            return true; // Or return false to be stricter
        }

        // Extract domain from full URL
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            return false;
        }

        var originDomain = $"{uri.Scheme}://{uri.Host}";
        if (uri.Port != 80 && uri.Port != 443)
        {
            originDomain += $":{uri.Port}";
        }

        return _allowedOrigins.Contains(originDomain, StringComparer.OrdinalIgnoreCase);
    }
}
```

#### 1.2 Update Configuration

**File:** `apps/api/Src/appsettings.json`

```json
{
  "Security": {
    "AllowedOrigins": [
      "http://localhost:5050",
      "https://publyapp.com",
      "https://www.publyapp.com"
    ]
  }
}
```

**File:** `apps/api/Src/appsettings.Development.json`

```json
{
  "Security": {
    "AllowedOrigins": [
      "http://localhost:5050",
      "http://127.0.0.1:5050"
    ]
  }
}
```

#### 1.3 Register CSRF Middleware

**File:** `apps/api/Src/Program.cs`

```csharp
// Add CSRF protection BEFORE session auth middleware
app.UseCsrfProtection(); // Extension method to add

// Existing middlewares
app.UseSessionAuthentication();
app.UseStaffAuthorization();
// ... rest
```

**Extension method:**

```csharp
public static class CsrfProtectionExtensions
{
    public static IApplicationBuilder UseCsrfProtection(
        this IApplicationBuilder builder
    )
    {
        return builder.UseMiddleware<CsrfProtectionMiddleware>();
    }
}
```

#### 1.4 Update SessionAuthMiddleware to Read Cookie

**File:** `apps/api/Src/Lib/Middleware/SessionAuthMiddleware.cs`

```csharp
public class SessionAuthMiddleware
{
    private const string SESSION_COOKIE_NAME = "publy-session"; // From constants

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        string? sessionToken = null;

        // NEW: Try cookie first (httpOnly)
        if (context.Request.Cookies.TryGetValue(SESSION_COOKIE_NAME, out var cookieToken))
        {
            sessionToken = cookieToken;
        }

        // BACKWARD COMPATIBILITY: Fallback to header
        if (string.IsNullOrEmpty(sessionToken))
        {
            sessionToken = context.Request.Headers["X-Session-Token"].FirstOrDefault();
        }

        if (string.IsNullOrEmpty(sessionToken))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new ApiResponse
            {
                Message = ResponseKeys.Unauthorized,
            });
            return;
        }

        // Validate session and populate AuthContext
        var session = await _sessionService.GetByTokenAsync(sessionToken);

        if (session is null || session.ExpiresAt < DateTime.UtcNow)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new ApiResponse
            {
                Message = ResponseKeys.SessionExpired,
            });
            return;
        }

        // Set auth context
        _authContext.SetSession(session);

        await next(context);
    }
}
```

#### 1.5 Update Auth Actions to Set HttpOnly Cookies

**File:** `apps/api/Src/Features/Common/Auth/Handlers/Login.cs`

```csharp
public static async Task<Results<
    Ok<LoginSuccess>,
    BadRequest<ApiResponse>
>> HandleLogin(
    [FromServices] IAuthService authService,
    [FromBody] LoginBody request,
    HttpContext httpContext,
    CancellationToken cancellationToken = default
)
{
    // Authenticate user
    var result = await authService.LoginAsync(
        email,
        password,
        cancellationToken
    );

    if (result is null)
    {
        return TypedResults.BadRequest(
            ApiResponse.Create("Invalid credentials", ResponseKeys.InvalidCredentials)
        );
    }

    // Set httpOnly cookie
    var cookieOptions = new CookieOptions
    {
        HttpOnly = true,
        Secure = true,  // HTTPS only in production
        SameSite = SameSiteMode.Strict,  // CSRF protection
        Path = "/",
        Expires = result.SessionExpiresAt,
    };

    httpContext.Response.Cookies.Append(
        SESSION_COOKIE_NAME,
        result.SessionToken,
        cookieOptions
    );

    // Return success response (NO token in response body)
    return TypedResults.Ok(new LoginSuccess
    {
        User = result.User,
        // SessionToken NOT included for security
    });
}
```

**Similar updates for:**
- Accept invitation handler
- Register handler
- Any other auth action that creates sessions

#### 1.6 Update Logout to Clear Cookie

**File:** `apps/api/Src/Features/Common/Auth/Handlers/Logout.cs`

```csharp
public static async Task<Ok<ApiResponse>> HandleLogout(
    [FromServices] IAuthContext authContext,
    [FromServices] ISessionService sessionService,
    HttpContext httpContext,
    CancellationToken cancellationToken = default
)
{
    // Invalidate session in database
    var sessionId = authContext.SessionId;
    await sessionService.InvalidateAsync(sessionId, cancellationToken);

    // Clear httpOnly cookie
    httpContext.Response.Cookies.Delete(
        SESSION_COOKIE_NAME,
        new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/",
        }
    );

    return TypedResults.Ok(
        ApiResponse.Create("Logged out successfully", ResponseKeys.LogoutSuccess)
    );
}
```

---

### Phase 2: Frontend - Remove Cookie Reading & Add CSRF Headers (Days 4-6)

#### 2.1 Update API Client to Include CSRF Header

**File:** `apps/front/app/lib/api/client-manager.ts`

```typescript
import { ApiClient } from '@/js-client';

class ClientManager {
  private _apiClient: ApiClient | null = null;

  get apiClient(): ApiClient {
    if (!this._apiClient) {
      this._apiClient = this.createApiClient();
    }
    return this._apiClient;
  }

  createApiClient(sessionToken?: string): ApiClient {
    const baseUrl = import.meta.env.VITE_API_BASE_URL;

    // Configure request middleware to add CSRF protection headers
    const requestMiddleware = {
      onRequest: async (request: Request) => {
        // Layer 2 CSRF protection: Add custom header
        request.headers.set('X-Requested-With', 'XMLHttpRequest');

        // Ensure credentials (cookies) are included
        // This is critical for httpOnly cookies to be sent
        const init = {
          ...request,
          credentials: 'include' as RequestCredentials,
        };

        return new Request(request.url, init);
      },
    };

    return new ApiClient({
      baseUrl,
      requestMiddleware,
      // NO X-Session-Token header - browser sends cookie automatically
    });
  }

  // Anonymous client (no auth)
  get anonApiClient(): ApiClient {
    return this.createApiClient();
  }
}

export const clientManager = new ClientManager();
```

#### 2.2 Remove Client-Side Cookie Reading

**Delete or mark deprecated:**
- `getSessionCookieFromClient()` - No longer needed
- `clearSessionCookie()` - Only server can clear httpOnly cookies

**File:** `apps/front/app/routes/authed/_layout/authed-layout.tsx`

```typescript
export const loader = getServerLoader({
  loader: async ({ request }) => {
    // NEW: Server-side session validation
    const sessionToken = getSessionTokenFromRequest(request);

    if (!sessionToken) {
      return redirect('/auth/login?redirect_cause=invalid_session');
    }

    // Validate session by calling API
    const apiClient = clientManager.createApiClient(sessionToken);

    try {
      const authData = await apiClient.auth.userAuthData.get();

      // Return auth state to client
      return {
        isAuthenticated: true,
        user: authData.user,
        permissions: authData.permissions,
      };
    } catch (error) {
      // Invalid session
      return redirect('/auth/login?redirect_cause=invalid_session');
    }
  },
});

export const clientLoader = getClientLoader({
  loader: async ({ serverLoader }) => {
    i18next
      .loadNamespaces([I18N_NAMESPACES.ZOD, I18N_NAMESPACES.RESPONSE_MESSAGE])
      .catch((error) => {
        logger.error('Failed to load namespaces', error);
      });

    // Get auth state from server
    const serverData = await serverLoader<typeof loader>();

    if (!serverData || !serverData.isAuthenticated) {
      // Should not reach here, server handles redirects
      throw redirect('/auth/login?redirect_cause=invalid_session');
    }

    // Hydrate React Query with server data
    defaultQueryClient.setQueryData(
      ['auth', 'user'],
      serverData.user,
    );

    // Initialize API client (browser will send cookie automatically)
    initApiClientOnClient();

    // Initialize sidebar state (sidebar cookie is still non-httpOnly)
    const browserCookies = cookie.parse(document.cookie);
    const sideBarCookie = _.get(browserCookies, SIDEBAR_COOKIE_NAME);

    useMainStore.setState((root) => {
      const allowedStates: Exclude<SettingsState['navLayout'], undefined>[] = [
        'vertical',
        'mini',
        'horizontal',
      ];

      let state = _.toString(sideBarCookie);

      if (!allowedStates.includes(state as never)) {
        state = allowedStates[0];
        const newCookie = cookie.serialize(SIDEBAR_COOKIE_NAME, state, {
          path: '/',
          maxAge: SIDEBAR_COOKIE_MAX_AGE,
        });
        document.cookie = newCookie;
      }

      root.settingsSlice.state.navLayout = state as never;
    });

    return null;
  },
});
```

#### 2.3 Create Server-Side Session Utilities

**File:** `apps/front/app/lib/auth/server-session.utils.ts`

```typescript
import * as cookie from 'cookie';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

/**
 * Extracts session token from request Cookie header.
 * This replaces client-side cookie reading.
 */
export const getSessionTokenFromRequest = (request: Request): string | undefined => {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return undefined;

  const cookies = cookie.parse(cookieHeader);
  return cookies[SESSION_TOKEN_COOKIE_KEY];
};
```

#### 2.4 Update Auth Actions (Login, Accept Invitation)

**File:** `apps/front/app/routes/auth/login/login-page.tsx`

```typescript
export const action = getServerAction({
  action: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // Call API (API will set httpOnly cookie in response)
    const anonClient = clientManager.anonApiClient;

    try {
      const result = await anonClient.auth.login.post({
        email: { getValue: () => email },
        password: { getValue: () => password },
      });

      // API already set the httpOnly cookie via Set-Cookie header
      // Frontend just redirects
      return redirect('/staff');

    } catch (error) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }
  },
});
```

**Key change:** Backend sets the cookie, frontend doesn't need to do anything special.

---

### Phase 3: CORS Configuration (Day 7)

#### 3.1 Update Backend CORS Settings

**File:** `apps/api/Src/Program.cs`

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        var allowedOrigins = builder.Configuration
            .GetSection("Security:AllowedOrigins")
            .Get<string[]>() ?? Array.Empty<string>();

        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials(); // CRITICAL: Required for cookies
    });
});

// Use CORS
app.UseCors("AllowFrontend");
```

**Why `AllowCredentials()` is critical:**
- Without it, browser will NOT send cookies with cross-origin requests
- Must be combined with specific origins (not `*`)

---

### Phase 4: Testing & Security Validation (Days 8-10)

#### 4.1 CSRF Attack Simulation Tests

**Test 1: Form-Based CSRF Attack**

Create malicious HTML page:
```html
<!-- malicious-site.html -->
<form action="https://publyapp.com/api/staff/members" method="POST">
  <input type="hidden" name="email" value="attacker@evil.com" />
  <input type="submit" value="Click me!" />
</form>
<script>document.forms[0].submit();</script>
```

**Expected Result:** Request blocked by CSRF middleware (missing X-Requested-With header)

**Test 2: Image-Based CSRF**

```html
<img src="https://publyapp.com/api/staff/members/delete?id=123" />
```

**Expected Result:** Blocked by SameSite=Strict (or safe method check for GET)

**Test 3: Fetch from Malicious Origin**

```javascript
// On attacker's site
fetch('https://publyapp.com/api/staff/members', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
  body: JSON.stringify({ email: 'attacker@evil.com' }),
});
```

**Expected Result:**
- Browser blocks due to CORS (no Access-Control-Allow-Origin for attacker's origin)
- If CORS bypassed somehow, origin validation blocks it

#### 4.2 Penetration Testing Checklist

- [ ] CSRF via HTML form
- [ ] CSRF via image tag
- [ ] CSRF via fetch with credentials
- [ ] CSRF via XMLHttpRequest
- [ ] Cookie theft via XSS (should fail - httpOnly)
- [ ] Session fixation attack
- [ ] Cookie injection via subdomain
- [ ] Replay attack with expired session
- [ ] Concurrent session handling

#### 4.3 Security Headers Validation

Verify in DevTools Network tab:

**Response headers MUST include:**
```
Set-Cookie: publy-session=...; HttpOnly; Secure; SameSite=Strict; Path=/
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: http://localhost:5050
```

**MUST NOT include:**
```
Set-Cookie: publy-session=...; (missing HttpOnly)
Access-Control-Allow-Origin: *
```

---

### Phase 5: Monitoring & Incident Response (Day 11)

#### 5.1 Security Logging

**Log CSRF violations:**

```csharp
_logger.LogWarning(
    "CSRF attempt detected. Method: {Method}, Path: {Path}, Origin: {Origin}, UserAgent: {UserAgent}",
    context.Request.Method,
    context.Request.Path,
    origin,
    context.Request.Headers["User-Agent"].FirstOrDefault()
);
```

**Metrics to track:**
- CSRF blocks per hour
- Failed origin validations
- Missing custom header attempts
- Session token theft attempts

#### 5.2 Alerting Thresholds

Alert when:
- More than 10 CSRF blocks from same IP in 1 hour
- More than 100 total CSRF blocks in 1 hour
- Origin validation failures spike

#### 5.3 Incident Response Playbook

**If CSRF attack detected:**

1. **Immediate:**
   - Check if any malicious requests succeeded
   - Identify affected users
   - Force logout all sessions if widespread

2. **Short-term:**
   - Tighten SameSite to `Strict` if on `Lax`
   - Add IP-based rate limiting
   - Review and strengthen origin validation

3. **Long-term:**
   - Security audit of all state-changing endpoints
   - Implement additional CSRF tokens for high-risk operations
   - Review CSP and other security headers

---

## Security Considerations

### 1. Why SameSite Alone Is Not Enough

**Limitation:** Browser support varies, and some attacks can bypass SameSite:
- Safari has had bugs with SameSite
- Top-level navigation from external sites bypasses Lax
- SameSite=None still allows some cross-site requests

**Solution:** Use multiple layers (SameSite + custom headers + origin validation)

### 2. Why Custom Headers Protect Against CSRF

**Key insight:** Simple form-based CSRF attacks cannot set custom HTTP headers due to browser same-origin policy.

```html
<!-- This form CANNOT add custom headers -->
<form action="https://api.com/endpoint" method="POST">
  <!-- No way to add X-Requested-With here! -->
</form>
```

Only same-origin JavaScript (via fetch/XMLHttpRequest) can add custom headers.

### 3. Session Fixation Prevention

**Attack:** Attacker sets victim's session cookie to a known value, then hijacks session.

**Defense:**
```csharp
// On successful login, regenerate session token
var newSessionToken = await _sessionService.RegenerateTokenAsync(oldSessionToken);

// Set new cookie
httpContext.Response.Cookies.Append(SESSION_COOKIE_NAME, newSessionToken, cookieOptions);
```

### 4. Subdomain Cookie Security

**Risk:** If attacker controls a subdomain (e.g., `evil.publyapp.com`), they might set cookies for parent domain.

**Defense:**
```csharp
// DO NOT set Domain attribute on cookie
// This creates a host-only cookie, bound to exact domain
var cookieOptions = new CookieOptions
{
    // Domain NOT set - becomes host-only
    HttpOnly = true,
    Secure = true,
    SameSite = SameSiteMode.Strict,
    Path = "/",
};
```

### 5. Content Security Policy (CSP)

**Add CSP header to prevent XSS:**

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers.Add(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'"
    );
    await next();
});
```

---

## Rollout Strategy

### Week 1: Backend Implementation
- Days 1-3: CSRF middleware, session validation, cookie settings
- Days 4-5: Testing backend in isolation

### Week 2: Frontend Integration
- Days 6-8: Remove cookie reading, add CSRF headers, update auth flows
- Days 9-10: Integration testing, security validation

### Week 3: Production Rollout
- Day 11: Deploy to staging, penetration testing
- Days 12-13: Monitor staging for issues
- Day 14: Deploy to production with gradual rollout (10% → 50% → 100%)

---

## Success Criteria

✅ All API requests include httpOnly session cookie
✅ `document.cookie` does NOT show session token
✅ Custom header `X-Requested-With` present in all state-changing requests
✅ CSRF attack simulations blocked by middleware
✅ Origin validation blocks cross-site requests
✅ No increase in 401/403 errors
✅ Session persistence across page reloads
✅ Login/logout flows work correctly
✅ Penetration testing passes all security checks

---

## Open Questions for Review

1. **SameSite Setting:** Start with `Strict` or `Lax`?
   - Strict: More secure, may break email links
   - Lax: Less secure, better UX
   - **Recommendation:** Strict, monitor for complaints

2. **Origin Validation Strictness:** Reject requests with NO origin header?
   - Strict: Reject if no Origin/Referer
   - Lenient: Allow if no Origin/Referer (some browsers don't send it)
   - **Recommendation:** Log and allow for now, monitor, tighten later

3. **CSRF Tokens:** Do we need explicit CSRF tokens in addition to the above?
   - Current 3 layers likely sufficient
   - Add if compliance/audit requires
   - **Recommendation:** Monitor, add later if needed

4. **Session Rotation:** Regenerate session token after login?
   - Prevents session fixation
   - Adds complexity
   - **Recommendation:** Implement in Phase 2

---

## Appendix: Security Best Practices Checklist

- [x] HttpOnly flag on session cookie
- [x] Secure flag on session cookie (production)
- [x] SameSite=Strict on session cookie
- [x] Custom request header validation
- [x] Origin/Referer validation
- [x] CORS with AllowCredentials
- [x] No session token in response bodies
- [x] Session expiration enforced
- [ ] Session rotation on login (Phase 2)
- [ ] Content Security Policy headers
- [ ] Rate limiting on auth endpoints
- [ ] IP-based suspicious activity detection
- [ ] Security audit of all endpoints

---

## Next Steps

1. **Review this plan** - Approve security approach
2. **Confirm timeline** - 2-3 weeks realistic?
3. **Assign resources** - Who works on backend vs frontend?
4. **Begin Phase 1** - Implement CSRF middleware
5. **Security review** - Have security expert review before production

**Ready to proceed when you approve!**
