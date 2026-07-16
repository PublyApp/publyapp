# Invite Drawer Origin Invariance (Users vs Invitations)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> I'm using the writing-plans skill to create the implementation plan.

**Goal:** Keep the invite drawer route-local to Users and Invitations, with both tabs using `?invite=1`, while preserving route filters/search/sort on open, close, discard, and successful submit.

**Architecture:** Introduce a route-neutral `InviteTenantUserDrawerHost` (`_invite-user-drawer-host.tsx`) that owns dirty-state, blocker bypass state, `useBlocker`, and the discard confirmation dialog. Keep `_invite-user-drawer.tsx` focused on form submit/invalidation/error paths. Extract `_invite-user-search-state.ts` parser/serializer and compose it in both routes.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Vitest, Playwright, TypeScript.

---

### Task 1: Create reusable invite search-state parser/serializer

**Files:**
- Create: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-search-state.ts`

- [ ] **Step 1: Add parser utility file**
```ts
export type InviteUserSearchState = {
	invite?: 1;
};

export type InviteUserSearchStateInput = {
	invite?: unknown;
};

const normalizeInviteFlag = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export const parseInviteUserSearchFlag = (
	value: unknown,
): 1 | undefined => (value === 1 || normalizeInviteFlag(value) === '1' ? 1 : undefined);

export const parseInviteUserSearchParams = (
	search: InviteUserSearchStateInput,
): InviteUserSearchState => ({
	invite: parseInviteUserSearchFlag(search?.invite),
});

export const serializeInviteUserSearchParams = (
	params: InviteUserSearchState,
): Record<string, string | 1 | undefined> => ({
	invite: parseInviteUserSearchFlag(params.invite),
});
```

- [ ] **Step 2: Add helper tests**
```ts
import { describe, expect, test } from 'vitest';
import {
	parseInviteUserSearchFlag,
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
} from './_invite-user-search-state';

describe('parseInviteUserSearchFlag', () => {
	test('parses numeric/string truthy input and ignores invalid values', () => {
		expect(parseInviteUserSearchFlag(1)).toBe(1);
		expect(parseInviteUserSearchFlag('1')).toBe(1);
		expect(parseInviteUserSearchFlag(' 1 ')).toBe(1);
		expect(parseInviteUserSearchFlag('true')).toBeUndefined();
		expect(parseInviteUserSearchFlag(undefined)).toBeUndefined();
	});
});

describe('invite-user search parse/serialize', () => {
	test('round-trips and canonicalizes search', () => {
		expect(parseInviteUserSearchParams({ invite: '1' })).toEqual({ invite: 1 });
		expect(
			serializeInviteUserSearchParams({ invite: parseInviteUserSearchFlag('1') }),
		).toEqual({ invite: 1 });
		expect(serializeInviteUserSearchParams({ invite: undefined })).toEqual({
			invite: undefined,
		});
	});
});
```

- [ ] **Step 3: Add helper test execution (RED)**
```bash
cd apps/front-2 && pnpm vitest run src/routes/authed/staff/tenants/\$tenantId/_invite-user-search-state.test.ts
```

- [ ] **Step 4: Verify helper tests pass (GREEN)**
```bash
cd apps/front-2 && pnpm vitest run src/routes/authed/staff/tenants/\$tenantId/_invite-user-search-state.test.ts
```

### Task 2: Create route-neutral invite drawer host

**Files:**
- Create: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer-host.tsx`
- Update: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx`

- [ ] **Step 1: Add host component with blocker orchestration**
```ts
import { useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { InviteTenantUserDrawer } from './_invite-user-drawer';

export const InviteTenantUserDrawerHost = ({
	tenantId,
	isOpen,
	onOpenChange,
	onInvited,
	onSessionExpired,
}: {
	tenantId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onInvited: () => void;
	onSessionExpired: () => void;
}) => {
	const [isInviteFormDirty, setIsInviteFormDirty] = useState(false);
	const inviteDrawerNavBypassRef = useRef(false);
	const inviteDrawerBlocker = useBlocker({
		shouldBlockFn: () =>
			isOpen && isInviteFormDirty && !inviteDrawerNavBypassRef.current,
		withResolver: true,
	});

	const setInviteDrawerOpen = (nextOpen: boolean): void => {
		inviteDrawerNavBypassRef.current = !nextOpen;
		onOpenChange(nextOpen);
	};

	const handleInvited = () => {
		setInviteDrawerOpen(false);
		onInvited();
	};

	return (
		<>
			<InviteTenantUserDrawer
				tenantId={tenantId}
				isOpen={isOpen}
				onOpenChange={setInviteDrawerOpen}
				onInvited={handleInvited}
				onSessionExpired={onSessionExpired}
				onDirtyChange={setIsInviteFormDirty}
			/>
			<ConfirmDialog
				isOpen={inviteDrawerBlocker.status === 'blocked'}
				title="unsaved-changes-dialog-title"
				description="unsaved-changes-dialog-description"
				confirmLabel="leave-page"
				tone="danger"
				onConfirm={() => inviteDrawerBlocker.proceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						inviteDrawerBlocker.reset?.();
					}
				}}
			/>
		</>
	);
};
```

- [ ] **Step 2: Keep `_invite-user-drawer.tsx` focused on form + mutation boundary**
```ts
// Preserve submit, validation, server error, and invalidation behavior.
// Keep callback boundary shape exactly as:
// {
// 	tenantId,
// 	isOpen,
// 	onOpenChange,
// 	onInvited,
// 	onSessionExpired,
// 	onDirtyChange,
// }
// Remove any blocker-specific or route-specific navigation logic.
```

- [ ] **Step 3: Add host unit tests and run RED**
```bash
cat > apps/front-2/src/routes/authed/staff/tenants/\$tenantId/_invite-user-drawer-host.test.tsx
cd apps/front-2 && pnpm vitest run src/routes/authed/staff/tenants/\$tenantId/_invite-user-drawer-host.test.tsx
```

- [ ] **Step 4: Stabilize host tests with real boundary assertions**
```ts
it('does not block navigation when closed', () => {
	// isOpen=false, isDirty=true -> shouldBlockFn() === false
});

it('blocks only when open and dirty and confirms with Leave page', () => {
	// render host with isOpen=true and mocked blocker resolver
});

it('synchronously clears dirty tracking before route callback on success', () => {
	// onInvited must set open(false) before callback and avoid stale shouldBlockFn
});
```

- [ ] **Step 5: Re-run host test file until GREEN**
```bash
cd apps/front-2 && pnpm vitest run src/routes/authed/staff/tenants/\$tenantId/_invite-user-drawer-host.test.tsx
```

### Task 3: Refactor Users route to use shared host and search-state parser

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users.tsx`

- [ ] **Step 1: Compose invite search parse/serialize with helper**
```ts
import { parseInviteUserSearchParams, serializeInviteUserSearchParams } from './_invite-user-search-state';

export const parseTenantUsersListSearchParams = (search: TenantUsersListSearchParamInput): TenantUsersListSearchParams => {
	const base = parseTableSearchParams(search);
	const status = serializeTenantUserStatusFilter(parseTenantUserStatusFilter(search.status));
	const level = serializeTenantUserLevelFilter(parseTenantUserLevelFilter(search.level));
	const invite = parseInviteUserSearchParams(search);
	return { ...base, status, level, ...invite };
};

export const serializeTenantUsersListSearchParams = (params: TenantUsersListSearchParams): Record<string, string | 1 | undefined> => {
	const next = serializeTableSearchParams(params);
	const status = serializeTenantUserStatusFilter(parseTenantUserStatusFilter(params.status));
	const level = serializeTenantUserLevelFilter(parseTenantUserLevelFilter(params.level));
	return { ...next, status: status || undefined, level: level || undefined, ...serializeInviteUserSearchParams(params) };
};
```

- [ ] **Step 2: Replace route-local blocker and replace drawer render with host**
```ts
import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';

const setInviteDrawerOpen = (isOpen: boolean): void => {
	void navigate({
		search: serializeTenantUsersListSearchParams({
			...search,
			invite: isOpen ? 1 : undefined,
		}),
		replace: true,
	});
};

<InviteTenantUserDrawerHost
	tenantId={tenantId}
	isOpen={isInviteDrawerOpen}
	onOpenChange={setInviteDrawerOpen}
	onSessionExpired={() => setShouldLogout(true)}
	onInvited={() => setInviteDrawerOpen(false)}
/>
```

- [ ] **Step 3: Verify users route now keeps `invite=1` on open and removes only invite on success**
```ts
// users.test should assert search navigation includes invite only and retains existing status/level/sort/query keys for setInviteDrawerOpen(true/false).
```

- [ ] **Step 4: Run users route tests (RED then GREEN)**
```bash
cd apps/front-2 && pnpm vitest run src/routes/authed/staff/tenants/\$tenantId/users.test.tsx
```

### Task 4: Refactor Invitations route to own invite drawer state and host integration

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/invitations.tsx`

- [ ] **Step 1: Compose invitation search state with helper**
```ts
import { parseInviteUserSearchParams, serializeInviteUserSearchParams } from './_invite-user-search-state';

export type TenantInvitationsListSearchParams = InvitationListSearchParams & {
	invite?: 1;
};
export type TenantInvitationsListSearchParamInput = InvitationListSearchParamInput & {
	invite?: unknown;
};

export const parseTenantInvitationsListSearchParams = (search: TenantInvitationsListSearchParamInput): TenantInvitationsListSearchParams => ({
	...parseInvitationListSearchParams(search),
	...parseInviteUserSearchParams(search),
});

export const serializeTenantInvitationsListSearchParams = (params: TenantInvitationsListSearchParams): Record<string, string | 1 | undefined> => ({
	...serializeInvitationListSearchParams(params),
	...serializeInviteUserSearchParams(params),
});
```

- [ ] **Step 2: Render host, local open setter, and replace CTA links**
```ts
import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';

const isInviteDrawerOpen = search.invite === 1;
const setInviteDrawerOpen = (isOpen: boolean): void => {
	void navigate({
		search: serializeTenantInvitationsListSearchParams({
			...search,
			invite: isOpen ? 1 : undefined,
		}),
		replace: true,
	});
};

<Button type="button" onClick={() => setInviteDrawerOpen(true)}>{t('invite-people')}</Button>

<InviteTenantUserDrawerHost
	tenantId={tenantId}
	isOpen={isInviteDrawerOpen}
	onOpenChange={setInviteDrawerOpen}
	onSessionExpired={() => setShouldRedirectToLogout(true)}
	onInvited={() => setInviteDrawerOpen(false)}
/>
```

- [ ] **Step 3: Move existing invite CTA checks to button behavior**
```ts
// Assert route-local button click calls navigate with same-search + invite:1.
// Assert empty-state button does same.
// Assert search with invite=1 opens host and keeps invitations active.
```

- [ ] **Step 4: Run invitations route tests (RED then GREEN)**
```bash
cd apps/front-2 && pnpm vitest run src/routes/authed/staff/tenants/\$tenantId/invitations.test.tsx
```

### Task 5: Move blocker tests out of users route

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users.test.tsx`
- Add: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer-host.test.tsx`

- [ ] **Step 1: Remove route blocker tests from users.test.tsx**
```ts
// Remove:
// - the URL nav-guard tests around capturedShouldBlockFn
// - stale guard closure test for successful submit
// - blocked confirm dialog test
// Keep all non-blocker invite-open/close behavior assertions.
```

- [ ] **Step 2: Add blocker-focused assertions to host tests**
```ts
// Add tests for
// - shouldBlockFn false when closed
// - shouldBlockFn false when open + not dirty
// - shouldBlockFn true when open + dirty
// - close confirm path calls proceed
// - close path via pristine flow sets open false with no confirm
```

### Task 6: Keep legacy and deep-link invariants

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users-invite.test.tsx`
- Update: `apps/front-2/e2e/staff-tenant-details.spec.ts`

- [ ] **Step 1: Preserve legacy redirect contract in existing route and tests**
```ts
// /staff/tenants/$tenantId/users/invite redirects to /staff/tenants/$tenantId/users with invite=1
```

- [ ] **Step 2: Add direct deep-link test coverage for invitations-origin invite state**
```ts
// In invitations users/invitations tests, set mocks.search = { invite: 1 }
// assert drawer opens while active tab remains Invitations
// assert closing removes only invite and preserves q/status/sort state.
```

- [ ] **Step 3: Add/update e2e scenarios**
```ts
// Open from Users and keep same Users URL/search params after successful submit
// Open from Invitations and stay on Invitations route on close/success
// Legacy /users/invite still lands /users?invite=1 with drawer open
```

- [ ] **Step 4: Run targeted e2e spec**
```bash
cd apps/front-2 && pnpm playwright test e2e/staff-tenant-details.spec.ts
```

### Task 7: Verification sweep (focused)

**Commands:**

- [ ] **Step 1: Run all new/changed unit tests (RED→GREEN)**
```bash
cd apps/front-2 && pnpm vitest run src/routes/authed/staff/tenants/\$tenantId/{_invite-user-search-state.test.ts,_invite-user-drawer-host.test.tsx,_invite-user-drawer.test.tsx,users.test.tsx,invitations.test.tsx,users-invite.test.tsx}
```

- [ ] **Step 2: Run typecheck and changed-file lint checks**
```bash
cd apps/front-2 && pnpm tsc
cd apps/front-2 && pnpm oxlint src/routes/authed/staff/tenants/\$tenantId/{users.tsx,invitations.tsx,_invite-user-search-state.ts,_invite-user-drawer-host.tsx}
```

- [ ] **Step 3: Finish with diff and check status**
```bash
git status --short
git diff --stat
```

Plan complete and saved to `docs/superpowers/plans/2026-07-16-front-2-invite-drawer-origin.md`.

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution (required) - Execute tasks in this session without waiting, using this plan
