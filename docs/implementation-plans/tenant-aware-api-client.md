# Plan: Tenant-Aware API Client Implementation

**Status: IMPLEMENTED** (2026-01-04)

All phases have been completed. See PR #159 for the full implementation.

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

### Existing Changes (Already Implemented)

The following refactoring has already been done to the ClientManager:

```typescript
class ClientManager {
  private static _instance: ClientManager;
  private static _anonymousClient: ApiClient;
  private _clientsStore: Map<string, ApiClient> = new Map();
  public clientsStore: Map<string, ApiClient>;

  // Get or create a client for a specific tenant
  public getOrCreateClient(tenantId: string, sessionToken?: string) { ... }

  // Staff client (keyed as 'staff')
  public getStaffClient(sessionToken?: string) {
    return this.getOrCreateClient('staff', sessionToken);
  }

  // Client management
  public setClient(tenantId: string, client: ApiClient) { ... }
  public removeClient(tenantId: string) { ... }
  public clearClients() { ... }

  // Create client with options
  public createClientWithOptions(options: { sessionToken?: string, tenantId?: string }) { ... }

  // Server-side protection via Proxy (prevents memory leaks)
  private constructor() {
    if (isServer) {
      this.clientsStore = new Proxy(this._clientsStore, {
        get: () => { throw new Error('Cannot use clientsStore on server'); }
      });
    } else {
      this.clientsStore = this._clientsStore;
    }
  }
}
```

### Key Insight: Read Session Token Fresh on Every Request

Instead of baking the session token into `ApiKeyAuthenticationProvider`, we inject it fresh in `customFetch`. This makes clients stateless regarding auth - they only care about which tenant to target.

### Changes:

1. **Refactor `createClientWithOptions` - inject session token in customFetch:**
   ```typescript
   public createClientWithOptions(options: { tenantId?: string; skipAuth?: boolean }) {
     const customFetch = (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
       // Read session token FRESH on every request (unless skipAuth)
       const sessionToken = options.skipAuth ? undefined : getSessionCookieFromClient();

       return fetch(url, {
         ...init,
         headers: {
           ...init?.headers,
           ...(sessionToken ? { [SESSION_TOKEN_HEADER_KEY]: sessionToken } : {}),
           ...(options.tenantId ? { [TENANT_ID_HEADER_KEY]: options.tenantId } : {}),
         },
       });
     };

     // Always use anonymous - auth handled in customFetch
     const authProvider = new AnonymousAuthenticationProvider();
     const httpClient = KiotaClientFactory.create(customFetch);
     const adapter = new FetchRequestAdapter(authProvider, undefined, undefined, httpClient);
     adapter.baseUrl = env.VITE_ASP_SERVER_URL;
     return createApiClient(adapter);
   }
   ```

   **Update constructor to use skipAuth for anonymous client:**
   ```typescript
   private constructor() {
     // Anonymous client explicitly skips auth
     ClientManager._anonymousClient = this.createClientWithOptions({ skipAuth: true });
     // ...
   }
   ```

2. **Simplify `getOrCreateClient` - no sessionToken parameter needed:**
   ```typescript
   public getOrCreateClient(tenantId: string) {
     if (isServer) {
       throw new Error('Cannot use getOrCreateClient on server');
     }

     let client = this.clientsStore.get(tenantId);

     if (!client) {
       client = this.createClientWithOptions({ tenantId });
       this.clientsStore.set(tenantId, client);
     }

     return client;
   }
   ```

3. **Simplify `getStaffClient` - no sessionToken parameter:**
   ```typescript
   public getStaffClient() {
     return this.getOrCreateClient('staff');
   }
   ```

4. **Remove commented-out `apiClient` getter** - Clean up dead code

### Benefits of This Approach:
- **No `_tokenStore` needed** - token read fresh, not baked in
- **Key by `tenantId` only** - simpler caching
- **Token changes handled automatically** - no stale token issues
- **Consistent pattern** - both session token and tenant-id in customFetch
- **`skipAuth` flag** - for anonymous/public endpoints that shouldn't include session token

### Client Types Summary:
| Client | tenantId | skipAuth | Session Token |
|--------|----------|----------|---------------|
| `getOrCreateClient(tenantId)` | ✓ | ✗ | Fresh from cookie |
| `getStaffClient()` | ✗ | ✗ | Fresh from cookie |
| `anonymousClient` | ✗ | ✓ | Never included |

---

## Phase 2: Create Hook Factories with Embedded Middleware

**New File:** `apps/front/app/lib/react-query/create-hooks.ts`

Create factory functions that use react-query-kit middleware internally to:
- Inject session token from cookies
- Create the appropriate client (tenant/staff/anonymous)
- Wrap the user's fetcher with client injection

### Factory Implementation Pattern:

```typescript
import { createQuery, createMutation, type Middleware, type QueryHook } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import { getSessionCookieFromClient } from '@/front/lib/cookies';
import type { ApiClient } from '@/js-client/src/apiClient';
import { getQueryKey } from './query-utils';

// Type for tenant-scoped variables
type WithTenantId<T> = T & { tenantId: string };

// Middleware that wraps fetcher to inject tenant client
function createTenantClientMiddleware<TData, TVariables>(): Middleware<QueryHook<TData, WithTenantId<TVariables>>> {
  return (useQueryNext) => (options) => {
    const wrappedFetcher = async (variables: WithTenantId<TVariables>, context: any) => {
      const { tenantId, ...rest } = variables;
      const client = clientManager.getOrCreateClient(tenantId);  // No sessionToken needed!
      // Call original fetcher with client injected
      return (options as any)._originalFetcher(client, rest as TVariables);
    };
    return useQueryNext({ ...options, fetcher: wrappedFetcher });
  };
}

// Middleware for staff client (no tenantId)
function createStaffClientMiddleware<TData, TVariables>(): Middleware<QueryHook<TData, TVariables>> {
  return (useQueryNext) => (options) => {
    const wrappedFetcher = async (variables: TVariables, context: any) => {
      const client = clientManager.getStaffClient();  // No sessionToken needed!
      return (options as any)._originalFetcher(client, variables);
    };
    return useQueryNext({ ...options, fetcher: wrappedFetcher });
  };
}

// Factory: Tenant-scoped queries (tenantId REQUIRED)
export function createTenantQuery<TData, TVariables>(config: {
  queryKeyFn: (client: ApiClient) => unknown;
  fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
}) {
  const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

  return createQuery<TData, WithTenantId<TVariables>>({
    queryKey: [queryKey] as const,
    fetcher: () => Promise.reject('Should be wrapped by middleware'),
    use: [createTenantClientMiddleware<TData, TVariables>()],
    // Store original fetcher for middleware to use
    _originalFetcher: config.fetcher,
  } as any);
}

// Factory: Staff queries (no tenantId)
export function createStaffQuery<TData, TVariables>(config: {
  queryKeyFn: (client: ApiClient) => unknown;
  fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
}) {
  const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

  return createQuery<TData, TVariables>({
    queryKey: [queryKey] as const,
    fetcher: () => Promise.reject('Should be wrapped by middleware'),
    use: [createStaffClientMiddleware<TData, TVariables>()],
    _originalFetcher: config.fetcher,
  } as any);
}

// Factory: Anonymous/public queries
export function createPublicQuery<TData, TVariables>(config: {
  queryKeyFn: (client: ApiClient) => unknown;
  fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
}) {
  const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

  return createQuery<TData, TVariables>({
    queryKey: [queryKey] as const,
    fetcher: async (variables) => {
      return config.fetcher(clientManager.anonymousClient, variables);
    },
  });
}

// Similar factories for mutations: createTenantMutation, createStaffMutation
```

### Key Design Points:
- **Middleware inside factories** - Each factory uses its own middleware via `use: [...]`
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
import { clientManager } from '@/front/lib/js-client/client-manager';

export const logout = (options?: LogoutOptions): void => {
  clearSessionCookie();
  defaultQueryClient.removeQueries();

  // Clear API clients (they have session tokens baked in)
  clientManager.clearClients();

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

**File:** `apps/front/app/lib/api.ts`

Remove `initApiClientOnClient` entirely. Update callers:

| Caller | Current Usage | New Pattern |
|--------|---------------|-------------|
| `entry.client.tsx` | `initApiClientOnClient()` | Remove call (not needed) |
| `authed-layout.tsx` | `initApiClientOnClient()` | Remove call (not needed) |
| `client-data.ts` | `initApiClientOnClient()` | Use `clientManager.getOrCreateClient()` directly |

**New pattern for accessing client outside React hooks (e.g., in router loaders):**

```typescript
// In getClientLoader or any non-React context
import { clientManager } from '@/front/lib/js-client/client-manager';

export const clientLoader = getClientLoader({
  loader: async ({ params }) => {
    const tenantId = params.tenantId!;

    // For tenant-scoped operations:
    const client = clientManager.getOrCreateClient(tenantId);

    // For staff operations:
    const staffClient = clientManager.getStaffClient();

    // For anonymous operations:
    const anonClient = clientManager.anonymousClient;

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
- `hook.fetcher(variables)` - Call the fetcher directly (middleware will inject client)
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
   - `clientManager.apiClient` → `clientManager.getOrCreateClient(tenantId)` or `clientManager.getStaffClient()`
   - `clientManager.setApiClient()` → Remove references

2. **Old hook patterns:**
   - Direct `clientManager.apiClient` usage → Use factories
   - Missing tenantId in tenant-scoped hooks → Add tenantId parameter

3. **Old client creation:**
   - `createApiClient(sessionToken)` → `getOrCreateClient(tenantId)` or `getStaffClient()`
   - `ApiKeyAuthenticationProvider` usage → Note we now use `AnonymousAuthenticationProvider` with fresh token in customFetch

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
   import { clientManager } from '@/front/lib/js-client/client-manager';

   // Tenant client (with tenant-id header)
   const client = clientManager.getOrCreateClient(tenantId);

   // Staff client (no tenant-id header)
   const staffClient = clientManager.getStaffClient();

   // Anonymous client (no auth, no tenant)
   const anonClient = clientManager.anonymousClient;

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
| `apps/front/app/lib/js-client/client-manager.ts` | Inject session token in customFetch, simplify API |
| `apps/front/app/lib/react-query/create-hooks.ts` | **NEW** - Hook factories with embedded middleware |
| `apps/front/app/lib/cookies/logout.utils.ts` | Add `clientManager.clearClients()` |
| `apps/front/app/lib/api.ts` | Remove `initApiClientOnClient` |
| `apps/front/app/entry.client.tsx` | Remove `initApiClientOnClient()` call |
| `apps/front/app/routes/authed/_layout/authed-layout.tsx` | Remove `initApiClientOnClient()` call |
| `apps/front/app/lib/react-router/client-data.ts` | Use `clientManager.getOrCreateClient()` directly |
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
