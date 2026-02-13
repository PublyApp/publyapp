# Frontend Architecture (React Router v7)

> Extracted from `AGENTS.md` — detailed frontend architecture patterns including API client integration and data fetching.

## API Client Integration

- Microsoft Kiota auto-generated client from OpenAPI
- Singleton `ClientManager` in `app/lib/js-client/`
- Session token from `X-Session-Token` header (read fresh from cookies on every request)
- Tenant ID from `X-PublyApp-TenantId` header (for multi-tenant data isolation)

## Getting API Clients

### 1. In React hooks

Use hook factories from `app/lib/react-query/create-hooks.ts`:
- `createTenantQuery/Mutation` - Tenant-scoped (tenantId required in variables)
- `createStaffQuery/Mutation` - Staff-only endpoints (no tenantId)
- `createAuthQuery/Mutation` - Auth endpoints (session token, no tenantId)
- `createPublicQuery/Mutation` - Anonymous/public endpoints (no auth)

### 2. Client-side (browser)

Outside React lifecycle (e.g., clientLoaders):
- `getClientManager().getOrCreateClient(tenantId)` - Tenant client with `X-PublyApp-TenantId`
- `getClientManager().getOrCreateStaffClient()` - Staff client (no tenant-id header)
- `getClientManager().getOrCreateAnonymousClient()` - Anonymous client (no auth, no tenant)
- `getClientManager().createClient({ tenantId?, skipAuth?, context? })` - Create ad-hoc client

### 3. Server-side (SSR)

In React Router loaders/actions:
- `getClientManager({ staffToken?, tenantToken? }).createClient({ tenantId?, context? })` - per-request instance
- Tokens are parsed by `getServerLoader` / `getServerAction` and passed to your loader/action

```typescript
import { getClientManager } from '@/front/lib/js-client/client-manager';
const apiClient = getClientManager({ staffToken, tenantToken }).createClient();
```

## Data Fetching Pattern (Route-Type Specific)

**CRITICAL:** Data fetching strategy depends on route type:

1. **Marketing Pages** (`app/routes/marketing/**`) -> SSR with React Router loaders/actions
2. **Auth Pages** (`app/routes/auth/**`) -> SSR with React Router loaders/actions (hide API endpoints)
3. **Authed Pages** (`app/routes/authed/**`) -> Client-only for application data with TanStack Query (no SSR data fetching)

**Allowed exception for authed pages:** You may use `loader` only for fast, non-sensitive metadata (e.g. page title/meta tags) to avoid client-side flicker. Never fetch real application data in an authed page `loader`.

```tsx
// ❌ WRONG - Fetching application data in a server loader (authed routes)
// File: app/routes/authed/staff/members-page.tsx
export const loader = async ({ apiClient }) => {
  const data = await apiClient.staff.staffUsers.get();
  return { data };
};

// ✅ CORRECT - Use hook factories for authenticated pages
// Step 1: Define hook in app/lib/react-query/features/staff/staff-user.hooks.ts
import { createStaffQuery } from '../../create-hooks';

export const useFindStaffUser = createStaffQuery({
  queryKeyFn: (client) => client.staff.staffUsers.get,
  fetcher: async (client, params: { page?: number }) => {
    const result = await client.staff.staffUsers.get({
      queryParameters: { page: params.page?.toString() },
    });
    if (_.isNil(result)) throw new Error('useFindStaffUser: result is nil');
    return result;
  },
});

// Step 2: Use hook in component
// File: app/routes/authed/staff/members-page.tsx
import { useFindStaffUser } from '@/front/lib/react-query/features/staff/staff-user.hooks';

function StaffUsersPage() {
  const { data, isLoading } = useFindStaffUser({ variables: { page: 1 } });
  return <div>{/* render */}</div>;
}

// ✅ CORRECT - Server loader for auth pages (hide endpoints)
// File: app/routes/auth/login/login-page.tsx
export const loader = getServerLoader({
  loader: async ({ apiClient }) => {
    // Pre-fetch data server-side
    return data({ ... });
  }
});

// ✅ CORRECT - Mutations in authed pages use hook factories
// Step 1: Define mutation hook
import { createStaffMutation } from '../../create-hooks';

export const useCreateMember = createStaffMutation({
  mutationKeyFn: (client) => client.staff.members.post,
  mutationFn: async (client, data: { email: string }) => {
    const result = await client.staff.members.post({
      email: { getValue() { return data.email; } },
    });
    if (_.isNil(result)) throw new Error('useCreateMember: result is nil');
    return result;
  },
});

// Step 2: Use in component
function CreateMemberDialog() {
  const { mutate } = useCreateMember({
    onSuccess: () => queryClient.invalidateQueries(['staff.members.get'])
  });
}
```

**Why different strategies:**
- **Marketing/Auth pages:** SSR for SEO and security (hide API endpoints)
- **Authed pages:** Client-only for better UX, real-time updates, no SEO needed
- Authed layout wrapped in `<ClientOnly>` component

## Optimized Data Fetching (Optional)

For authed pages where you want to optimize initial load time, use `getClientLoader` with react-query-kit prefetching:

```tsx
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { QueryClient } from '@tanstack/react-query';

// ✅ CORRECT - Use getClientLoader wrapper
export const clientLoader = getClientLoader({
  loader: async ({ apiClient, z, locale }) => {
    const queryClient = new QueryClient();

    // Prefetch using react-query-kit hooks
    await queryClient.prefetchQuery({
      queryKey: useFindStaffUser.getKey({ page: 1 }),
      queryFn: () => useFindStaffUser.fetcher({ page: 1 }),
    });

    return null;
  },
});

// ❌ WRONG - Don't export raw clientLoader
export async function clientLoader() { ... }
```

**Benefits:** `getClientLoader` provides initialized `apiClient`, `z` (Zod with i18n), and `locale` - just like `getServerLoader` on the server.
