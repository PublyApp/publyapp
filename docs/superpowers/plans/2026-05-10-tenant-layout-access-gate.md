# Tenant Layout Access Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock tenant users out of the tenant dashboard shell when the URL tenant is suspended or inaccessible.

**Architecture:** Keep `AuthedLayout` as the session/user identity gate and make `TenantLayout` the tenant access gate. `TenantLayout` will run a suspense auth query against the existing `/auth/scope-auth-data` endpoint before constructing the dashboard shell, letting the existing authed error boundary render either `ViewTenantSuspended` or `View403`.

**Tech Stack:** React Router v7, React 19, TanStack Query through `react-query-kit`, generated Kiota TypeScript client, MUI dashboard layout.

---

## File Map

- Modify `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx`
  - Responsibility: run the tenant access check before rendering tenant chrome and before updating the tenant hint cookie.
- Modify `apps/front/src/lib/react-query/features/common/auth.hooks.ts`
  - Responsibility: expose a suspense query hook for `client.auth.scopeAuthData.get()`.

No backend files should change. The generated client already exposes `client.auth.scopeAuthData.get()`.

---

### Task 1: Wire `TenantLayout` To The New Access Gate

**Files:**
- Modify: `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx`
- Modify: `apps/front/src/lib/react-query/features/common/auth.hooks.ts`

- [ ] **Step 1: Write the compile-failing layout integration**

In `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx`, replace the existing auth hook import with:

```tsx
import {
	useGetScopeAuthData,
	useGetUserAuthData,
} from '#app/lib/react-query/features/common/auth.hooks.ts';
```

In the `TenantLayout` component, add the new suspense hook immediately after the `tenantId` param is read and before the tenant hint effect:

```tsx
const TenantLayout = () => {
	const { t } = useTranslate();
	const { tenantId = '' } = useParams();
	useGetScopeAuthData({ variables: { tenantId } });
	const { data: userAuthData } = useGetUserAuthData();
	const userId = userAuthData?.id;
```

This intentionally references a hook that does not exist yet, so type checking proves the layout is wired to the new contract.

- [ ] **Step 2: Run type checking to verify the expected failure**

Run:

```bash
just tsc-front
```

Expected: FAIL with a TypeScript error equivalent to:

```text
Module '"#app/lib/react-query/features/common/auth.hooks.ts"' has no exported member 'useGetScopeAuthData'.
```

- [ ] **Step 3: Add the suspense auth hook**

In `apps/front/src/lib/react-query/features/common/auth.hooks.ts`, add this export after `useGetUserAuthData`:

```ts
export const useGetScopeAuthData = createAuthSuspenseQuery({
	queryKeyFn: (client) => client.auth.scopeAuthData.get,
	fetcher: async (client, { tenantId }: { tenantId: string }) => {
		const result = await client.auth.scopeAuthData.get({
			queryParameters: {
				scope: tenantId,
			},
		});
		if (isNil(result)) {
			throw new Error('useGetScopeAuthData: result is nil');
		}
		return result;
	},
	retry: authRetry,
});
```

This hook uses the auth client because `/auth/scope-auth-data` is session-authenticated but not tenant-header scoped.

- [ ] **Step 4: Run type checking to verify the implementation**

Run:

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 5: Commit the tenant access gate**

Run:

```bash
git status --short
git add -- apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx apps/front/src/lib/react-query/features/common/auth.hooks.ts
git commit -m "fix(front): gate tenant layout by scope access"
```

Expected: commit succeeds with only the two frontend files included.

---

### Task 2: Smoke Test Tenant Access Outcomes

**Files:**
- Verify: `apps/front/src/routes/authed/_layout/authed-layout.tsx`
- Verify: `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx`
- Verify: `apps/front/src/lib/react-query/features/common/auth.hooks.ts`

- [ ] **Step 1: Confirm the existing error boundary still maps tenant suspension correctly**

Check `apps/front/src/routes/authed/_layout/authed-layout.tsx` still contains this branch:

```tsx
if (
	failure.status === 403 &&
	failure.translationKey === 'tenant-suspended'
) {
	return <ViewTenantSuspended />;
}
```

Expected: the branch exists unchanged before the generic `403` branch.

- [ ] **Step 2: Confirm the generic `403` branch remains the fallback**

Check `apps/front/src/routes/authed/_layout/authed-layout.tsx` still contains this branch after the tenant-suspended branch:

```tsx
if (failure.status === 403) {
	return <View403 />;
}
```

Expected: malformed, nonexistent, deleted, and foreign tenant IDs will render `View403` because `GetScopeAuthData` returns generic `403` for those cases.

- [ ] **Step 3: Start the normal local app stack**

Run the usual project commands in separate terminals:

```bash
just dev-db
just dev-api
just dev-front
```

Expected:

```text
Frontend is available at localhost:5050
API is available at localhost:5000
```

- [ ] **Step 4: Verify suspended tenant member behavior**

Manual browser smoke:

```text
1. Sign in as a staff user in Browser A.
2. Sign in as a tenant user in Browser B.
3. In Browser A, suspend the tenant used by Browser B.
4. In Browser B, hard reload /app/{tenantId}.
```

Expected: Browser B renders `ViewTenantSuspended` full-bleed, without the dashboard sidebar or topbar.

- [ ] **Step 5: Verify foreign and malformed tenant behavior**

Manual browser smoke as a tenant user:

```text
1. Open /app/{foreignTenantId}.
2. Open /app/00000000-0000-0000-0000-000000000000.
3. Open /app/not-a-uuid.
```

Expected: each URL renders generic `View403`, without the dashboard sidebar or topbar.

- [ ] **Step 6: Verify staff routes are unaffected**

Manual browser smoke as a staff user:

```text
1. Open /staff.
2. Open a staff tenant details route such as /staff/tenants/{tenantId}.
```

Expected: staff pages render normally and do not call `/auth/scope-auth-data`.

- [ ] **Step 7: Record verification outcome**

Add the manual verification results to issue #418 as a comment. No repo commit is needed
for this step.

```bash
gh issue comment 418 --body "Verified tenant access gate:
- suspended tenant member on /app/{tenantId}: ViewTenantSuspended, no dashboard chrome
- foreign tenant URL: View403, no dashboard chrome
- zero UUID tenant URL: View403, no dashboard chrome
- malformed tenant URL: View403, no dashboard chrome
- staff routes: still render normally"
```

Expected: the comment is added to issue #418.
