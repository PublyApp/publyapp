# HttpOnly Cookie Migration - Implementation Plan (Claude Merged)

> Note (2026-01): This document predates the RFC 7807 ProblemDetails migration. Any API error-response examples using `ApiResponse` should be updated to `TypedProblems.*` + `AppProblemDetails` / `ValidationProblemDetails` where applicable.

> **Status:** Comprehensive merged plan combining Claude's detailed security approach with GPT's clear phase structure
> **Goal:** Migrate PublyApp to httpOnly cookie-based auth with robust multi-layered CSRF protection

---

## Executive Summary

### Current State
- Session token stored in **non-httpOnly cookie**, readable by JS
- Frontend attaches token as `X-Session-Token` header via Kiota client
- Authed routes are client-only and assume JS can read session token
- **Security Risk:** Session token vulnerable to XSS attacks

### Target State (Option 1: Direct API Cookie Auth)
- Session token in **single httpOnly cookie** (`SESSION_TOKEN_COOKIE_KEY`)
- Browser automatically sends cookie on all API requests
- API reads token from `Cookie` header (not `X-Session-Token`)
- **JS never accesses session token** - protected from XSS
- **Multi-layered CSRF protection** (SameSite + double-submit token + origin validation)

### Timeline
**Total: 2-3 weeks**
- Phase 0: Inventory & Prep (0.5-1 day)
- Phase 1: Backend Cookie Support (1-2 days)
- Phase 2: CSRF Infrastructure (2-3 days)
- Phase 3: Frontend Integration (2-3 days)
- Phase 4: Remove Legacy Code (1-2 days)
- Phase 5: Testing & Security Validation (3-4 days)
- Phase 6: Rollout & Monitoring (2-3 days)

---

## Security Architecture

### Defense-in-Depth: Three Complementary CSRF Layers

We implement **three independent CSRF defenses** for maximum security:

#### Layer 1: SameSite Cookie Attribute ✅

```csharp
// Primary browser-level CSRF defense
sameSite: SameSiteMode.Lax  // Blocks most cross-site requests
```

**Protection Level:**
- `Strict`: Prevents ALL cross-site requests (most secure)
  - Downside: Breaks email links, external navigation
- `Lax`: Allows safe cross-site navigation (GET from external sites)
  - Prevents CSRF for POST/PUT/PATCH/DELETE
  - **Recommended:** Better UX while maintaining security

**Limitation:** Browser support varies; Safari has had bugs with SameSite.

#### Layer 2: Double-Submit CSRF Token ✅

```typescript
// Frontend: Read CSRF cookie and attach as header
headers: {
  'X-CSRF-Token': csrfToken,  // Read from non-httpOnly CSRF cookie
}
```

```csharp
// Backend: Validate cookie matches header
var csrfCookie = request.Cookies["PUBLYAPP-CSRF"];
var csrfHeader = request.Headers["X-CSRF-Token"].FirstOrDefault();

if (csrfCookie != csrfHeader) {
    return Results.Forbidden();
}
```

**Why This Works:**
- Attacker's site can cause browser to send **session cookie** (credential)
- But attacker **cannot read** CSRF cookie (same-origin policy)
- Attacker **cannot set** matching header from cross-site form/link
- Only same-origin JavaScript can read CSRF cookie and set matching header

**CSRF Cookie Properties:**
- **Non-httpOnly** (JS must read it to send as header)
- `secure: true`, `sameSite: 'lax'`, `path: '/'`
- Random 128-bit value, regenerated on login

#### Layer 3: Origin/Referer Validation ✅

```csharp
// Backend validates request origin
var origin = request.Headers["Origin"].FirstOrDefault()
          ?? request.Headers["Referer"].FirstOrDefault();

if (!IsAllowedOrigin(origin)) {
    return Results.Forbidden();
}
```

**Protection:**
- Ensures requests come from allowed domains only
- Blocks requests from malicious sites even if other layers bypass
- Validates against configuration-driven allowlist

**Why All Three Layers:**
- **Redundancy:** If one layer fails (browser bug, misconfiguration), others protect
- **Defense-in-depth:** Industry best practice for high-security applications
- **Future-proof:** Protects against emerging attack vectors

---

## Implementation Phases

### Phase 0: Inventory & Preconditions (0.5-1 day)

**Goal:** Establish baseline and prepare for migration.

#### Tasks

1. **Audit Current Session Handling:**
   - [ ] Document all places where `SESSION_TOKEN_COOKIE_KEY` is set/cleared
     - Login handler (`Login.cs`)
     - Accept invitation handler (`AcceptInvitation.cs`)
     - Logout handler (`Logout.cs`)
     - Error/session expiry flows
   - [ ] List all backend code reading `X-Session-Token` header
     - `SessionAuthMiddleware.cs`
     - Any endpoint-specific auth checks
     - Test code
   - [ ] List all frontend code setting `X-Session-Token` header
     - Kiota client config (`client-manager.ts`)
     - Custom fetch wrappers
     - Test utilities

2. **Production Domain Strategy:**
   - [ ] Confirm architecture:
     - **Same origin:** `app.publy.app/api` (preferred - simpler CORS)
     - **Subdomains:** `app.publy.app` + `api.publy.app` (requires CORS + `credentials: 'include'`)
   - [ ] Configure domain in environment files

3. **Create Shared Constants:**
   - [ ] Define in `packages/shared/lib/constants.ts`:
     ```typescript
     export const SESSION_TOKEN_COOKIE_KEY = 'publy-session';
     export const CSRF_TOKEN_COOKIE_KEY = 'PUBLYAPP-CSRF';
     export const CSRF_HEADER_NAME = 'X-CSRF-Token';
     ```
   - [ ] Mirror in C# (`apps/api/Src/Lib/Constants.cs`)

**Deliverable:** Complete checklist of auth touchpoints, domain strategy decision, shared constants.

---

### Phase 1: Backend - Cookie-Based Auth Support (1-2 days)

**Goal:** API authenticates using httpOnly cookies while maintaining backward compatibility with `X-Session-Token` header.

#### 1.1 Update SessionAuthMiddleware

**File:** `apps/api/Src/Lib/Middleware/SessionAuthMiddleware.cs`

```csharp
using Microsoft.AspNetCore.Http;
using System.Linq;
using System.Threading.Tasks;

namespace MainApi.Src.Lib.Middleware;

public class SessionAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ISessionService _sessionService;
    private readonly IAuthContext _authContext;
    private readonly ILogger<SessionAuthMiddleware> _logger;

    public SessionAuthMiddleware(
        RequestDelegate next,
        ISessionService sessionService,
        IAuthContext authContext,
        ILogger<SessionAuthMiddleware> logger
    )
    {
        _next = next;
        _sessionService = sessionService;
        _authContext = authContext;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        string? sessionToken = null;

        // NEW: Prefer cookie (httpOnly) - primary method
        if (context.Request.Cookies.TryGetValue(
            Constants.SESSION_TOKEN_COOKIE_KEY,
            out var cookieToken))
        {
            sessionToken = cookieToken;
            _logger.LogDebug("Session token found in cookie");
        }

        // BACKWARD COMPATIBILITY: Fallback to header (deprecated)
        if (string.IsNullOrEmpty(sessionToken))
        {
            sessionToken = context.Request.Headers["X-Session-Token"].FirstOrDefault();
            if (!string.IsNullOrEmpty(sessionToken))
            {
                _logger.LogInformation(
                    "Session token from header (deprecated). Path: {Path}",
                    context.Request.Path
                );
            }
        }

        if (string.IsNullOrEmpty(sessionToken))
        {
            _logger.LogDebug("No session token found");
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new ApiResponse
            {
                Message = ResponseKeys.Unauthorized,
            });
            return;
        }

        // Validate session
        var session = await _sessionService.GetByTokenAsync(
            sessionToken,
            context.RequestAborted
        );

        if (session is null || session.ExpiresAt < DateTime.UtcNow)
        {
            _logger.LogInformation(
                "Invalid or expired session. SessionExists: {Exists}, Path: {Path}",
                session is not null,
                context.Request.Path
            );

            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new ApiResponse
            {
                Message = ResponseKeys.SessionExpired,
            });
            return;
        }

        // Set auth context for downstream handlers
        _authContext.SetSession(session);

        _logger.LogDebug(
            "Session authenticated. UserId: {UserId}, SessionId: {SessionId}",
            session.UserId,
            session.Id
        );

        await _next(context);
    }
}
```

#### 1.2 Add Configuration Constants

**File:** `apps/api/Src/Lib/Constants.cs`

```csharp
namespace MainApi.Src.Lib;

public static class Constants
{
    // Session & CSRF
    public const string SESSION_TOKEN_COOKIE_KEY = "publy-session";
    public const string CSRF_TOKEN_COOKIE_KEY = "PUBLYAPP-CSRF";
    public const string CSRF_HEADER_NAME = "X-CSRF-Token";
}
```

#### 1.3 Add Tests

**File:** `apps/api/Tests/Middleware/SessionAuthMiddlewareTests.cs`

```csharp
public class SessionAuthMiddlewareTests
{
    [Fact]
    public async Task Should_Authenticate_With_Cookie()
    {
        // Arrange
        var context = new DefaultHttpContext();
        context.Request.Cookies = new RequestCookieCollection(
            new Dictionary<string, string>
            {
                [Constants.SESSION_TOKEN_COOKIE_KEY] = "valid-token"
            }
        );

        // Act & Assert
        // ... middleware should pass through
    }

    [Fact]
    public async Task Should_Authenticate_With_Header_Backward_Compat()
    {
        // Arrange
        var context = new DefaultHttpContext();
        context.Request.Headers["X-Session-Token"] = "valid-token";

        // Act & Assert
        // ... middleware should pass through with info log
    }

    [Fact]
    public async Task Should_Return_401_When_No_Token()
    {
        // Arrange
        var context = new DefaultHttpContext();

        // Act & Assert
        // ... middleware should return 401
    }

    [Fact]
    public async Task Should_Return_401_When_Session_Expired()
    {
        // ... test expired session
    }
}
```

**Deliverable:** Backend accepts both cookie and header auth, with cookie preferred. Tests cover all cases.

---

### Phase 2: Backend - CSRF Protection Infrastructure (2-3 days)

**Goal:** Implement robust multi-layered CSRF protection for cookie-based sessions.

#### 2.1 Create CSRF Protection Middleware

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

        if (_allowedOrigins.Length == 0)
        {
            _logger.LogWarning("No allowed origins configured for CSRF protection");
        }
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Skip CSRF checks for safe HTTP methods
        if (IsSafeMethod(context.Request.Method))
        {
            await _next(context);
            return;
        }

        // Skip if no authenticated session (let auth middleware handle)
        var sessionCookie = context.Request.Cookies[Constants.SESSION_TOKEN_COOKIE_KEY];
        if (string.IsNullOrEmpty(sessionCookie))
        {
            await _next(context);
            return;
        }

        // Layer 1: SameSite=Lax (enforced via cookie settings)
        // This is automatic browser protection

        // Layer 2: Double-Submit CSRF Token
        var csrfCookie = context.Request.Cookies[Constants.CSRF_TOKEN_COOKIE_KEY];
        var csrfHeader = context.Request.Headers[Constants.CSRF_HEADER_NAME].FirstOrDefault();

        if (string.IsNullOrEmpty(csrfCookie) || string.IsNullOrEmpty(csrfHeader))
        {
            _logger.LogWarning(
                "CSRF: Missing token. Cookie: {HasCookie}, Header: {HasHeader}, " +
                "Method: {Method}, Path: {Path}",
                !string.IsNullOrEmpty(csrfCookie),
                !string.IsNullOrEmpty(csrfHeader),
                context.Request.Method,
                context.Request.Path
            );

            await RespondForbidden(context, "CSRF token missing");
            return;
        }

        if (!csrfCookie.Equals(csrfHeader, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "CSRF: Token mismatch. Method: {Method}, Path: {Path}",
                context.Request.Method,
                context.Request.Path
            );

            await RespondForbidden(context, "CSRF token invalid");
            return;
        }

        // Layer 3: Origin/Referer Validation
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

            await RespondForbidden(context, "Invalid request origin");
            return;
        }

        // All CSRF checks passed
        _logger.LogDebug(
            "CSRF validation passed. Method: {Method}, Path: {Path}",
            context.Request.Method,
            context.Request.Path
        );

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
            // No origin header - might be legitimate (same-origin from old browsers)
            // or server-to-server. Log and allow, but monitor.
            _logger.LogInformation("Request with no Origin or Referer header");
            return true; // Change to false for stricter validation
        }

        // Extract domain from full URL
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            _logger.LogWarning("Invalid origin URI format: {Origin}", origin);
            return false;
        }

        // Normalize to scheme://host[:port]
        var originDomain = $"{uri.Scheme}://{uri.Host}";
        if (uri.Port != 80 && uri.Port != 443 && !uri.IsDefaultPort)
        {
            originDomain += $":{uri.Port}";
        }

        var isAllowed = _allowedOrigins.Contains(
            originDomain,
            StringComparer.OrdinalIgnoreCase
        );

        if (!isAllowed)
        {
            _logger.LogWarning(
                "Origin not in allowlist. Origin: {Origin}, Allowed: {Allowed}",
                originDomain,
                string.Join(", ", _allowedOrigins)
            );
        }

        return isAllowed;
    }

    private static async Task RespondForbidden(HttpContext context, string reason)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new ApiResponse
        {
            Message = reason,
        });
    }
}
```

#### 2.2 Create Extension Methods

**File:** `apps/api/Src/Lib/Extensions/CsrfProtectionExtensions.cs`

```csharp
namespace MainApi.Src.Lib.Extensions;

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

#### 2.3 Update Configuration

**File:** `apps/api/Src/appsettings.json`

```json
{
  "Security": {
    "AllowedOrigins": [
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

#### 2.4 Register Middleware in Correct Order

**File:** `apps/api/Src/Program.cs`

```csharp
// CRITICAL: Middleware order matters!

app.UseSecurityHeaders();           // Security headers
app.UseExceptionHandler();          // Error handling
app.UseCors("AllowFrontend");       // CORS (BEFORE CSRF)

// CSRF protection AFTER CORS, BEFORE auth
app.UseCsrfProtection();            // NEW: CSRF validation

app.UseSessionAuthentication();     // Session auth
app.UseStaffAuthorization();        // Staff-specific auth
app.UseTenantContext();            // Tenant context

// ... rest of pipeline
```

**Why this order:**
1. CORS must run first to set headers for preflight
2. CSRF runs after CORS but before auth (fails fast on CSRF)
3. Auth middlewares run after CSRF validation

#### 2.5 Add CSRF Tests

**File:** `apps/api/Tests/Middleware/CsrfProtectionMiddlewareTests.cs`

```csharp
public class CsrfProtectionMiddlewareTests
{
    [Fact]
    public async Task Should_Allow_GET_Requests_Without_CSRF()
    {
        // Safe methods bypass CSRF
    }

    [Fact]
    public async Task Should_Block_POST_With_Missing_CSRF_Cookie()
    {
        // Assert 403
    }

    [Fact]
    public async Task Should_Block_POST_With_Mismatched_CSRF_Token()
    {
        // Assert 403
    }

    [Fact]
    public async Task Should_Allow_POST_With_Valid_CSRF_Token()
    {
        // Assert passes through
    }

    [Fact]
    public async Task Should_Block_Request_From_Invalid_Origin()
    {
        // Assert 403
    }

    [Fact]
    public async Task Should_Allow_Request_From_Allowed_Origin()
    {
        // Assert passes through
    }
}
```

**Deliverable:** CSRF middleware protecting all mutating endpoints with three-layer validation.

---

### Phase 3: Frontend - Session Cookie & CSRF Management (2-3 days)

**Goal:** Frontend sets httpOnly session cookies, manages CSRF tokens, and never reads session token in JS.

#### 3.1 Create Server-Side Cookie Utilities

**File:** `apps/front/app/lib/cookies/server-cookie.utils.ts`

```typescript
import * as cookie from 'cookie';
import {
  SESSION_TOKEN_COOKIE_KEY,
  CSRF_TOKEN_COOKIE_KEY
} from '@/shared/lib/constants';

/**
 * Creates httpOnly session cookie Set-Cookie header
 */
export const createSessionCookie = (
  sessionToken: string,
  expiresAt: Date,
  isProduction: boolean
): string => {
  return cookie.serialize(SESSION_TOKEN_COOKIE_KEY, sessionToken, {
    httpOnly: true,           // JS cannot read
    secure: isProduction,     // HTTPS only in prod
    sameSite: 'lax',          // CSRF protection
    path: '/',
    expires: expiresAt,
  });
};

/**
 * Creates non-httpOnly CSRF cookie (JS must read it)
 */
export const createCsrfCookie = (
  csrfToken: string,
  isProduction: boolean
): string => {
  return cookie.serialize(CSRF_TOKEN_COOKIE_KEY, csrfToken, {
    httpOnly: false,          // JS MUST read this
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
};

/**
 * Creates cookie deletion header
 */
export const clearSessionCookie = (): string => {
  return cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),     // Expire immediately
  });
};

export const clearCsrfCookie = (): string => {
  return cookie.serialize(CSRF_TOKEN_COOKIE_KEY, '', {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
};

/**
 * Extracts session token from request Cookie header
 * (Server-side only - replaces client-side cookie reading)
 */
export const getSessionTokenFromRequest = (
  request: Request
): string | undefined => {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return undefined;

  const cookies = cookie.parse(cookieHeader);
  return cookies[SESSION_TOKEN_COOKIE_KEY];
};

/**
 * Generate cryptographically secure CSRF token
 */
export const generateCsrfToken = (): string => {
  // 128-bit random value, base64-encoded
  const buffer = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};
```

#### 3.2 Update Login Action

**File:** `apps/front/app/routes/auth/login/login-page.tsx`

```typescript
import { getServerAction } from '@/front/lib/react-router/server-data';
import {
  createSessionCookie,
  createCsrfCookie,
  generateCsrfToken
} from '@/front/lib/cookies/server-cookie.utils';
import { clientManager } from '@/front/lib/js-client/client-manager';
import { redirect } from 'react-router';

export const action = getServerAction({
  action: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const anonClient = clientManager.anonApiClient;

    try {
      const result = await anonClient.auth.login.post({
        email: { getValue: () => email },
        password: { getValue: () => password },
      });

      if (!result?.sessionToken || !result?.sessionExpiresAt) {
        return {
          success: false,
          error: 'Invalid response from server',
        };
      }

      // Generate CSRF token
      const csrfToken = generateCsrfToken();

      // Create cookies
      const isProduction = import.meta.env.PROD;
      const sessionCookie = createSessionCookie(
        result.sessionToken,
        new Date(result.sessionExpiresAt),
        isProduction
      );
      const csrfCookie = createCsrfCookie(csrfToken, isProduction);

      // Set both cookies in response
      const headers = new Headers();
      headers.append('Set-Cookie', sessionCookie);
      headers.append('Set-Cookie', csrfCookie);

      // Redirect to authed area
      return redirect('/staff', { headers });

    } catch (error) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }
  },
});
```

#### 3.3 Update Accept Invitation Action

**File:** `apps/front/app/routes/auth/accept-invitation/accept-invitation-page.tsx`

```typescript
// Similar to login - sets both session and CSRF cookies
export const action = getServerAction({
  action: async ({ request, params }) => {
    // ... extract token and form data

    try {
      const result = await anonClient.auth.acceptInvitation.post({
        token: { getValue: () => token },
        firstName: { getValue: () => firstName },
        lastName: { getValue: () => lastName },
        password: { getValue: () => password },
      });

      // Generate CSRF token and set cookies (same as login)
      const csrfToken = generateCsrfToken();
      const isProduction = import.meta.env.PROD;

      const headers = new Headers();
      headers.append('Set-Cookie', createSessionCookie(
        result.sessionToken,
        new Date(result.sessionExpiresAt),
        isProduction
      ));
      headers.append('Set-Cookie', createCsrfCookie(csrfToken, isProduction));

      return redirect('/staff', { headers });
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});
```

#### 3.4 Update Logout Action

**File:** `apps/front/app/routes/authed/logout.tsx` (or equivalent)

```typescript
import { getServerAction } from '@/front/lib/react-router/server-data';
import { clearSessionCookie, clearCsrfCookie } from '@/front/lib/cookies/server-cookie.utils';
import { clientManager } from '@/front/lib/js-client/client-manager';
import { redirect } from 'react-router';

export const action = getServerAction({
  action: async ({ request }) => {
    const apiClient = clientManager.apiClient;

    try {
      // Call API logout endpoint (invalidates session server-side)
      await apiClient.auth.logout.post();
    } catch (error) {
      // Log but continue - clear cookies anyway
      console.error('Logout API call failed:', error);
    }

    // Clear both cookies
    const headers = new Headers();
    headers.append('Set-Cookie', clearSessionCookie());
    headers.append('Set-Cookie', clearCsrfCookie());

    return redirect('/auth/login', { headers });
  },
});
```

#### 3.5 Update API Client to Inject CSRF Header

**File:** `apps/front/app/lib/js-client/client-manager.ts`

```typescript
import { ApiClient } from '@/js-client';
import { CSRF_TOKEN_COOKIE_KEY, CSRF_HEADER_NAME } from '@/shared/lib/constants';
import * as cookie from 'cookie';

class ClientManager {
  private _apiClient: ApiClient | null = null;

  get apiClient(): ApiClient {
    if (!this._apiClient) {
      this._apiClient = this.createApiClient();
    }
    return this._apiClient;
  }

  createApiClient(): ApiClient {
    const baseUrl = import.meta.env.VITE_API_BASE_URL;

    // Request middleware: Add CSRF header and ensure credentials
    const requestMiddleware = {
      onRequest: async (request: Request): Promise<Request> => {
        const headers = new Headers(request.headers);

        // Layer 2 CSRF: Add CSRF header for mutating requests
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
          const csrfToken = this.getCsrfTokenFromCookie();
          if (csrfToken) {
            headers.set(CSRF_HEADER_NAME, csrfToken);
          } else {
            console.warn('CSRF token not found in cookie');
          }
        }

        // CRITICAL: Include credentials so browser sends httpOnly cookie
        const init: RequestInit = {
          ...request,
          headers,
          credentials: 'include',  // Required for cookies
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

  /**
   * Read CSRF token from non-httpOnly cookie
   * (This is safe - CSRF token is not a credential)
   */
  private getCsrfTokenFromCookie(): string | undefined {
    if (typeof document === 'undefined') return undefined;

    const cookies = cookie.parse(document.cookie);
    return cookies[CSRF_TOKEN_COOKIE_KEY];
  }

  // Anonymous client (no auth)
  get anonApiClient(): ApiClient {
    return this.createApiClient();
  }
}

export const clientManager = new ClientManager();
```

**Deliverable:** Frontend sets httpOnly session cookies, manages CSRF tokens, and injects CSRF header on all mutations.

---

### Phase 4: Frontend - Remove Legacy Code (1-2 days)

**Goal:** Remove all client-side session token reading and `X-Session-Token` header usage.

#### 4.1 Update Authed Layout

**File:** `apps/front/app/routes/authed/_layout/authed-layout.tsx`

```typescript
import { getServerLoader } from '@/front/lib/react-router/server-data';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { getSessionTokenFromRequest } from '@/front/lib/cookies/server-cookie.utils';
import { redirect } from 'react-router';

export const loader = getServerLoader({
  loader: async ({ request }) => {
    // Server-side session check - read from httpOnly cookie
    const sessionToken = getSessionTokenFromRequest(request);

    if (!sessionToken) {
      return redirect('/auth/login?redirect_cause=invalid_session');
    }

    // Validate session by calling API
    const apiClient = clientManager.createApiClient();

    try {
      const authData = await apiClient.auth.userAuthData.get();

      // Session is valid - return auth state
      return {
        isAuthenticated: true,
        user: authData.user,
        permissions: authData.permissions,
      };
    } catch (error) {
      // Invalid/expired session
      console.error('Session validation failed:', error);
      return redirect('/auth/login?redirect_cause=invalid_session');
    }
  },
});

export const clientLoader = getClientLoader({
  loader: async ({ serverLoader }) => {
    // Load i18n
    await i18next.loadNamespaces([
      I18N_NAMESPACES.ZOD,
      I18N_NAMESPACES.RESPONSE_MESSAGE
    ]);

    // Get auth state from server
    const serverData = await serverLoader<typeof loader>();

    if (!serverData?.isAuthenticated) {
      // Should not reach here - server handles redirects
      throw redirect('/auth/login?redirect_cause=invalid_session');
    }

    // Hydrate React Query with server data
    defaultQueryClient.setQueryData(['auth', 'user'], serverData.user);

    // Initialize sidebar state (non-httpOnly cookie)
    const browserCookies = cookie.parse(document.cookie);
    const sidebarCookie = _.get(browserCookies, SIDEBAR_COOKIE_NAME);

    useMainStore.setState((root) => {
      // ... sidebar logic (unchanged)
    });

    return null;
  },
});

// Component (no changes to UI)
const AuthedLayout = () => {
  // ... existing layout code
};
```

#### 4.2 Delete Deprecated Utilities

**Delete or deprecate these functions:**

```typescript
// ❌ DELETE - No longer needed
export const getSessionCookieFromClient = () => { ... }

// ❌ DELETE - Cannot clear httpOnly cookie from JS
export const clearSessionCookie = () => { ... }

// ❌ DELETE - No longer using X-Session-Token header
export const getSessionTokenHeader = () => { ... }
```

#### 4.3 Clean Up API Client Config

Remove any code that sets `X-Session-Token` header in API client configuration.

**Deliverable:** All legacy session token reading removed, authentication purely cookie-based.

---

### Phase 5: Testing & Security Validation (3-4 days)

**Goal:** Comprehensive testing of auth flows and CSRF protection.

#### 5.1 Automated Backend Tests

**SessionAuthMiddleware Tests:**
- [ ] Cookie-based auth succeeds
- [ ] Header-based auth succeeds (backward compat)
- [ ] No token returns 401
- [ ] Expired session returns 401
- [ ] Invalid token returns 401

**CSRF Middleware Tests:**
- [ ] GET/HEAD/OPTIONS bypass CSRF
- [ ] POST with valid CSRF succeeds
- [ ] POST with missing CSRF cookie returns 403
- [ ] POST with missing CSRF header returns 403
- [ ] POST with mismatched CSRF returns 403
- [ ] POST from invalid origin returns 403
- [ ] POST from allowed origin succeeds

#### 5.2 Automated Frontend Tests

**Auth Flow Tests:**
- [ ] Login sets session and CSRF cookies
- [ ] Accept invitation sets session and CSRF cookies
- [ ] Logout clears both cookies
- [ ] Authed layout redirects when no session
- [ ] API client includes CSRF header on mutations

**API Client Tests:**
- [ ] CSRF header included on POST/PUT/PATCH/DELETE
- [ ] CSRF header NOT included on GET
- [ ] Credentials included in all requests
- [ ] Missing CSRF cookie logs warning

#### 5.3 Manual Security Testing

**Test 1: CSRF via HTML Form**

Create `csrf-attack-form.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <h1>CSRF Attack Simulation</h1>
  <form action="http://localhost:5000/api/staff/members" method="POST">
    <input type="hidden" name="email" value="attacker@evil.com" />
    <input type="submit" value="Attack!" />
  </form>
  <script>document.forms[0].submit();</script>
</body>
</html>
```

**Expected:** Request blocked (missing CSRF header)

**Test 2: CSRF via JavaScript Fetch**

```html
<!-- On attacker's site -->
<script>
fetch('http://localhost:5000/api/staff/members', {
  method: 'POST',
  credentials: 'include',  // Send victim's cookies
  headers: {
    'X-CSRF-Token': 'fake-token',  // Attacker can't get real token
  },
  body: JSON.stringify({ email: 'attacker@evil.com' }),
});
</script>
```

**Expected:** Blocked by CORS preflight or CSRF mismatch

**Test 3: XSS Cookie Theft Attempt**

```javascript
// In browser console on your site
console.log(document.cookie);
```

**Expected:** Session cookie NOT visible (httpOnly)
**Expected:** CSRF cookie IS visible (non-httpOnly, intentional)

**Test 4: Session Replay After Logout**

```bash
# Capture session cookie before logout
# Logout
# Try to reuse captured cookie
curl -H "Cookie: publy-session=old-token" http://localhost:5000/api/staff/dashboard
```

**Expected:** 401 Unauthorized (session invalidated server-side)

#### 5.4 Browser DevTools Validation

**Check Cookies in Application Tab:**

Session Cookie:
```
Name: publy-session
Value: [hidden due to HttpOnly]
HttpOnly: ✅
Secure: ✅ (in production)
SameSite: Lax
Path: /
```

CSRF Cookie:
```
Name: PUBLYAPP-CSRF
Value: [visible random string]
HttpOnly: ❌ (intentional)
Secure: ✅ (in production)
SameSite: Lax
Path: /
```

**Check Network Tab:**

Request Headers:
```
Cookie: publy-session=...; PUBLYAPP-CSRF=...
X-CSRF-Token: [same as CSRF cookie]
```

Response Headers (after login):
```
Set-Cookie: publy-session=...; HttpOnly; Secure; SameSite=Lax; Path=/
Set-Cookie: PUBLYAPP-CSRF=...; Secure; SameSite=Lax; Path=/
```

#### 5.5 Penetration Testing Checklist

- [ ] CSRF via HTML form
- [ ] CSRF via image tag
- [ ] CSRF via fetch with credentials
- [ ] CSRF via XMLHttpRequest
- [ ] Cookie theft via XSS (should fail - httpOnly)
- [ ] Session fixation attack
- [ ] Cookie injection via subdomain
- [ ] Replay attack with expired session
- [ ] Concurrent session handling
- [ ] Cross-origin request from unauthorized domain
- [ ] Request without Origin/Referer headers
- [ ] CSRF token reuse across sessions

**Deliverable:** All security tests pass, vulnerabilities documented and fixed.

---

### Phase 6: Rollout & Monitoring (2-3 days)

**Goal:** Deploy safely with monitoring and incident response plan.

#### 6.1 Staged Rollout Strategy

**Option A: Feature Flag (Recommended)**

```csharp
// appsettings.json
{
  "FeatureFlags": {
    "UseCookieSessionAuth": false  // Start disabled
  }
}
```

```csharp
// SessionAuthMiddleware.cs
var useCookieAuth = _configuration.GetValue<bool>("FeatureFlags:UseCookieSessionAuth");

if (useCookieAuth)
{
    // Try cookie first
}
else
{
    // Use header (old behavior)
}
```

**Rollout Schedule:**
1. Deploy with flag `false` (no change)
2. Enable in dev environment → test for 1 day
3. Enable in staging → test for 2 days
4. Enable for 10% production users → monitor for 1 day
5. Enable for 50% production users → monitor for 1 day
6. Enable for 100% production users
7. After 1 week stable, remove flag and header fallback

**Option B: Environment-Based**

```
Development: Cookie auth enabled
Staging: Cookie auth enabled
Production: Header auth (old behavior)
→ After testing, switch production
```

#### 6.2 Monitoring & Metrics

**Key Metrics to Track:**

```csharp
// Add metrics collection
_metrics.IncrementCounter("auth.session.cookie");    // Cookie auth used
_metrics.IncrementCounter("auth.session.header");    // Header auth used (legacy)
_metrics.IncrementCounter("csrf.blocked");           // CSRF attempts blocked
_metrics.IncrementCounter("csrf.origin_invalid");    // Invalid origin
_metrics.IncrementCounter("csrf.token_mismatch");    // Token mismatch
_metrics.IncrementCounter("auth.login.success");     // Successful logins
_metrics.IncrementCounter("auth.login.failure");     // Failed logins
_metrics.IncrementCounter("session.expired");        // Expired sessions
```

**Dashboards:**
- Auth method distribution (cookie vs header)
- CSRF blocks per hour
- Login success/failure rates
- 401/403 error rates
- Session expiration patterns

**Alerts:**
- CSRF blocks > 10 from same IP in 1 hour
- CSRF blocks > 100 total in 1 hour
- Login failure rate > 20%
- 401/403 rate increases > 50%
- Origin validation failures spike

#### 6.3 Incident Response Playbook

**Scenario 1: CSRF Attack Detected**

**Symptoms:**
- Spike in CSRF-blocked requests
- Multiple failed requests from same origin
- Suspicious patterns in logs

**Immediate Actions:**
1. Check if any malicious requests succeeded (query logs)
2. Identify affected user accounts
3. Verify CSRF middleware is functioning
4. Check if attacker found a bypass

**Short-term Actions:**
1. Tighten origin validation (remove lenient fallbacks)
2. Add IP-based rate limiting
3. Force logout all sessions if widespread
4. Review and patch any identified vulnerabilities

**Long-term Actions:**
1. Security audit of all state-changing endpoints
2. Implement additional CSRF tokens for high-risk operations
3. Review CSP and other security headers
4. Penetration testing by security firm

**Scenario 2: Auth Failures After Deployment**

**Symptoms:**
- 401/403 spike after deployment
- Users unable to login or stay logged in
- Session tokens not being sent

**Immediate Actions:**
1. Check if cookies are being set correctly (Set-Cookie headers)
2. Verify middleware order in pipeline
3. Check CORS configuration (`AllowCredentials`)
4. Verify frontend is sending `credentials: 'include'`

**Rollback Plan:**
1. Disable feature flag (if using)
2. Revert to previous deployment
3. Investigate in staging environment
4. Fix and redeploy

**Scenario 3: Cookie Not Visible in Browser**

**Symptoms:**
- Session cookie not showing in DevTools
- Auth fails immediately after login

**Diagnosis:**
1. Check Set-Cookie header in response
2. Verify cookie attributes (domain, path, secure)
3. Check browser console for cookie warnings
4. Verify CORS configuration

**Fix:**
- Ensure domain matches (or not set for host-only)
- Remove `Secure` flag in dev (if using HTTP)
- Check for conflicting cookie settings

#### 6.4 Documentation Updates

**Update `AGENTS.md`:**

```markdown
## Authentication & Authorization

**Authentication:**
- Session-based with **httpOnly cookie** (`publy-session`)
- Browser automatically sends cookie with all API requests
- Backend reads token from `Cookie` header in `SessionAuthMiddleware`
- **NEVER read session cookie in JavaScript** (httpOnly protection)

**CSRF Protection:**
- Three-layer defense: SameSite + double-submit token + origin validation
- CSRF token stored in non-httpOnly cookie (`PUBLYAPP-CSRF`)
- Frontend reads CSRF cookie and sends as `X-CSRF-Token` header on mutations
- CSRF middleware validates token and origin on POST/PUT/PATCH/DELETE

**Session Lifecycle:**
- Login: Backend sets httpOnly session cookie + CSRF cookie
- Requests: Browser automatically includes both cookies
- Logout: Backend clears both cookies via `Set-Cookie` headers
- Expiry: Sessions expire server-side, enforced in `SessionAuthMiddleware`

**Security Considerations:**
- Session token protected from XSS (httpOnly)
- CSRF protected by multiple layers
- Origin validation prevents cross-site attacks
- Session rotation on login prevents fixation attacks
```

**Update API Documentation:**
- Remove references to `X-Session-Token` header
- Document cookie-based authentication
- Document CSRF protection requirements
- Add security best practices

**Create Runbook:**
- Common auth issues and solutions
- How to verify cookie settings
- How to test CSRF protection
- Monitoring and alerting procedures

#### 6.5 Remove Backward Compatibility (After Stable)

**After 1-2 weeks of stable production:**

1. Remove `X-Session-Token` header support:
   ```csharp
   // Delete fallback code in SessionAuthMiddleware
   // Remove header auth tests
   ```

2. Remove feature flags:
   ```csharp
   // Delete FeatureFlags configuration
   // Simplify middleware logic
   ```

3. Clean up documentation:
   ```markdown
   // Remove "backward compatibility" notes
   // Remove migration guides
   ```

4. Archive old code:
   ```bash
   git tag pre-httponly-migration
   # Keep tag for reference
   ```

**Deliverable:** Production running stable on httpOnly cookies with comprehensive monitoring.

---

## Security Guarantees Summary

Once fully implemented, this architecture provides:

### 1. Session Secrecy
- ✅ Session token **never exposed to JavaScript** (httpOnly)
- ✅ XSS attacks **cannot steal session token**
- ✅ Session token **only readable by browser and API**

### 2. CSRF Resistance
- ✅ **Layer 1:** `SameSite=Lax` blocks most cross-site requests
- ✅ **Layer 2:** Double-submit token requires attacker to:
  - Read CSRF cookie (blocked by same-origin policy)
  - Set matching header (blocked by CORS/same-origin)
- ✅ **Layer 3:** Origin validation ensures requests from allowed domains only
- ✅ **Redundancy:** If one layer fails, others provide protection

### 3. Session Lifecycle Security
- ✅ New session token generated on every login (prevents fixation)
- ✅ Session invalidated server-side on logout
- ✅ Sessions expire server-side, enforced on every request
- ✅ Cookies cleared client-side on logout

### 4. Additional Protections
- ✅ Host-only cookies (no `Domain` attribute) prevent subdomain attacks
- ✅ `Secure` flag ensures HTTPS-only transmission (production)
- ✅ `Path=/` ensures cookie sent to all API endpoints
- ✅ Origin validation prevents cross-domain attacks

### 5. Future-Proofing
- ✅ Compatible with future mobile clients (can add API key auth)
- ✅ Standards-compliant (follows OWASP recommendations)
- ✅ Extensible (can add additional tokens for high-risk operations)
- ✅ Monitoring in place to detect emerging threats

---

## Success Criteria

### Technical Requirements
- [ ] Session token in httpOnly cookie, not accessible via `document.cookie`
- [ ] CSRF cookie visible in `document.cookie` (non-httpOnly)
- [ ] API client includes `X-CSRF-Token` header on mutations
- [ ] CSRF middleware blocks requests with invalid tokens
- [ ] Origin validation blocks cross-domain requests
- [ ] Backward compatibility works during transition

### Functional Requirements
- [ ] Login flow works correctly, sets both cookies
- [ ] Accept invitation flow works, sets both cookies
- [ ] Logout flow works, clears both cookies
- [ ] Session persistence across page reloads
- [ ] Session expiry handled gracefully
- [ ] No increase in 401/403 errors
- [ ] All authed pages load correctly

### Security Requirements
- [ ] Session cookie has `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] CSRF cookie has `Secure`, `SameSite=Lax` (no `HttpOnly`)
- [ ] CSRF attack simulations fail as expected
- [ ] XSS cannot steal session token
- [ ] Origin validation rejects unauthorized domains
- [ ] Penetration testing passes all checks

### Operational Requirements
- [ ] Monitoring dashboards show auth metrics
- [ ] Alerts configured for security events
- [ ] Incident response playbook documented
- [ ] Team trained on new auth system
- [ ] Documentation updated (`AGENTS.md`, runbooks)

---

## Open Questions & Decisions

### 1. SameSite Setting
**Question:** Use `Strict` or `Lax`?

**Options:**
- `Strict`: More secure, blocks ALL cross-site requests
  - Downside: Breaks email links, external navigation
- `Lax`: Less secure, allows safe cross-site navigation
  - Prevents CSRF for POST/PUT/PATCH/DELETE
  - Better UX for common flows

**Decision:** Start with `Lax`, monitor for CSRF attempts, tighten to `Strict` if needed.

### 2. Origin Validation Strictness
**Question:** Reject requests with NO Origin/Referer header?

**Options:**
- Strict: Reject if no Origin/Referer
  - More secure, but might break legitimate clients
- Lenient: Allow if no Origin/Referer (log for monitoring)
  - Some browsers/clients don't send these headers

**Decision:** Log and allow for now, monitor patterns, tighten later if suspicious activity detected.

### 3. CSRF Token Lifetime
**Question:** How long should CSRF tokens last?

**Options:**
- Session-based: Regenerate on login, expire with session
  - Simpler, tied to session lifecycle
- Time-based: 7-day expiry, independent of session
  - Better UX, user doesn't need to re-login for CSRF

**Decision:** Use session-based (regenerate on login), align with session expiry for consistency.

### 4. Session Rotation
**Question:** Regenerate session token periodically?

**Options:**
- On login only: Simpler, prevents session fixation
- Periodic (e.g., every hour): More secure, limits exposure window
  - More complex, requires coordination

**Decision:** Start with login-only rotation. Add periodic rotation in Phase 2 if security audit recommends.

### 5. Multiple Concurrent Sessions
**Question:** Allow user to have multiple active sessions?

**Options:**
- Single session: More secure, forces logout on new login
  - Bad UX if user has multiple devices
- Multiple sessions: Better UX, but more complex
  - Need session management UI

**Decision:** Keep current behavior (multiple sessions), revisit if security concerns arise.

---

## Appendix: Security Best Practices Reference

### OWASP Recommendations
- [x] HttpOnly flag on session cookie
- [x] Secure flag on session cookie (production)
- [x] SameSite attribute on session cookie
- [x] CSRF protection for state-changing operations
- [x] Origin/Referer validation
- [ ] Content Security Policy headers
- [ ] Subresource Integrity for scripts
- [ ] Regular security audits

### CWE Mitigations
- CWE-352 (CSRF): Three-layer protection
- CWE-79 (XSS): HttpOnly cookies prevent token theft
- CWE-384 (Session Fixation): Token regeneration on login
- CWE-613 (Session Expiration): Server-side expiry enforced
- CWE-614 (Secure Cookie): Secure flag in production

### Browser Compatibility
- Chrome/Edge: Full support for SameSite=Lax
- Firefox: Full support for SameSite=Lax
- Safari: SameSite support added in v13+
  - May need fallback for older versions
- Mobile browsers: Generally good support

---

## Next Steps

1. **Review & Approve:** Team reviews this merged plan
2. **Assign Resources:** Identify backend and frontend developers
3. **Create Tickets:** Break down phases into Jira/GitHub issues
4. **Begin Phase 0:** Start with inventory and preconditions
5. **Set Milestones:** Define completion criteria for each phase
6. **Schedule Security Review:** Book time with security expert after Phase 5

**Ready to proceed when approved! 🚀**

