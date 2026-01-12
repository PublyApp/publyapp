# Plan: Tenant-Aware API Client Implementation

**Status: IMPLEMENTED** (2026-01-04)

All phases have been completed. See PR #159 for the full implementation.

**Note:** After initial implementation, follow-up refactoring was done:

1. **Request-scoped ClientManager:**
   - Browser: `getClientManager()` returns a singleton (tokens read from cookie)
   - Server: `getClientManager({ staffToken, tenantToken })` creates a per-request instance
   - Dual-token cookie format supported for impersonation (`s:` + `t:`)

2. **Server HOF refactoring (getServerLoader/getServerAction):**
   - Removed `apiClient` auto-creation from HOFs
   - Now pass `sessionToken` (+ `staffToken` / `tenantToken`) as primitives instead
   - Callers create their own client: `getClientManager({ staffToken, tenantToken }).createClient({ tenantId })`

---

## Problem
API requests don't consistently include the `X-PublyApp-TenantId` header, risking cross-tenant data leakage when users switch organizations.

## Solution Overview
1. Fix `ClientManager` to properly inject tenant-id headers
2. Create hook factories that enforce tenantId as a required parameter
3. Migrate existing hooks to use the new pattern
4. TenantId will be part of query keys for proper cache isolation

---

## Phase 1: Refactor ClientManager

**File:** `apps/front/app/lib/js-client/client-manager.ts`

### Current Implementation

See `apps/front/app/lib/js-client/client-manager.ts`.

Key points:
- Browser: `getClientManager()` returns a singleton (tokens read from cookie)
- Server: `getClientManager({ staffToken, tenantToken })` creates a per-request instance
- Main methods: `createClient`, `getOrCreateClient`, `getOrCreateStaffClient`, `getOrCreateAnonymousClient`, `clearClients`, `resetInstance`

### Key Insight: Read Session Token Fresh on Every Request

Instead of baking the session token into `ApiKeyAuthenticationProvider`, we inject it fresh in `customFetch`. This makes clients stateless regarding auth - they only care about which tenant to target.

### Implementation Summary

- `ClientManager` injects `X-Session-Token` (fresh) and optional `X-PublyApp-TenantId` via a custom `fetch`.
- `getClientManager()` returns a browser singleton; `getClientManager({ staffToken, tenantToken })` creates a per-request server instance.
- Cached clients:
  - `getOrCreateClient(tenantId)` (tenant-scoped)
  - `getOrCreateStaffClient()` (staff-scoped, no tenant header)
  - `getOrCreateAnonymousClient()` (no auth)

### Benefits of This Approach:
- **No `_tokenStore` needed** - token read fresh, not baked in
- **Key by `tenantId` only** - simpler caching
- **Token changes handled automatically** - no stale token issues
- **Consistent pattern** - both session token and tenant-id in customFetch
- **`skipAuth` flag** - for anonymous/public endpoints that shouldn't include session token

### Client Types Summary:

**Unified API via `getClientManager()`:**
```typescript
import { getClientManager } from '@/front/lib/js-client/client-manager';

 // Browser - returns singleton, session from cookie
 getClientManager().createClient({ tenantId });
 getClientManager().getOrCreateClient(tenantId);  // cached
getClientManager().getOrCreateStaffClient();      // cached
getClientManager().getOrCreateAnonymousClient();  // cached

 // Server - new instance per request
getClientManager({ staffToken, tenantToken }).createClient({ tenantId });

// Server - anonymous/public endpoints
getClientManager().createClient({ skipAuth: true });
```

| Context | Pattern | Session Token |
|---------|---------|---------------|
| Browser | `getClientManager().createClient()` | From cookie (singleton) |
| Server (auth) | `getClientManager({ staffToken, tenantToken }).createClient()` | Explicit (new instance) |
| Server (public) | `getClientManager().createClient({ skipAuth: true })` | None |

---

## Phase 2: Create Hook Factories with Embedded Middleware

**New File:** `apps/front/app/lib/react-query/create-hooks.ts`

Create factory functions that wrap the user's fetcher to:
- Create the appropriate client (tenant/staff/anonymous)
- Read session tokens fresh from cookies (via `ClientManager`)
- Enforce `tenantId` at the type level for tenant-scoped hooks

### Factory Implementation Pattern:

```typescript
import { createMutation, createQuery, createSuspenseQuery } from 'react-query-kit';

import { getClientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import { getQueryKey } from './query-utils';

// Type for tenant-scoped variables (tenantId REQUIRED)
type WithTenantId<T> = { tenantId: string } & Omit<T, 'tenantId'>;

export function createTenantQuery<TData, TVariables extends Record<string, unknown>>(config: {
  queryKeyFn: (client: ApiClient) => unknown;
  fetcher: (client: ApiClient, variables: WithTenantId<TVariables>) => Promise<TData>;
}) {
  const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

  return createQuery<TData, WithTenantId<TVariables>>({
    queryKey: [queryKey] as const,
    fetcher: async (variables) => {
      const client = getClientManager().getOrCreateClient(variables.tenantId);
      return config.fetcher(client, variables);
    },
  });
}

export function createTenantSuspenseQuery<TData, TVariables extends Record<string, unknown>>(config: {
  queryKeyFn: (client: ApiClient) => unknown;
  fetcher: (client: ApiClient, variables: WithTenantId<TVariables>) => Promise<TData>;
}) {
  const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

  return createSuspenseQuery<TData, WithTenantId<TVariables>>({
    queryKey: [queryKey] as const,
    fetcher: async (variables) => {
      const client = getClientManager().getOrCreateClient(variables.tenantId);
      return config.fetcher(client, variables);
    },
  });
}

export function createStaffQuery<TData, TVariables extends Record<string, unknown>>(config: {
  queryKeyFn: (client: ApiClient) => unknown;
  fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
}) {
  const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

  return createQuery<TData, TVariables>({
    queryKey: [queryKey] as const,
    fetcher: async (variables) => {
      const client = getClientManager().getOrCreateStaffClient();
      return config.fetcher(client, variables);
    },
  });
}

export function createPublicQuery<TData, TVariables extends Record<string, unknown>>(config: {
  queryKeyFn: (client: ApiClient) => unknown;
  fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
}) {
  const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

  return createQuery<TData, TVariables>({
    queryKey: [queryKey] as const,
    fetcher: async (variables) => {
      return config.fetcher(
        getClientManager().getOrCreateAnonymousClient(),
        variables,
      );
    },
  });
}
```

### Key Design Points:
- **No global middleware** - QueryClient remains unchanged
- **tenantId in query key** - react-query-kit automatically includes variables in query key
- **Type-safe** - `createTenantQuery` enforces `tenantId` in variables at compile time
- **Clean separation** - Tenant vs Staff vs Public hooks are clearly differentiated

---

## Phase 3: Migrate Existing Hooks

### Staff Hooks (`apps/front/app/lib/react-query/features/staff/`)

| Hook | Factory to Use |
|------|----------------|
| `useCreateTenant` | `createStaffMutation` |
| `useGetTenant` | `createStaffQuery` |
| `useFindTenants` | `createStaffQuery` |
| `useFindTenantProfiles` | `createStaffQuery` |

**Example Migration:**

Before:
```typescript
export const useFindTenants = createQuery({
  queryKey: [findTenantsQueryKey] as const,
  fetcher: async (params: FindTenantsParams) => {
    const result = await clientManager.apiClient.staff.tenants.get({...});
    return result;
  },
});
```

After:
```typescript
export const useFindTenants = createStaffQuery({
  queryKeyFn: (client) => client.staff.tenants.get,
  fetcher: async (client, params: FindTenantsParams) => {
    const result = await client.staff.tenants.get({...});
    return result;
  },
});
```

### Auth Hooks (`apps/front/app/lib/react-query/features/common/auth.hooks.ts`)

| Hook | Factory to Use |
|------|----------------|
| `useGetUserAuthData` | `createAuthQuery` (no tenantId) |
| `useGetTenantAuthData` | `createTenantQuery` (needs tenantId) |
| `useGetUserTenants` | `createAuthQuery` (no tenantId) |
| `useGetRedirectCode` | `createAuthQuery` (tenantId optional via param) |

---

## Phase 4: Update Logout Cleanup

**File:** `apps/front/app/lib/cookies/logout.utils.ts`

Add client store cleanup to logout:

```typescript
import { getClientManager } from '@/front/lib/js-client/client-manager';

export const logout = (options?: LogoutOptions): void => {
  clearSessionCookie();
  defaultQueryClient.removeQueries();

  // Clear cached API clients and reset singleton (ensures clean state for next user)
  getClientManager().clearClients();
  ClientManager.resetInstance();

  // ... rest of form submission
};
```

**Why:** Good hygiene to clear cached clients. Since clients now read session tokens fresh from cookies, this isn't strictly required for auth - but it's still recommended to:
- Free memory from unused client instances
- Ensure clean state for next user

**Critical:** React-query cache clear (`removeQueries()`) is still essential to prevent showing previous user's data!

**Note:** The `LAST_USED_TENANT_ID_COOKIE_KEY` cookie is intentionally kept on logout (not a security issue, backend validates access).

**TODO (future):** Move last-used-tenant storage from cookie to database for cross-device persistence.

---

## Phase 5: Remove Deprecated API Initialization

**Files:**
- `apps/front/app/lib/api.ts` - **DELETED** (all logic consolidated in ClientManager)

Remove `initApiClientOnClient` and `initApiClientOnServer` entirely. Update callers:

| Caller | Current Usage | New Pattern |
|--------|---------------|-------------|
| `entry.client.tsx` | `initApiClientOnClient()` | Remove call (not needed) |
| `authed-layout.tsx` | `initApiClientOnClient()` | Remove call (not needed) |
| `client-data.ts` | `initApiClientOnClient()` | Use `getClientManager().getOrCreateClient()` directly |

**New pattern for accessing client outside React hooks (e.g., in router loaders):**

```typescript
// In getClientLoader or any non-React context
import { getClientManager } from '@/front/lib/js-client/client-manager';

export const clientLoader = getClientLoader({
  loader: async ({ params }) => {
    const tenantId = params.tenantId!;

    // For tenant-scoped operations:
    const client = getClientManager().getOrCreateClient(tenantId);

    // For staff operations:
    const staffClient = getClientManager().getOrCreateStaffClient();

    // For anonymous operations:
    const anonClient = getClientManager().getOrCreateAnonymousClient();

    // Use client... (session token read fresh on every request)
    return null;
  },
});
```

**Type-safe prefetch queries with react-query-kit in router loaders:**

```typescript
import { QueryClient } from '@tanstack/react-query';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { useFindPosts } from '@/front/lib/react-query/features/tenant/posts.hooks';

export const clientLoader = getClientLoader({
  loader: async ({ params }) => {
    const tenantId = params.tenantId!;
    const queryClient = new QueryClient();

    // Type-safe prefetch using react-query-kit's getKey and fetcher
    await queryClient.prefetchQuery({
      queryKey: useFindPosts.getKey({ tenantId, page: 1 }),
      queryFn: () => useFindPosts.fetcher({ tenantId, page: 1 }),
    });

    // Or use ensureQueryData for cached-first approach
    await queryClient.ensureQueryData({
      queryKey: useFindPosts.getKey({ tenantId, page: 1 }),
      queryFn: () => useFindPosts.fetcher({ tenantId, page: 1 }),
    });

    // Prefetch multiple queries in parallel
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: useFindPosts.getKey({ tenantId, page: 1 }),
        queryFn: () => useFindPosts.fetcher({ tenantId, page: 1 }),
      }),
      queryClient.prefetchQuery({
        queryKey: useFindAccounts.getKey({ tenantId }),
        queryFn: () => useFindAccounts.fetcher({ tenantId }),
      }),
    ]);

    return null;
  },
});
```

**Key react-query-kit methods for prefetching:**
- `hook.getKey(variables)` - Get type-safe query key including variables
- `hook.fetcher(variables)` - Call the fetcher directly (factory will create the right client)
- `hook.getOptions(variables)` - Get full query options for useSuspenseQueries

---

## Phase 6: Inspect and Update Existing Documentation

**Goal:** Review all existing documentation for outdated API client patterns and update them.

### Files to Inspect:

| Location | Check For |
|----------|-----------|
| `AGENTS.md` | API client usage patterns, `initApiClientOnClient`, old hook patterns |
| `docs/**/*.md` | Any implementation plans or guides referencing old patterns |
| `README.md` | Project setup or API client documentation |
| Code comments | Outdated TODO comments about tenant-id headers |

### Patterns to Find and Update:

1. **Old initialization:**
   - `initApiClientOnClient()` → Remove references
   - `clientManager.apiClient` → `getClientManager().getOrCreateClient(tenantId)` or `getClientManager().getOrCreateStaffClient()`
   - `clientManager.setApiClient()` → Remove references

2. **Old hook patterns:**
   - Direct `clientManager.apiClient` usage → Use factories
   - Missing tenantId in tenant-scoped hooks → Add tenantId parameter

3. **Old client creation:**
   - `createApiClient(sessionToken)` → `getClientManager().getOrCreateClient(tenantId)` or `getClientManager().getOrCreateStaffClient()`
   - `ApiKeyAuthenticationProvider` usage → Note we now use `AnonymousAuthenticationProvider` with fresh token injection in `customFetch`

4. **Outdated TODOs:**
   - `// TODO: set last used tenant id header too` → Remove (now implemented)

---

## Phase 7: Update AGENTS.md Documentation

**File:** `AGENTS.md`

Update the "API Client Integration" section (around line 232) to document the new client access patterns:

```markdown
**API Client Integration:**
- Microsoft Kiota auto-generated client from OpenAPI
- Singleton `ClientManager` in `app/lib/js-client/`
- Session token from `X-Session-Token` header
- Tenant ID from `X-PublyApp-TenantId` header

**Getting API Clients:**

1. **In React hooks** - Use hook factories:
   ```typescript
   // Tenant-scoped (tenantId required)
   export const useFindPosts = createTenantQuery({
     queryKeyFn: (client) => client.tenant.posts.get,
     fetcher: (client, params) => client.tenant.posts.get({...}),
   });

   // Staff-only (no tenantId)
   export const useFindTenants = createStaffQuery({
     queryKeyFn: (client) => client.staff.tenants.get,
     fetcher: (client, params) => client.staff.tenants.get({...}),
   });
   ```

2. **Outside React lifecycle** (e.g., router loaders):
   ```typescript
   import { getClientManager } from '@/front/lib/js-client/client-manager';

   // Tenant client (with tenant-id header)
   const client = getClientManager().getOrCreateClient(tenantId);

   // Staff client (no tenant-id header)
   const staffClient = getClientManager().getOrCreateStaffClient();

   // Anonymous client (no auth, no tenant)
   const anonClient = getClientManager().getOrCreateAnonymousClient();

   // Note: Session token is read fresh from cookies on every request
   ```

3. **Type-safe prefetch in router loaders** (react-query-kit):
   ```typescript
   import { useFindPosts } from '@/front/lib/react-query/features/tenant/posts.hooks';

   export const clientLoader = getClientLoader({
     loader: async ({ params }) => {
       const tenantId = params.tenantId!;
       const queryClient = new QueryClient();

       await queryClient.prefetchQuery({
         queryKey: useFindPosts.getKey({ tenantId, page: 1 }),
         queryFn: () => useFindPosts.fetcher({ tenantId, page: 1 }),
       });

       return null;
     },
   });
   ```
   **Methods:** `hook.getKey()`, `hook.fetcher()`, `hook.getOptions()`
```

---

## Memory/Performance Notes

**Not a concern:**
- Users typically belong to ~5-10 tenants max
- Store holds at most ~10 clients + "staff"
- Each client is lightweight (fetch wrapper + adapter)
- Cleared on logout, fresh per session

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/front/app/lib/js-client/client-manager.ts` | Unified `getClientManager()` + `createClient()` + tenant header injection |
| `apps/front/app/lib/react-query/create-hooks.ts` | **NEW** - Hook factories (client injection) |
| `apps/front/app/lib/cookies/logout.utils.ts` | Add `getClientManager().clearClients()` + `ClientManager.resetInstance()` |
| `apps/front/app/lib/api.ts` | **DELETED** - Logic consolidated in ClientManager |
| `apps/front/app/entry.client.tsx` | Remove `initApiClientOnClient()` call |
| `apps/front/app/routes/authed/_layout/authed-layout.tsx` | Remove `initApiClientOnClient()` call |
| `apps/front/app/lib/react-router/client-data.ts` | Use `getClientManager().getOrCreateClient()` directly |
| `apps/front/app/lib/react-router/server-data.server.ts` | Pass `sessionToken` to callers |
| `apps/front/app/routes/auth/_layout/auth-layout.tsx` | Use `getClientManager().createClient()` |
| `apps/front/app/routes/auth/login/login-page.tsx` | Use `getClientManager().createClient()` |
| `apps/front/app/lib/react-query/features/staff/staff-tenant.hooks.ts` | Migrate to factories |
| `apps/front/app/lib/react-query/features/staff/staff-member.hooks.ts` | Migrate to factories |
| `apps/front/app/lib/react-query/features/staff/staff-invitation.hooks.ts` | Migrate to factories |
| `apps/front/app/lib/react-query/features/staff/staff-profile.hooks.ts` | Migrate to factories |
| `apps/front/app/lib/react-query/features/common/auth.hooks.ts` | Migrate to factories |
| `AGENTS.md` | Document new client access patterns |
| `docs/**/*.md` | Inspect and update outdated API client patterns |
| `README.md` | Inspect and update if needed |

---

## Usage Examples

### Tenant-Scoped Query (tenantId required)
```typescript
// Definition
export const useFindPosts = createTenantQuery({
  queryKeyFn: (client) => client.tenant.posts.get,
  fetcher: async (client, params: { page?: number }) => {
    return client.tenant.posts.get({ queryParameters: { page: params.page } });
  },
});

// Usage in component
const tenantId = useTenantParam();
const { data } = useFindPosts({ tenantId, page: 1 }); // TypeScript enforces tenantId!
```

### Staff Query (no tenantId)
```typescript
// Definition
export const useFindTenants = createStaffQuery({
  queryKeyFn: (client) => client.staff.tenants.get,
  fetcher: async (client, params: FindTenantsParams) => {
    return client.staff.tenants.get({ queryParameters: {...} });
  },
});

// Usage
const { data } = useFindTenants({ page: 1 }); // No tenantId needed
```

### Staff Accessing Tenant Data
```typescript
// Staff viewing a specific tenant's data
const tenantIdToView = useParams().tenantId; // From /staff/tenants/:tenantId

const { data } = useFindPosts({ tenantId: tenantIdToView, page: 1 });
```

---

## Cache Isolation

Query keys will automatically include tenantId when using `createTenantQuery`:
```typescript
// Query key becomes: ['tenant.posts.get', { tenantId: 'abc-123', page: 1 }]
```

This ensures:
- Org A's data is cached separately from Org B's data
- Switching tenants triggers fresh data fetch
- No stale cross-tenant data displayed

---

## Phase 8: Dual Session Token Cookie Format (Impersonation Support)

**Status: PLANNED**

Staff users need to impersonate tenant users while maintaining their staff session. This requires storing two session tokens simultaneously.

### Cookie Format

```
# Non-staff user (tenant only)
t:${tenant_token}

# Staff user (not impersonating)
s:${staff_token}

# Staff user impersonating
s:${staff_token}+t:${impersonation_token}
```

**Delimiter:** `+` separates tokens
**Prefixes:** `s:` = staff, `t:` = tenant

### Backward Compatibility

Old cookies (no prefix) are treated as tenant tokens:
```typescript
if (!cookieValue.includes(':')) {
  return { tenantToken: cookieValue };  // Legacy format
}
```

### Cookie Parsing Utilities

**File:** `apps/front/app/lib/cookies/session-cookie.utils.ts`

```typescript
export type ParsedSessionTokens = {
  staffToken?: string;
  tenantToken?: string;
};

export function parseSessionCookie(cookieValue: string): ParsedSessionTokens {
  const result: ParsedSessionTokens = {};

  // Legacy format (no prefix) = tenant token
  if (!cookieValue.includes(':')) {
    return { tenantToken: cookieValue };
  }

  for (const part of cookieValue.split('+')) {
    if (part.startsWith('s:')) {
      result.staffToken = part.slice(2);
    } else if (part.startsWith('t:')) {
      result.tenantToken = part.slice(2);
    }
  }

  return result;
}

export function formatSessionCookie(tokens: ParsedSessionTokens): string {
  const parts: string[] = [];
  if (tokens.staffToken) parts.push(`s:${tokens.staffToken}`);
  if (tokens.tenantToken) parts.push(`t:${tokens.tenantToken}`);
  return parts.join('+');
}

export function getSessionTokensFromClient(): ParsedSessionTokens {
  const browserCookies = cookie.parse(document.cookie);
  const rawValue = browserCookies[SESSION_TOKEN_COOKIE_KEY];
  if (!rawValue) return {};
  return parseSessionCookie(rawValue);
}
```

### ClientManager Updates

**File:** `apps/front/app/lib/js-client/client-manager.ts`

```typescript
type ClientManagerOptions = {
  staffToken?: string;
  tenantToken?: string;
};

type CreateClientOptions = {
  tenantId?: string;
  skipAuth?: boolean;
  /** Which token context to use. Required when both tokens exist. */
  context?: 'staff' | 'tenant';
};

export class ClientManager {
  private readonly staffToken?: string;
  private readonly tenantToken?: string;

  private constructor(options?: ClientManagerOptions) {
    this.staffToken = options?.staffToken;
    this.tenantToken = options?.tenantToken;
  }

  public static create(options?: ClientManagerOptions): ClientManager {
    if (!isServer) {
      // Browser: return singleton, read tokens from cookie
      if (!ClientManager._instance) {
        const tokens = getSessionTokensFromClient();
        ClientManager._instance = new ClientManager({
          staffToken: tokens.staffToken,
          tenantToken: tokens.tenantToken,
        });
      }
      return ClientManager._instance;
    }
    // Server: create new instance per request
    return new ClientManager(options);
  }

  // Reset browser singleton after cookie changes
  public static resetInstance(): void {
    if (!isServer) {
      ClientManager._instance = undefined as never;
    }
  }

  private getSessionToken(context?: 'staff' | 'tenant'): string | undefined {
    if (context === 'staff') return this.staffToken;
    if (context === 'tenant') return this.tenantToken;
    // Default: tenant if available, otherwise staff
    return this.tenantToken ?? this.staffToken;
  }

  public createClient(options?: CreateClientOptions): ApiClient {
    if (options?.skipAuth) {
      return this.createClientWithToken(undefined, options?.tenantId);
    }
    const token = this.getSessionToken(options?.context);
    return this.createClientWithToken(token, options?.tenantId);
  }
}
```

### Login Flow

Login doesn't know if user is staff (determined via `/auth/tenant-auth-data?tenantId=staff`).

**Approach:** Login writes token without prefix. Prefix is determined after auth data loads:

```typescript
// Login action - write raw token
const sessionTokenCookie = cookie.serialize(
  SESSION_TOKEN_COOKIE_KEY,
  sessionToken,  // No prefix initially
  cookieOptions,
);

// After auth data loads (in auth layout/context)
const hasStaffAccess = userAuthData.staff !== null;
const newCookieValue = hasStaffAccess
  ? `s:${currentToken}`
  : `t:${currentToken}`;
// Update cookie and call ClientManager.resetInstance()
```

### Impersonation Flow (Future)

**Start impersonation:**
1. Call impersonation endpoint → get impersonation session token
2. Parse existing cookie → extract `s:${staffToken}`
3. Write new cookie: `s:${staffToken}+t:${impersonationToken}`
4. Call `ClientManager.resetInstance()`

**End impersonation:**
1. Parse existing cookie → extract `s:${staffToken}`
2. Write new cookie: `s:${staffToken}` (remove `+t:...` part)
3. Call `ClientManager.resetInstance()`

### Server-Side Updates

**File:** `apps/front/app/lib/react-router/server-data.server.ts`

```typescript
import { parseSessionCookie } from '../cookies/session-cookie.utils';

// In getServerLoader/getServerAction:
const reqCookies = cookie.parse(args.request.headers.get('Cookie') || '');
const rawSessionCookie = reqCookies[SESSION_TOKEN_COOKIE_KEY] as string | undefined;
const sessionTokens = rawSessionCookie ? parseSessionCookie(rawSessionCookie) : {};

return params.loader({
  ...args,
  staffToken: sessionTokens.staffToken,
  tenantToken: sessionTokens.tenantToken,
  z,
  locale,
});
```

### Singleton Reset Call Sites

Call `ClientManager.resetInstance()` after:
- Login cookie is set
- Cookie prefix is updated (staff/tenant determination)
- Impersonation starts (cookie gains `+t:` part)
- Impersonation ends (cookie loses `+t:` part)
- In `logout()` function

### Files to Modify

| File | Changes |
|------|---------|
| `apps/front/app/lib/cookies/session-cookie.utils.ts` | Add parse/format functions |
| `apps/front/app/lib/js-client/client-manager.ts` | Dual token support, context flag, resetInstance |
| `apps/front/app/lib/react-router/server-data.server.ts` | Parse dual tokens, pass both to loaders |
| `apps/front/app/routes/auth/login/login-page.tsx` | Cookie format updates |
| `apps/front/app/routes/auth/accept-invitation/accept-invitation-page.tsx` | Write with `t:` prefix |

### Notes

- **No backend changes required** - Staff status available via existing `/auth/tenant-auth-data?tenantId=staff`
- **React Query cache** - Keep shared cache; query keys already include tenant-specific identifiers
- **Logout** - Clearing cookie clears both tokens (no changes needed)
