# Preload in loaders (#2340) Implementation Plan

> **For agentic workers:** execute task by task. One task = one dispatch, one commit, one fresh review.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every authenticated route whose page renders query data warms that data on hover through a
client `loader` that never blocks navigation, and CI fails when a page query is not warmed (or when a
loader warms a key the page never uses).

**Spec:** `docs/records/2026-11-08-spec-query-display-and-preload.md` — §4.2, §5, §6 item 2, §7.1–7.5,
§7.10, §8, §9. This plan covers PR 2 (#2340) only; #2341 (`QueryDisplay` everywhere) is merged at
`72298bda2`.

**Architecture:** one shared helper in `apps/front/src/lib/query/route-preload.ts` warms a route's
query-options factories fire-and-forget (skipping any query a mounted page already observes, and
carrying each factory's `staleTime` only when it declares one, so the QueryClient default applies
otherwise). Each covered route declares its queries once in a query spec
`({ …params, search }) => ({ name: { options, variables } })`, used by both the loader and the page
components, so variables cannot drift. `defaultPreloadStaleTime: 0` hands freshness to TanStack Query.
The loader guard is extended from "loader keys ⊆ page keys" to both directions, over the route's real
import graph, with a reasoned `preload-exempt` escape.

**Tech stack:** React 19, TanStack Router 1.170.46 (`defaultPreload: 'intent'`), TanStack Query 5.105.1,
Vitest + Testing Library, `ts-morph` (static guard).

## Measurements (2026-11-09, branch tip `72298bda2`)

Method: for each `apps/front/src/routes/**` file declaring `createFileRoute`, the page graph is the
route file plus its relative imports under `routes/`, transitively, stopping at any imported file that
itself declares `createFileRoute` (a child route) and at every non-relative import
(`~/components/**`, `~/lib/**`, `@org/**`). Query call sites are `use[A-Z][A-Za-z0-9]*Query(`, the
bare `useQuery(`, `useSuspenseQuery(` and `useInfiniteQuery(` calls, **and any called `lib/**`
binding whose body — directly, through a same-module local call, or through another imported `lib/**`
hook — reaches `useQuery` / `useInfiniteQuery`, whatever its name.** The `lib/**` scope (not only
`lib/query`) is what makes `useCanManageSocialAccounts` (`lib/permissions/use-has-tenant-permission.ts:42`
→ `useQuery` `:45`) visible in the shell banner and on `settings/integrations.tsx:232` (round 3). The
first pass matched only the named-hook form and missed
`routes/authed/staff/jobs/_permissions.ts:52` (rows 9/11); the second missed the three wrappers
`useTenantPermissions` (`lib/query/tenant-permissions.ts:87`), `useTenantSurfacePermissions`
(`lib/query/scope-auth-data.ts:71`) and `useResolvedWorkspaceTenantId`
(`lib/query/tenants-for-picker.ts:86`) — the C1 hole, now rows 36/38/39 and section D.

### A. Authenticated routes whose page graph renders query data — **44 routes**

| # | Route file | Page queries | Loader today |
|---|---|---|---|
| 1 | `authed/staff/audit-logs/$logId.tsx` | `useStaffAuditLogDetailsQuery` | no |
| 2 | `authed/staff/audit-logs.tsx` | `useAuditLogActionsQuery`, `useStaffAuditLogsQuery` (+ `_staff-list-team.tsx` page/counter observers, **exempt**) | no |
| 3 | `authed/staff/dashboard/activity.tsx` | `useAuditLogActionsQuery`, `useStaffAuditLogsQuery`, `useStaffTenantsQuery` | no |
| 4 | `authed/staff/dashboard/index.tsx` | `useStaffAuditLogsQuery`, `useStaffDashboardSeriesQuery` (3 call sites), `useStaffInvitationsQuery` (2), `useStaffTenantsQuery` (2) | no |
| 5 | `authed/staff/dashboard/reports.tsx` | `useStaffAuditLogsQuery` (2), `useStaffDashboardSeriesQuery` (2), `useStaffDashboardTopOrganisationsQuery` | no |
| 6 | `authed/staff/invitations/$invitationId.tsx` | `useStaffInvitationDetailsQuery` | no |
| 7 | `authed/staff/invitations/index.tsx` | `useStaffInvitationsQuery` (+ `_staff-list-team.tsx` page/counter observers, **exempt**) | no |
| 8 | `authed/staff/invitations/new.tsx` | `useStaffRolesQuery` | no |
| 9 | `authed/staff/jobs/dead-letter.tsx` | `useStaffDeadLettersQuery`, `useStaffJobQueueQuery`, `useStaffSystemJobDefinitionsQuery`, `useStaffJobPermissions` (`_permissions.ts:52`, bare `useQuery`), `useStaffDeadLetterDetailQuery` (**exempt**) | no |
| 10 | `authed/staff/jobs/queue.tsx` | `useStaffDeadLettersQuery`, `useStaffJobQueueQuery`, `useStaffSystemJobDefinitionsQuery` | no |
| 11 | `authed/staff/jobs/system-jobs.tsx` | same three as #10 + `useStaffJobPermissions` (`_permissions.ts:52`) | no |
| 12 | `authed/staff/roles/$roleId.tsx` | `useStaffPermissionCatalogQuery`, `useStaffRoleDetailsQuery`, `useStaffRolePermissionKeysQuery`, `useStaffRoleUsersQuery` | no |
| 13 | `authed/staff/roles/$roleId/users.tsx` | `useStaffRoleDetailsQuery`, `useStaffRoleUsersQuery` (+ `_staff-list-team.tsx` page/counter observers, **exempt**) | no |
| 14 | `authed/staff/roles-new.tsx` | `useStaffPermissionCatalogQuery` | no |
| 15 | `authed/staff/roles.tsx` | `useStaffRolesQuery` (+ `_staff-list-team.tsx` counts, **exempt**) | no |
| 16 | `authed/staff/staff-users/$userId-edit.tsx` | `useStaffRolesQuery`, `useStaffUserDetailsQuery`, `useStaffUserRolesQuery` | no |
| 17 | `authed/staff/staff-users/$userId.tsx` | `useStaffUserDetailsQuery`, `useStaffUserRolesQuery` | no |
| 18 | `authed/staff/staff-users.tsx` | `useStaffUsersQuery` (+ `_staff-list-team.tsx` counts, **exempt**) | no |
| 19 | `authed/staff/tenants/$tenantId/activity.tsx` | `useStaffTenantDetailsQuery`, `useTenantActivityQuery` | no |
| 20 | `authed/staff/tenants/$tenantId-edit.tsx` | `useStaffTenantDetailsQuery` | no |
| 21 | `authed/staff/tenants/$tenantId/invitations.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantInvitationsQuery`, `useStaffTenantRolesQuery` | no |
| 22 | `authed/staff/tenants/$tenantId/roles/$roleId/members.tsx` | `useStaffTenantRoleMembersQuery`, `useStaffTenantUsersQuery`, `useStaffTenantRoleMemberAssignmentResolutionQuery` (**exempt**) | no |
| 23 | `authed/staff/tenants/$tenantId/roles/$roleId.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantPermissionCatalogQuery`, `useStaffTenantRoleDetailsQuery`, `useStaffTenantRoleMembersQuery`, `useStaffTenantRolePermissionKeysQuery` | **yes** — awaits 2 of the 5 |
| 24 | `authed/staff/tenants/$tenantId/roles/$roleId/users.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantRoleDetailsQuery`, `useStaffTenantRoleMembersQuery`, `useStaffTenantUsersQuery`, `useStaffTenantRoleMemberAssignmentResolutionQuery` (**exempt**) | no |
| 25 | `authed/staff/tenants/$tenantId/roles.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantPermissionCatalogQuery`, `useStaffTenantRolesQuery` | no |
| 26 | `authed/staff/tenants/$tenantId.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantUsersQuery` | no |
| 27 | `authed/staff/tenants/$tenantId/usage.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantUsageQuery` | no |
| 28 | `authed/staff/tenants/$tenantId/users/$userId-edit.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantUserDetailsQuery` | no |
| 29 | `authed/staff/tenants/$tenantId/users/$userId.tsx` | same two as #28 | no |
| 30 | `authed/staff/tenants/$tenantId/users.tsx` | `useStaffTenantDetailsQuery`, `useStaffTenantRolesQuery`, `useStaffTenantUsersQuery` | no |
| 31 | `authed/staff/tenants.tsx` | `useStaffTenantsQuery` | no |
| 32 | `authed/staff/tenant-users/$userId-general.tsx` | `useGlobalTenantUserDetailsQuery` | no |
| 33 | `authed/staff/tenant-users/$userId-organizations.tsx` | `useGlobalTenantUserCompaniesQuery`, `useGlobalTenantUserDetailsQuery`, `useGlobalTenantUsersPickerQuery` (**exempt**) | no |
| 34 | `authed/tenant/account/profile.tsx` | `useAccountProfileQuery` | no |
| 35 | `authed/tenant/organizations.tsx` | `useTenantsForPickerQuery` | no |
| 36 | `authed/tenant/posts/$postId/edit.tsx` | `useScheduledPublicationsInfiniteQuery`, `useTenantPostDetailsQuery`, `useTenantProjectsQuery`, `useTenantPublishTargetsQuery`, `useTenantPermissions` (C1), `useTenantPublicationRenditionQuery` (**exempt**) | no |
| 37 | `authed/tenant/posts/calendar.tsx` | `useScheduledPublicationsInfiniteQuery` | no |
| 38 | `authed/tenant/posts/drafts.tsx` | `useTenantPostsQuery`, `useTenantProjectsQuery`, `useTenantPublishTargetsQuery`, `useTenantPermissions` (C1, via `_create-post-drawer.tsx → _publish-on-block.tsx`) | no |
| 39 | `authed/tenant/posts/history.tsx` | `useTenantPublicationsQuery`, `useTenantPermissions` (C1, `:53`) | no |
| 40 | `authed/tenant/posts/queue.tsx` | `useScheduledPublicationsQuery` | no |
| 41 | `authed/tenant/settings/general.tsx` | `useTenantSettingsGeneralQuery` | no |
| 42 | `authed/tenant/settings/integrations.tsx` | `useNeedsReconnectAccountsQuery`, `useSocialAccountsQuery`, `useTenantProjectsQuery`, `useCanManageSocialAccounts` (→ `lib/permissions` `useQuery`, **exempt** — no factory) | no |
| 43 | `authed/tenant/settings/workspaces.tsx` | `useTenantsForPickerQuery` | no |
| 44 | `authed/tenant.tsx` (layout) | `useTenantsForPickerQuery` | no |

**The shell picker (C1):** rows 34, 36–42 also mount the workspace picker through
`useResolvedWorkspaceTenantId` (`lib/query/tenants-for-picker.ts:86` → `useTenantsForPickerQuery`). The
call-site method above does not match that name, but under the widened guard rule it is a page key
(`factory lib/query/tenants-for-picker#tenantsForPickerQueryOptions`). Those eight specs therefore
declare it (Tasks 8/9) — the app shell already observes it on every authed page, so the helper's
observer skip (decision 5) makes the entry a zero-request declaration. Rows 35/43/44 call
`useTenantsForPickerQuery` directly and warm it through their own spec.

**The shell banner (round 3, M1):** `components/app-shell/_needs-reconnect-banner.tsx` is rendered by
`app-shell.tsx:41/494-495` on every tenant surface and calls `useSocialAccountsQuery` (`:17`) and
`useCanManageSocialAccounts` (`:18` → `lib/permissions` `useTenantScopedAuthDataQuery` → `useQuery`).
It belongs to the layout's page graph (section D), not to a leaf route — it is reached only through a
non-relative import — and both calls are exempt: the layout has no loader (captain's call 8). The
`useSocialAccountsQuery` factory *is* warmed by the Integrations page's own spec (Task 8), so the
banner's data is in cache on that route; every other tenant route relies on the shell mount. The other
widgets `app-shell.tsx` renders (`ThemeToggle`, `neutral-authed-shell.tsx`) reach no query hook, and
`user-menu.tsx` is already section D — the banner is the only missed render.

Out of scope (§7.1): `accept-invitation.tsx` (anonymous, `useCurrentUserQuery`, keeps its server loader).
Routes under `authed/` whose graph renders no query data (e.g. `$tenantId/roles/$roleId/index.tsx`,
`…/permissions.tsx`, `authed/staff.tsx`, `authed/tenant/settings.tsx`) get no loader. The child index
routes that render a parent's data (`$roleId/index.tsx`, `$roleId/permissions.tsx`, `$userId/index.tsx`)
are warmed by the parent loader on hover — same chain, no loader of their own.

### D. App shell — the `/_authed-layout` route and its widgets (§7.2)

These mount in the authed shell, are reached only through **non-relative** imports, and therefore land
in no leaf route's page graph. They are the layout route's page graph, not a page's:

| file:line | query | mechanism |
|---|---|---|
| `components/app-shell/user-menu.tsx:43` | `useCurrentUserQuery()` | `preload-exempt` — session-stable (`staleTime: Infinity`), fetched once when the shell mounts; a preload would only re-fetch it after the default stale time |
| `lib/navigation/entity-crumb.tsx:38` | `useQuery({ queryKey: [...queryKey], … })` (dynamic key from the route's `*CrumbQuery`) | `preload-exempt` — its key **is** the page's own `*DetailsQueryOptions` factory (`staffTenantCrumbQuery` → `staffTenantDetailsQueryOptions.queryKey`, …), warmed by that page's loader; the widget cannot know the route's factories at hover |
| `routes/__root.tsx:604` | `useQuery(surfaceRedirectCodeQueryKey)` | `preload-exempt` — root session gate: decides whether the authed chrome renders at all; a hover must not run session validation (PR #997) |
| `components/app-shell/app-shell.tsx:186` | `useResolvedWorkspaceTenantId({ enabled })` → the picker factory | `preload-exempt` — the shell's workspace resolver: the picker query is mounted by this very shell (observer present, so the helper would skip it anyway) and is declared by the `/tenant` layout's spec; the authed layout has no loader (captain's call 8) |
| `components/app-shell/app-shell.tsx:197` | `useTenantSurfacePermissions(isTenantSurface)` → `useScopeAuthDataQuery` | `preload-exempt` — session-stable shell chrome (`staleTime`/`gcTime: Infinity`): the rail's permission filter, fetched once per workspace tenant; a preload would only re-fetch it after the default stale time |
| `components/app-shell/_needs-reconnect-banner.tsx:17` | `useSocialAccountsQuery({ tenantId })` → `socialAccountsQueryOptions` | `preload-exempt` — the shell's reconnect banner renders only once a workspace tenant resolves; the layout has no loader (captain's call 8). The Integrations page declares the same factory in its own spec (Task 8) |
| `components/app-shell/_needs-reconnect-banner.tsx:18` | `useCanManageSocialAccounts()` → `useTenantScopedAuthDataQuery` (`lib/permissions`) | `preload-exempt` — session-stable permission gate (`staleTime: Infinity`), fetched once per workspace tenant; the same gate is exempt on `settings/integrations.tsx:232` (Task 8) |

`routes/authed/layout.tsx:134` declares `createFileRoute('/_authed-layout')` (no trailing slash) and has
no query of its own; `useSessionSurfaceValidation()` only reads the root gate's result from context. It
gets **no loader**: the guard's route set includes it (prefix without the trailing slash) and its page
graph is exactly the five pinned files above (`user-menu.tsx`, `entity-crumb.tsx`, `__root.tsx`,
`app-shell.tsx`, `_needs-reconnect-banner.tsx`), whose seven query call sites are all exempt. Captain's
call 8. The banner adds the sixth and seventh call sites round 3 found: `app-shell.tsx:41` imports it
**relatively** from `./_needs-reconnect-banner`, so it is in no leaf route's page graph, and a walk
confined to `routes/` never reaches it.

### B. Page query keys with no named query-options factory (§7.4)

Six `lib/query/*` hooks build their key inline, so a route cannot import a factory to warm it:

| file:line | hook | current key expression |
|---|---|---|
| `lib/query/tenant-permissions.ts:90` | `useTenantPermissions` (C1) | `['tenant', ...TENANT_PERMISSIONS_QUERY_KEY, tenantId]` |
| `lib/query/tenant-account-profile.ts:147` | `useAccountProfileQuery` | `['tenant', ...ACCOUNT_PROFILE_QUERY_KEY, tenantId]` |
| `lib/query/needs-reconnect-accounts.ts:82` | `useNeedsReconnectAccountsQuery` | `[...NEEDS_RECONNECT_ACCOUNTS_QUERY_KEY, tenantId]` |
| `lib/query/tenant-scheduled-publications.ts:289` | `useScheduledPublicationsInfiniteQuery` | `baseQueryKey` (local `as const` array) |
| `lib/query/tenant-settings-general.ts:176` | `useTenantSettingsGeneralQuery` | `['tenant', ...TENANT_SETTINGS_GENERAL_QUERY_KEY, tenantId]` |
| `lib/query/tenants-for-picker.ts:143` | `useTenantsForPickerQuery` | `[...TENANTS_FOR_PICKER_QUERY_KEY]` |

Two more, in the shared staff panel `routes/authed/staff/_staff-list-team.tsx`:

| file:line | shape |
|---|---|
| `:171` | conditional key: `pageVariables === undefined ? STAFF_TEAM_NO_PAGE_QUERY_KEY : options.queryKey(pageVariables)` |
| `:180` | call: `staffTeamCountQueryKey(section)` |

And one route-local factory that must move into `lib/query` before a loader can warm it:

| file:line | shape |
|---|---|
| `routes/authed/staff/jobs/_permissions.ts:31` | `staffJobPermissionsQueryOptions` (`buildStaffQueryOptions`, key `['staff-jobs','permissions']`), called through a bare `useQuery` at `:52` by `dead-letter.tsx` and `system-jobs.tsx` |

**17** further factories already exist but are **module-private**; the loader cannot import them until
`export` is added (one keyword each, no logic change):

`globalTenantUserCompaniesQueryOptions`, `globalTenantUsersPickerQueryOptions` (staff-global-tenant-users) ·
`staffDashboardSeriesQueryOptions`, `staffDashboardTopOrganisationsQueryOptions` (staff-dashboard) ·
`staffPermissionCatalogQueryOptions`, `staffRolePermissionKeysQueryOptions` (staff-roles) ·
`staffRoleUsersQueryOptions` (staff-role-users) · `staffTenantInvitationsQueryOptions` ·
`staffTenantRoleMemberAssignmentResolutionQueryOptions`, `staffTenantRoleMembersQueryOptions`,
`staffTenantRolePermissionKeysQueryOptions`, `staffTenantRolesQueryOptions` (staff-tenant-roles) ·
`staffTenantUsageQueryOptions` (staff-tenants) · `staffTenantUsersQueryOptions` (staff-tenant-users) ·
`staffUserRolesQueryOptions` (staff-users) · `tenantPostsQueryOptions` (tenant-posts) ·
`tenantProjectsQueryOptions` (tenant-projects).

### C. `preload-exempt` candidates — 14 call sites

| file:line | query | reason (goes in the comment) |
|---|---|---|
| `routes/authed/staff/_staff-list-team.tsx:170` | page-list observer | shared panel: the importing page's own list factory, warmed by that page's loader |
| `routes/authed/staff/_staff-list-team.tsx:179` | counter observer | side-panel count for a filtered list, secondary data |
| `routes/authed/staff/jobs/dead-letter.tsx:323` | dead-letter detail | enabled only while a row drawer is open |
| `routes/authed/staff/tenant-users/$userId-organizations-drawer.tsx:69` | tenant-user picker | search-as-you-type inside a click-opened drawer |
| `routes/authed/staff/tenants/$tenantId/roles/$roleId/_assign-members-state-hook.ts:156` | assignment resolution | resolves the roles of user ids selected on the page |
| `routes/authed/tenant/posts/_scheduled-rendition-editor.tsx:43` | publication rendition | fetches the rendition of the row selected on the page |
| `components/app-shell/user-menu.tsx:43` | current user | session-stable, fetched once at shell mount (`staleTime: Infinity`) |
| `lib/navigation/entity-crumb.tsx:38` | entity crumb | app-shell breadcrumb: the page's own `*DetailsQueryOptions` key, warmed by that page's loader |
| `routes/__root.tsx:604` | root session gate | decides whether authed chrome renders; a hover must not validate a session (PR #997) |
| `components/app-shell/app-shell.tsx:186` | workspace resolver → picker | the shell mounts the picker (observer present, helper skips it) and the `/tenant` layout spec declares it; the authed layout has no loader |
| `components/app-shell/app-shell.tsx:197` | tenant surface permissions | session-stable shell chrome (`staleTime`/`gcTime: Infinity`), fetched once per workspace tenant |
| `components/app-shell/_needs-reconnect-banner.tsx:17` | reconnect banner accounts | app-shell widget, rendered only on a resolved tenant surface; the layout has no loader, and the Integrations page declares the same factory in its spec |
| `components/app-shell/_needs-reconnect-banner.tsx:18` | reconnect banner manage gate | session-stable permission gate (`staleTime: Infinity`), fetched once per workspace tenant |
| `routes/authed/tenant/settings/integrations.tsx:232` | integrations manage gate | the same session-stable permission gate, mounted directly by the Integrations page (the banner also mounts it on resolved tenant surfaces); no factory exists for its inline key (§7.4 does not extract it), so the honest mechanism is an exemption |

The workspace picker itself is **not** an exemption: the eight tenant specs that render it through
`useResolvedWorkspaceTenantId` declare it (measurement A, "shell picker"), and the helper skips it while
the shell observes it. Nothing else is exempt. In particular the calendar/queue window queries are
warmable: the spec computes the same `buildVisibleMonthWindow(new Date())` /
`buildUpcomingPublicationWindow(new Date())` at hover and at mount (a month/day rollover between the two
only costs one refetch).

## Global Constraints

- **No visible change** on any page. A loader never awaits, never renders, never toasts.
  - **Owner-ratified exception (Radan, 10/11)** — on
    `/staff/tenants/$tenantId/roles/$roleId`, a **tenant** failure (404/403/500/400) shows the
    tenant error view (`TenantDetailsError` → `MissingTenantView` / `View403` /
    `staff-tenant-details-error`), the same surface every sibling tenant tab uses, instead of the
    route boundary's role-flavoured view. The page body owns that classification; role-level
    failures keep their existing views.
- No `Array.reduce`, no IIFE, arrow components, design tokens only, i18n FR+EN for any new string.
- React Doctor clean on every changed file (`just react-doctor`).
- TypeScript only. No dependency change, no `pnpm install` by agents.
- `typescript/no-explicit-any` **and** `publy/no-never-any-casts` are `error`: no `as any`, no `as never`,
  no `as unknown as`. The helper's one assertion (`entry as { options: RouteQueryOptions<unknown> |
  RouteInfiniteQueryOptions<unknown>; variables: unknown }`) and the one infinite-query assertion are to
  related non-keyword types and are legal (see Task 1).
- Never log a token, cookie or URI; a preload failure logs the error object only.
- Bespoke guard admission (`docs/guides/test-conventions.md`): Task 10 carries the red/green proof and
  the six admission conditions in the PR body (owner mandate « tout ça doit être mécanique »).
- **Gates, per task** (from `apps/front`; every task lists its exact files below):
  - `pnpm exec vitest run '<the task's test files, verbatim>'`
  - `pnpm --filter front typecheck`
  - `pnpm exec oxlint <the task's changed source files>`
  - `pnpm exec oxfmt --check <the task's changed source files>`
- **Guard gate** (Task 2 and Task 10): the guard test is **excluded** from the default
  `vitest.config.ts` and runs only in the design-guards lane, so its command is
  `pnpm exec vitest run --config vitest.design-guards.config.ts src/lib/query/route-loader-query-key-guard.test.ts`.
  It is also reached by `pnpm --filter front test` (via `test:ci-non-vitest` → `test:design-guards`),
  which is why every task must leave that suite green.

## Decisions this plan takes (spec §9 left them to the builder)

1. **Helper** — `preloadRouteQueries(queryClient, spec)` in
   `apps/front/src/lib/query/route-preload.ts`; types `RouteQueryOptions`, `RouteInfiniteQueryOptions`,
   `RouteQuerySpecEntry` in the same file (each spec declares its own args; there is no shared args
   type — MINOR 3).
2. **Spec shape** — `({ …args }) => ({ name: { options, variables } })`, declared once per route, in
   the route file when the page component lives there, otherwise in a route-local `_queries.ts`. Each
   spec declares its own args: path params, the parsed search, and `tenantId` / `locale` where the page
   needs them (the tenant picker takes none — Task 8). The loader and the page components call the same
   function.
3. **Tenant id** — `/tenant/*` has no tenant id in the path: it comes from the workspace picker query
   plus the persisted selection. `resolveWorkspaceTenantIdFromCache(queryClient)` in
   `lib/query/tenants-for-picker.ts` gives a loader the same value `useResolvedWorkspaceTenantId`
   gives the page. A loader that gets `null` warms nothing.
4. **Cursor — and the infinite `restartKey`** — `useTableController` keeps the cursor in React state
   (never in URL search), so a loader warms the first page of the current filter/sort/size. The
   deeper-cursor page still fetches at mount. This is a stated limit, not an exemption: the query
   identity is the same factory, and the guard's model is factory-level (§7.3). The infinite walk has
   the same class of React-state key component (`restartKey`, `lib/query/tenant-scheduled-publications.ts:280-286`):
   the **spec owns the initial key** (`restartKey: 0`, the value a fresh mount reads), never React
   state. After `restart()` the page is already mounted on its incremented key, so the helper's
   observer skip (decision 5) never touches it — no wasted request; navigating back remounts at `0`,
   which is exactly the key the loader warmed.
5. **Silence on 401 — and never warm a query something already renders.** Two rules, both required:
   (a) the helper **skips any query that already has observers** (`getObserversCount() > 0`): a mounted
   query is managed by the page that renders it, and warming it would only clobber its options and turn
   a hover into a possible logout (M3); only cold / unobserved queries are warmed. (b) `meta: {
   routePreload: true }` on the preload fetch, and `handleAuthedQueryError` skips it **only while no
   observer is subscribed** (`getObserversCount() === 0`). `Query.meta` reads `options.meta` and
   `Query.fetch()` returns an in-flight retryer's promise without replacing the options, so a click
   that lands while the preload is still pending reuses the preload's fetch — the marker must not
   decide on its own. The mounted page's observer makes the count ≥ 1, so that 401 still logs out; and
   if the response beats the observer's mount, the query settles in `error` with no data and
   `shouldLoadOnMount` refetches with the page's own options (no marker). A hover with nothing rendered
   stays silent. See the code in Task 1.
6. **Freshness carried through the factory — only when declared** — a factory may declare `staleTime`
   (the session-stable ones declare `Infinity`); the helper spreads it into `queryClient.query` /
   `infiniteQuery` **only when it is not `undefined`**, so a factory without one keeps the QueryClient
   default (30 s, `router.tsx:28`) instead of injecting `undefined` over it (C1: `defaultQueryOptions`
   spreads the caller's options last, and `isStaleByTime(undefined)` falls back to `0`). This stops a
   hover refetching a query the page deliberately never revalidates (M2) without making every other
   warm hover refetch.
7. **Exemptions** — `// preload-exempt: <reason>` on the line(s) above the `use*Query` / `useQuery`
   call. The guard reads the **enclosing statement's** leading comment ranges (a call nested in `const x
   = …` / `return …` carries no leading trivia of its own), and an exempt call is skipped before key
   resolution, so a dynamic key is legal. No reason ⇒ guard failure; a marker that no longer covers a
   visited query ⇒ failure. Where the old `// oxlint-disable-next-line publy/route-query-preload` line
   still exists (until Task 11), the marker goes **above** it: the disable must stay the last comment
   before the call, otherwise it suppresses a comment instead of the call.
8. **Guard** — the scanner moves out of the test into
   `apps/front/src/lib/query/route-loader-query-key-guard.ts` (injectable `routesDir`, so fixtures are
   real files outside `src/routes/`). It reads the helper's spec call site, keeps the old
   loader ⊆ page direction, adds page ⊆ loader over the import graph, and stays fail-loud on any shape
   it cannot resolve. Page queries are **every** called `lib/**` binding whose body — directly or
   through a same-module local call or another imported `lib/**` hook — reaches
   `useQuery`/`useInfiniteQuery`, not just `*Query`-named hooks (C1); `lib/permissions` is the second
   such module today (round 3: the shell banner's `useCanManageSocialAccounts`).
9. **App shell** — the `/_authed-layout` route joins the guard's route set and its page graph is the
   pinned app-shell file set of section D (`user-menu.tsx`, `entity-crumb.tsx`, `__root.tsx`,
   `app-shell.tsx`, `_needs-reconnect-banner.tsx`); every query call site there is a named exemption,
   so the layout needs no loader
   (its only data is session-stable shell chrome). `entity-crumb` is exempt rather than refactored: its
   key already *is* the page's domain factory through the `*CrumbQuery` helpers.

---

### Task 1: Preload helper, router freshness, tenant resolver, real-router behaviour tests

**Files:**
- Create: `apps/front/src/lib/query/route-preload.ts`
- Create: `apps/front/src/lib/query/route-preload.test.tsx`
- Modify: `apps/front/src/router.tsx` (`handleAuthedQueryError` l.105–124, `createRouter` options l.177–186)
- Modify: `apps/front/src/router.test.ts` (`describe('handleAuthedQueryError')`, l.301)
- Modify: `apps/front/src/lib/query/tenants-for-picker.ts` (extract + export
  `tenantsForPickerQueryOptions`, add `resolveWorkspaceTenantIdFromCache`)
- Modify: `apps/front/src/lib/query/tenants-for-picker.test.ts` (resolver cases)

**Interfaces (produced)** — typechecked against `@tanstack/query-core@5.105.1` (see "Verified snippets"):

```ts
// apps/front/src/lib/query/route-preload.ts
import type {
	GetNextPageParamFunction,
	QueryClient,
	QueryKey,
	QueryMeta,
} from '@tanstack/react-query';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

/** A `lib/query/*` factory (`buildStaffQueryOptions` shape): key builder + fetcher.
 *
 * `TVariables = never` is the ERASED form: a concrete factory's parameter is
 * only assignable to `never` under `strictFunctionTypes`, so a spec entry
 * written with concrete variables is assignable to this. The helper re-widens
 * the pair once, at its single boundary (see the assertion below). */
export type RouteQueryOptions<TVariables = never> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (variables: TVariables) => Promise<unknown>;
	/** The freshness the page's own hook declares. Session-stable factories
	 * pass `Infinity`; without it the QueryClient default (`30_000`, router.tsx)
	 * would refetch data the page deliberately never revalidates on every hover
	 * (M2). The helper spreads it **only when defined** — passing `undefined`
	 * would overwrite that default and make every warm hover refetch (C1). */
	staleTime?: number;
};

/** An `useInfiniteQuery` page: the same factory plus the three options its
 * cache entry needs, so the loader warms the first page in the
 * `{ pages, pageParams }` shape the page's hook reads (a plain `queryClient.query`
 * would write one raw page there and corrupt the walk).
 *
 * `pageParam` is `unknown`, not the concrete `string | undefined`: the
 * extracted fetcher narrows it (`typeof pageParam === 'string' ? pageParam :
 * undefined`), and the hook keeps calling it with `string | undefined`, which
 * is allowed. `signal` is passed through so the extracted fetcher keeps the
 * page hook's abort handle. `getNextPageParam`'s parameters are `never` so a
 * concrete `(lastPage: Response[], …)` factory is assignable; the helper
 * re-types it at the one call site (see the assertion). */
export type RouteInfiniteQueryOptions<TVariables = never> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (
		variables: TVariables,
		pageParam: unknown,
		signal?: AbortSignal,
	) => Promise<unknown>;
	initialPageParam: unknown;
	getNextPageParam: (
		lastPage: never,
		allPages: never[],
		lastPageParam: never,
		allPageParams: never[],
	) => unknown;
	staleTime?: number;
};

/** One query the page renders: the factory plus the variables it is called
 * with. `variables` is `unknown` here and typed concretely by each route's
 * spec, which returns an unannotated object literal. */
export type RouteQuerySpecEntry = {
	options: RouteQueryOptions | RouteInfiniteQueryOptions;
	variables: unknown;
};

/**
 * Warms every query the destination page renders, without awaiting: navigation
 * never waits for data (spec §4.2.2). A failure — a rejected fetch **or** a
 * synchronously throwing `queryKey` — is logged and swallowed: the page's own
 * `useQuery` at mount is the request that reports its cause through
 * `QueryDisplay` (spec §4.2.7).
 *
 * A query that already has an observer is skipped: the page that renders it
 * owns it, and re-warming it would clobber its options/meta and turn a hover
 * into a possible logout (M3, spec §8).
 *
 * A factory's `staleTime` is passed only when the factory declares one: an
 * explicit `staleTime: undefined` overwrites the QueryClient default in
 * `defaultQueryOptions` (C1), turning every warm hover into a refetch.
 *
 * `meta.routePreload` is advisory only: `handleAuthedQueryError` skips it only
 * while the query has no observer (spec §8). The page's observer mounts on the
 * same `Query` on click, so the click's 401 still logs out.
 */
export const preloadRouteQueries = (
	queryClient: QueryClient,
	spec: Record<string, RouteQuerySpecEntry>,
): void => {
	const meta: QueryMeta = { routePreload: true };
	const logFailure = (error: unknown): void => {
		logger.warn('[route preload] query preload failed', { error });
	};

	for (const entry of Object.values(spec)) {
		try {
			// The spec couples a factory with its own variables at the call site;
			// the entry type erases the pair to `never` (see RouteQueryOptions), so
			// re-widen it once here — the single boundary that erases it. Both
			// directions are related, so this is a legal single assertion: no `any`,
			// no `never`.
			const { options, variables } = entry as {
				options: RouteQueryOptions<unknown> | RouteInfiniteQueryOptions<unknown>;
				variables: unknown;
			};
			const queryKey = options.queryKey(variables);

			// A mounted query is already managed by its page (M3): warming it would
			// only clobber `query.options` and could earn a 401 the page's observer
			// turns into a logout. Cold / unobserved only.
			const existing = queryClient
				.getQueryCache()
				.find({ queryKey, exact: true });
			if (existing !== undefined && existing.getObserversCount() > 0) {
				continue;
			}

			if ('initialPageParam' in options) {
				void queryClient
					.infiniteQuery({
						queryKey,
						queryFn: ({ pageParam, signal }) =>
							options.fetcher(variables, pageParam, signal),
						initialPageParam: options.initialPageParam,
						// `GetNextPageParamFunction` is contravariant on the page type;
						// the entry erased it, so re-type it at the one call site.
						getNextPageParam: options.getNextPageParam as GetNextPageParamFunction<
							unknown,
							unknown
						>,
						// Only when the factory declares it: an explicit `undefined`
						// would overwrite the QueryClient default (C1).
						...(options.staleTime === undefined
							? {}
							: { staleTime: options.staleTime }),
						meta,
					})
					.catch(logFailure);
				continue;
			}

			void queryClient
				.query({
					queryKey,
					queryFn: () => options.fetcher(variables),
					// Same conditional spread as the infinite branch (C1).
					...(options.staleTime === undefined
						? {}
						: { staleTime: options.staleTime }),
					meta,
				})
				.catch(logFailure);
		} catch (error) {
			logFailure(error);
		}
	}
};
```

`tenants-for-picker.ts` (this module builds its key inline today — extract that exact array and the
existing `queryFn` body, do not change either):

```ts
export const tenantsForPickerQueryOptions = {
	queryKey: (_variables: Record<string, never>): QueryKey => [
		...TENANTS_FOR_PICKER_QUERY_KEY,
	],
	fetcher: async (_variables: Record<string, never>) => {
		const client = getClientManager().getOrCreateTenantScopeClient();
		const result = await client.auth.tenantsForPicker.get();
		return toTenantsForPickerData(result);
	},
};

export const useTenantsForPickerQuery = (options: { enabled?: boolean } = {}) =>
	useQuery({
		queryKey: tenantsForPickerQueryOptions.queryKey({}),
		queryFn: () => tenantsForPickerQueryOptions.fetcher({}),
		enabled: options.enabled,
	});

/** Non-React tenant resolution for a route loader: the same picker rows and the
 * same persisted selection the page hook reads. `null` when the picker has not
 * loaded yet — a loader then warms nothing. */
export const resolveWorkspaceTenantIdFromCache = (
	queryClient: QueryClient,
): string | null => {
	const data = queryClient.getQueryData<TenantsForPickerData>(
		tenantsForPickerQueryOptions.queryKey({}),
	);
	if (data === undefined) {
		return null;
	}
	return resolveWorkspaceTenant(data, readSelectedTenantId())?.id ?? null;
};
```

`router.tsx` — the backstop (C1 fix) and the router option:

```ts
/**
 * Backstop source shape shared by `Query`/`Mutation` — both expose a `.meta`
 * getter that mirrors their options' `meta`. `getObserversCount` exists on
 * `Query` only; a `Mutation` has no observers.
 */
type AuthedErrorBackstopSource = {
	meta?: MutationHandlerMeta & { routePreload?: boolean };
	getObserversCount?: () => number;
};

export const handleAuthedQueryError = (
	error: unknown,
	source?: AuthedErrorBackstopSource,
): void => {
	if (source?.meta?.skipAuthedErrorBackstop) {
		return;
	}

	// A route preload is speculative (spec §8): a 401 it earns while NOTHING
	// renders the query must not clear the session. The click still does. The
	// marker alone cannot decide: a click that lands while the preload is in
	// flight reuses the preload's fetch (`Query.fetch` returns the retryer's
	// promise without replacing `options`), so `Query.meta` still carries the
	// marker when the 401 lands. The observer count is the real signal — the
	// page's `useQuery` subscribes to the same `Query`. If the response beats
	// that mount, the query settles in `error` with no data and
	// `shouldLoadOnMount` refetches with the page's own marker-free options.
	if (
		source?.meta?.routePreload === true &&
		source.getObserversCount?.() === 0
	) {
		return;
	}
	… // unchanged
```

```ts
	const router = createRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: 'intent',
		// Freshness belongs to TanStack Query (spec §4.2.4): a warm query cache must
		// not be re-fetched just because the router's preload cache is stale, and a
		// stale query must not be hidden by a router-side cache.
		defaultPreloadStaleTime: 0,
		ssr: import.meta.env.SSR ? { nonce: mintCspNonce() } : undefined,
	});
```

**Tests** — `route-preload.test.tsx`, jsdom, real `createRouter` + `createMemoryHistory` + a throwaway
route tree (copy the harness of
`routes/authed/staff/tenants/$tenantId/roles/$roleId.loader-revalidation.test.tsx`: fake Kiota client,
`QueryClientProvider`, `RouterProvider`, and a `handleAuthedQueryError`/`triggerSessionInvalidated` spy):

1. **cold hover fetches once** — hover a `<Link>` to the destination (no click): the factory's `fetcher`
   runs exactly once before any click.
2. **warm hover does not refetch when the factory declares no `staleTime`** — the throwaway
   `QueryClient` is built with `defaultOptions.queries.staleTime: 60_000` and the spec's factory has
   **no** `staleTime`, so the helper must omit the property (C1). Hover twice: still one fetch, and the
   cache entry's `options.staleTime` is `60_000` (the client default), not `undefined`. With an
   unconditional `staleTime: options.staleTime` the second hover refetches and this test is red.
3. **failing preload is silent, then the page shows its error** — the API rejects; hover: no toast, no
   error text, no redirect, one `logger.warn`; click: the destination renders `QueryDisplay`'s error
   state.
4. **expired session: hover does not log out, a click DURING the pending preload does** — the fake
   fetcher returns a promise the test settles by hand: hover (fetcher called, promise pending) → click
   and wait for the destination to paint → reject with a 401 → the `triggerSessionInvalidated` spy is
   called. Then the same test with no click: still pending → reject → the spy is **not** called. (This
   is the C1 pin: the first half fails against `meta.skipAuthedErrorBackstop` on the query options.)
5. **an already-mounted query is never re-warmed (M3)** — mount a route whose component renders the
   factory (observer subscribed), then hover a `<Link>` to a second route whose spec declares the same
   factory: the fetcher is not called again and an expired session does not log out. This is the
   static-rule pin: it fails against a helper that only relies on `meta.routePreload`.
6. **a `staleTime: Infinity` factory is never refetched (M2)** — the harness `QueryClient` uses
   `staleTime: 0`, the spec's factory declares `staleTime: Infinity`; hover twice: one fetch. Without
   the pass-through the second hover refetches (the harness default would consider the cached page
   stale immediately).
7. **a synchronously throwing fetcher or `queryKey` never escapes** — `fetcher: () => { throw new
   Error('boom') }` and `queryKey: () => { throw new Error('boom-key') }`: `preloadRouteQueries` returns
   normally and each error is logged, not thrown.
8. **infinite entries warm the `{ pages, pageParams }` shape** — the cache entry for an
   `initialPageParam`/`getNextPageParam` spec is an `InfiniteData` object, not one raw page; the
   fetcher receives the page's `signal`.

`tenants-for-picker.test.ts`: `resolveWorkspaceTenantIdFromCache` returns `null` on a cold cache, the
persisted selection's id when cached, and the single active tenant when nothing is persisted.
`router.test.ts`: `routePreload: true` with `getObserversCount: () => 1` triggers; with `() => 0` does
not; `skipAuthedErrorBackstop` still wins unconditionally.

- [ ] **Step 1:** write the tests (they fail: the helper, the resolver and the backstop branch do not exist).
- [ ] **Step 2:** implement `route-preload.ts`, the `tenants-for-picker.ts` extraction + resolver, the
  backstop branch and the router option.
- [ ] **Step 3:** run
  `pnpm exec vitest run 'src/lib/query/route-preload.test.tsx' 'src/lib/query/tenants-for-picker.test.ts' 'src/router.test.ts' 'src/routes/authed/staff/tenants/$tenantId/roles/$roleId.loader-revalidation.test.tsx'`
  (the last must stay green — this task does not touch the route).
- [ ] **Step 4:** gates + commit `feat(front): fire-and-forget route query preload helper (#2340)`.

---

### Task 2: Query-spec shape and migrate the existing `$roleId` loader

**Files:**
- Create: `apps/front/src/routes/authed/staff/tenants/$tenantId/roles/$roleId/_queries.ts`
- Modify: `apps/front/src/routes/authed/staff/tenants/$tenantId/roles/$roleId.tsx` (loader, l.296–375)
- Modify: `apps/front/src/routes/authed/staff/tenants/$tenantId/roles/$roleId/_use-role-details-state.ts`
  (read the five variable sets from the spec instead of rebuilding them, l.171–213)
- Replace: `apps/front/src/routes/authed/staff/tenants/$tenantId/roles/$roleId.loader-revalidation.test.tsx`
  (its premise — awaited fetch + background revalidation — no longer exists)
- Modify: `apps/front/src/lib/query/route-loader-query-key-guard.test.ts` (the temporary allowlist, below)

**Interfaces (produced):**

```ts
// _queries.ts
import {
	staffTenantPermissionCatalogQueryOptions,
	staffTenantRoleDetailsQueryOptions,
	staffTenantRoleMembersQueryOptions,
	staffTenantRolePermissionKeysQueryOptions,
} from '~/lib/query/staff-tenant-roles';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';

type RoleDetailsQueryArgs = {
	tenantId: string;
	roleId: string;
	locale: string;
};

/** The role-detail layout's queries, declared once: the loader warms them and
 * `useStaffTenantRoleDetails` reads the same variables. The page's `enabled`
 * gates (wait for the tenant query, drawer open, …) stay on the page — they
 * sequence rendering, they do not change the variables. */
export const roleDetailsQueries = ({
	tenantId,
	roleId,
	locale,
}: RoleDetailsQueryArgs) => ({
	tenantDetails: {
		options: staffTenantDetailsQueryOptions,
		variables: { tenantId },
	},
	roleDetails: {
		options: staffTenantRoleDetailsQueryOptions,
		variables: { tenantId, roleId },
	},
	permissionCatalog: {
		options: staffTenantPermissionCatalogQueryOptions,
		variables: { language: locale },
	},
	roleMembers: {
		options: staffTenantRoleMembersQueryOptions,
		variables: {
			tenantId,
			roleId,
			pageIndex: 0,
			size: MEMBERS_PREVIEW_LIMIT,
			sortId: 'created_at',
			sortOrder: 'desc',
		},
	},
	rolePermissionKeys: {
		options: staffTenantRolePermissionKeysQueryOptions,
		variables: { tenantId, roleId },
	},
});
```

Loader in `$roleId.tsx` (replaces the whole current body; `pendingComponent` stays). No `loaderDeps`:
none of the five variables comes from search.

```ts
	loader: ({ context, params }) => {
		preloadRouteQueries(
			context.queryClient,
			roleDetailsQueries({
				tenantId: params.tenantId,
				roleId: params.roleId,
				locale: i18n.language,
			}),
		);
	},
```

`_use-role-details-state.ts` — the variables come from the spec, the `enabled` gates stay:

```ts
	const queries = roleDetailsQueries({ tenantId, roleId, locale });
	const tenantQuery = useStaffTenantDetailsQuery(queries.tenantDetails.variables, {
		enabled: tenantId.length > 0,
	});
	const roleEnabled =
		tenantId.length > 0 && roleId.length > 0 && !tenantQuery.isPending && !tenantQuery.isError;
	const detailQuery = useStaffTenantRoleDetailsQuery(queries.roleDetails.variables, {
		enabled: roleEnabled,
	});
	const permissionKeysQuery = useStaffTenantRolePermissionKeysQuery(
		queries.rolePermissionKeys.variables,
		{ enabled: roleEnabled },
	);
	const membersQuery = useStaffTenantRoleMembersQuery(
		queries.roleMembers.variables,
		{ enabled: roleEnabled && activeSection === 'overview' },
	);
	const permissionCatalogQuery = useStaffTenantPermissionCatalogQuery(
		queries.permissionCatalog.variables,
	);
```

**Old guard unblocking (temporary, removed in Task 10).** The old guard
(`route-loader-query-key-guard.test.ts`) treats a loader with `context` access as strict and reports
**every bare imported callee** as opaque (`collectStrictModeOpaqueCalls`, l.600–627; `collectLocalNames`
l.629–646 collects declarations, not imports; `GLOBAL_CALLEE_ALLOWLIST` is l.104–149). This task's
loader calls two imported names, `preloadRouteQueries` and `roleDetailsQueries`, and Tasks 6/9 add
`tenantRolesQueries`, `roleMembersQueries`, `postQueueQueries`, `postCalendarQueries`, while Task 8 adds
`resolveWorkspaceTenantIdFromCache`. **One explicit edit, in this task, covers all of them:**

```ts
// TEMPORARY (#2340, removed in Task 10): the old heuristic cannot resolve a
// loader's spec call, so it would report the helper and every `<domain>Queries`
// spec function as opaque. Task 10 replaces this whole function with real spec
// resolution.
const isPreloadCallee = (callee: string): boolean =>
	callee === 'preloadRouteQueries' ||
	callee === 'resolveWorkspaceTenantIdFromCache' ||
	/^[a-z][A-Za-z0-9]*Queries$/.test(callee);
```

and in `collectStrictModeOpaqueCalls`: `if (!localNames.has(callee) && !GLOBAL_CALLEE_ALLOWLIST.has(callee) && !isPreloadCallee(callee))`.
Record it in the PR body as a deliberate, bounded weakening restored and strengthened by Task 10.

**Tests:** replace the revalidation test with `$roleId.preload.test.tsx`: mount the real route options
under a throwaway router, hover the role link, assert each of the five keys is fetched once and that
`pendingComponent` never renders during the preload; click, assert the page paints from cache with zero
additional fetch.

- [ ] **Step 1:** write `_queries.ts`, the loader, the page wiring; delete the revalidation test; add the
  `isPreloadCallee` allowlist edit.
- [ ] **Step 2:** run
  `pnpm exec vitest run 'src/routes/authed/staff/tenants/$tenantId/roles'` and
  `pnpm exec vitest run --config vitest.design-guards.config.ts src/lib/query/route-loader-query-key-guard.test.ts`.
- [ ] **Step 3:** gates + commit
  `refactor(front): $roleId loader preloads fire-and-forget from one query spec (#2340)`.

---

### Task 3: §7.4 factory refactors (exports, inline keys, shared table variables)

**Files:**
- Modify (add `export` only, **17** names): `lib/query/staff-global-tenant-users.ts`,
  `lib/query/staff-dashboard.ts`, `lib/query/staff-roles.ts`, `lib/query/staff-role-users.ts`,
  `lib/query/staff-tenant-invitations.ts`, `lib/query/staff-tenant-roles.ts`, `lib/query/staff-tenants.ts`,
  `lib/query/staff-tenant-users.ts`, `lib/query/staff-users.ts`, `lib/query/tenant-posts.ts`,
  `lib/query/tenant-projects.ts` — exactly the 17 names listed in measurement B.
- Modify (extract a named factory, hook delegates to it):
  `lib/query/tenant-account-profile.ts` (`accountProfileQueryOptions`),
  `lib/query/needs-reconnect-accounts.ts` (`needsReconnectAccountsQueryOptions`, carries
  `staleTime: Infinity`),
  `lib/query/tenant-settings-general.ts` (`tenantSettingsGeneralQueryOptions`),
  `lib/query/tenant-permissions.ts` (`tenantPermissionsQueryOptions`, carries `staleTime: Infinity` —
  C1: it is a page query of the three posts routes and the guard now sees it), and
  `lib/query/tenant-scheduled-publications.ts` (`scheduledPublicationsInfiniteQueryOptions` — key is the
  current `baseQueryKey` expression, including `restartKey ?? 0` (the spec owns `restartKey: 0`,
  decision 4), `fetcher(variables, pageParam: unknown, signal?: AbortSignal)`
  narrows `pageParam` with `typeof pageParam === 'string' ? pageParam : undefined` and keeps
  `void signal`, `initialPageParam` and `getNextPageParam` moved verbatim from the hook, so the loader
  can warm the first page in the `InfiniteData` shape).
- Modify: `lib/query/staff-jobs.ts` (already exists — 16 KB, 11 exports today) gains the moved
  `staffJobPermissionsQueryOptions` (exported); modify
  `routes/authed/staff/jobs/_permissions.ts` to import it (no bare route-local factory left; its
  `useQuery` call site stays, so the guard sees the same identity on both sides).
- Modify: `components/table/use-table-controller.ts` — export
  `buildTableApiVariables(search, defaultSort, defaultSize, cursor?)` returning
  `{ q: search.q, sortId: resolveSort(search, defaultSort).id, sortOrder: resolveSort(search, defaultSort).order, size: resolveSize(search, defaultSize), cursor }`;
  inside the hook's returned object, replace the inline literal at l.202–208 with
  `apiVariables: buildTableApiVariables(search, sort, size, cursorPagination.cursor)` — **not**
  `{ ...buildTableApiVariables(...) }`, which would drop `sort`/`cursor`/`search` and break every list
  page. A loader omits `cursor` (first page — see decision 4).
- Modify: `routes/authed/staff/_staff-list-team.tsx` — add the two `preload-exempt` comments above the
  two `useQuery` calls (keep the two `oxlint-disable` lines until Task 11). No factory extraction here:
  the page-list observer reuses the importing page's own factory (warmed by that page's loader), and the
  counter is secondary data — the exemption is the honest mechanism, not a refactor.

**Interfaces (produced) — every extracted hook MUST delegate its key to the factory.** The guard's
identity for a page query is `factory <module>#<name>` only when the `useQuery` / `useInfiniteQuery`
`queryKey` expression is literally `xxxQueryOptions.queryKey(...)`; a bare identifier or an inline
array yields a different identity (`factory …#baseQueryKey`, `literal …`) and then both guard
directions fail on `account/profile`, `settings/general`, `settings/integrations`, `posts/queue` and
`posts/calendar` (ME1). So every one of the five extractions pins this shape (example, the C1 one):

```ts
// lib/query/tenant-permissions.ts
export const tenantPermissionsQueryOptions = {
	queryKey: ({ tenantId }: { tenantId: string | null }): QueryKey => [
		'tenant',
		...TENANT_PERMISSIONS_QUERY_KEY,
		tenantId,
	],
	fetcher: (variables: { tenantId: string | null }) =>
		fetchTenantPermissions(variables.tenantId as string),
	staleTime: Infinity,
};

export const useTenantPermissions = (tenantId: string | null): TenantPermissions => {
	const query = useQuery({
		queryKey: tenantPermissionsQueryOptions.queryKey({ tenantId }),
		queryFn: () => tenantPermissionsQueryOptions.fetcher({ tenantId }),
		enabled: tenantId !== null,
		staleTime: tenantPermissionsQueryOptions.staleTime,
		refetchOnWindowFocus: false,
	});
	…
};
```

The same for `accountProfileQueryOptions`, `needsReconnectAccountsQueryOptions`,
`tenantSettingsGeneralQueryOptions` (key arrays byte-identical to today's inline ones) and
`scheduledPublicationsInfiniteQueryOptions` (`queryKey: scheduledPublicationsInfiniteQueryOptions.queryKey(variables)`,
`queryFn: ({ pageParam, signal }) => scheduledPublicationsInfiniteQueryOptions.fetcher(variables, pageParam, signal)`).
A session-stable factory carries `staleTime: Infinity` and the hook reads
`staleTime: xxxQueryOptions.staleTime`, so the loader and the page share one freshness value (M2).
`tenant-permissions.test.ts` already asserts `staleTime === Infinity` and the exact key array, so the
delegation must preserve both.

**Tests:** the affected `lib/query` specs must stay green with no key change —
`src/lib/query/staff-audit-logs.test.ts`, `staff-invitations.test.ts`, `staff-jobs.test.ts`,
`staff-role-users.test.ts`, `staff-roles.test.ts`, `staff-tenant-invitations.test.ts`,
`staff-tenant-roles.test.ts`, `staff-tenant-users.test.ts`, `staff-tenants.test.ts`,
`staff-users.test.ts`, `tenant-account-profile.test.ts`, `tenant-posts.test.ts`,
`tenant-permissions.test.ts`, `tenant-scheduled-publications.test.ts`, `tenant-settings-general.test.ts`,
`tenants-for-picker.test.ts`; plus `src/components/table` and the five consumers of
`_staff-list-team.tsx` (`staff-users`, `roles`, `invitations`, `audit-logs`, `roles/$roleId/users`).
Add one inline-snapshot assertion per extracted factory that `queryKey(variables)` equals the array the
hook built before.

- [ ] **Step 1:** add the 17 `export` keywords and move `staffJobPermissionsQueryOptions` to
  `lib/query/staff-jobs.ts`; run the affected `lib/query` specs.
- [ ] **Step 2:** extract the five remaining inline-key factories (`accountProfileQueryOptions`,
  `needsReconnectAccountsQueryOptions`, `tenantSettingsGeneralQueryOptions`,
  `tenantPermissionsQueryOptions`, `scheduledPublicationsInfiniteQueryOptions` — the sixth,
  `tenantsForPickerQueryOptions`, is Task 1's) with the delegation shape above, and add the key
  assertions.
- [ ] **Step 3:** extract `buildTableApiVariables` and delegate from `useTableController`; run
  `pnpm exec vitest run src/components/table`.
- [ ] **Step 4:** `_staff-list-team.tsx`: two `preload-exempt` comments (no code change beyond the
  comments) — `// preload-exempt: the importing page's own list, warmed by that page's loader` above
  `:170` and `// preload-exempt: side-panel count for a filtered list, secondary data` above `:179`.
  **Exact order:** the marker goes on the line ABOVE the existing
  `// oxlint-disable-next-line publy/route-query-preload` line, which stays the last comment before the
  `const pageQuery = useQuery({` / `const counterQuery = useQuery({` line — verified with the repo's
  oxlint 1.90 binary: a `disable-next-line` separated from the code by an intervening comment stops
  suppressing it. Task 11 then deletes the disable line and the marker is adjacent. Run its consumers'
  tests.
- [ ] **Step 5:** gates + commit `refactor(front): named query-options factories for route preload (#2340)`.

---

### Task 4: Loaders for the staff list routes (7 routes)

**Files (each with its colocated `*.preload.test.tsx`):**
- `routes/authed/staff/audit-logs.tsx` — spec `auditLogsQueries({ search })`
- `routes/authed/staff/invitations/index.tsx` — `staffInvitationsQueries({ search })`
- `routes/authed/staff/jobs/queue.tsx` — `staffJobQueueQueries({ search })`
- `routes/authed/staff/jobs/system-jobs.tsx` — `staffSystemJobsQueries({ search })`, including the
  `permissions` entry (`staffJobPermissionsQueryOptions`, key `['staff-jobs','permissions']` — it is a
  page query of this route through `_permissions.ts:52`)
- `routes/authed/staff/roles.tsx` — `staffRolesQueries({ search })`
- `routes/authed/staff/staff-users.tsx` — `staffUsersQueries({ search })`
- `routes/authed/staff/tenants.tsx` — `staffTenantsQueries({ search })`

**Spec entries (measurement A rows 2, 7, 10, 11, 15, 18, 31 — pinned, ME2):**

| spec | entry → factory |
|---|---|
| `auditLogsQueries` | `logs` → `staffAuditLogsQueryOptions`; `actions` → `staffAuditLogActionsQueryOptions` |
| `staffInvitationsQueries` | `invitations` → `staffInvitationsQueryOptions` |
| `staffJobQueueQueries` | `queue` → `staffJobQueueQueryOptions`; `deadLetters` → `staffDeadLettersQueryOptions`; `systemJobs` → `staffSystemJobDefinitionsQueryOptions` |
| `staffSystemJobsQueries` | same three as `staffJobQueueQueries` **plus** `permissions` → `staffJobPermissionsQueryOptions` |
| `staffRolesQueries` | `roles` → `staffRolesQueryOptions` |
| `staffUsersQueries` | `users` → `staffUsersQueryOptions` (plus the `status` filter variable) |
| `staffTenantsQueries` | `tenants` → `staffTenantsQueryOptions` |

**Pattern (one route, then repeat):**

```ts
const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

/** The page's list query, declared once: the loader warms it and the page reads
 * the same variables. */
const staffUsersQueries = ({ search }: { search: StaffUserListSearchParams }) => ({
	users: {
		options: staffUsersQueryOptions,
		variables: {
			...buildTableApiVariables(search, DEFAULT_SORT, DEFAULT_SIZE),
			status: search.status.length > 0 ? search.status.join(',') : undefined,
		},
	},
});

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => {
		preloadRouteQueries(context.queryClient, staffUsersQueries({ search: deps }));
	},
	…
});

// page body
const queries = staffUsersQueries({ search });
const query = useStaffUsersQuery(queries.users.variables);
```

`useStaffTeamOverview({ staff: listVariables })` keeps `listVariables` = `queries.users.variables`
(counter exemption unchanged). Delete the `// oxlint-disable-next-line publy/route-query-preload`
comments only in Task 11; add the `preload-exempt` comments in the same files where measurement C
requires them (none of these seven except the shared panel, done in Task 3).

**Tests:** `audit-logs.preload.test.tsx`, `invitations/index.preload.test.tsx`,
`jobs/queue.preload.test.tsx`, `jobs/system-jobs.preload.test.tsx` (must assert the permissions key is
warmed too), `roles.preload.test.tsx`, `staff-users.preload.test.tsx`, `tenants.preload.test.tsx` — each:
with the real route options under a throwaway router, hovering the route's own link calls each page
factory's fetcher once, and clicking adds no fetch while the data is fresh.

- [ ] **Step 1:** per route, add the spec + `loaderDeps` + `loader`; point the page hook at
  `queries.<name>.variables`.
- [ ] **Step 2:** per route, the preload test; run
  `pnpm exec vitest run 'src/routes/authed/staff/audit-logs.preload.test.tsx' 'src/routes/authed/staff/invitations/index.preload.test.tsx' 'src/routes/authed/staff/jobs/queue.preload.test.tsx' 'src/routes/authed/staff/jobs/system-jobs.preload.test.tsx' 'src/routes/authed/staff/roles.preload.test.tsx' 'src/routes/authed/staff/staff-users.preload.test.tsx' 'src/routes/authed/staff/tenants.preload.test.tsx'`
  plus the seven routes' existing tests.
- [ ] **Step 3:** gates + commit `feat(front): preload staff list routes in their loaders (#2340)`.

---

### Task 5: Loaders for the staff detail pages (11 routes)

**Files:**
- `routes/authed/staff/audit-logs/$logId.tsx` — `auditLogDetailsQueries({ logId })`
- `routes/authed/staff/invitations/$invitationId.tsx` — `invitationDetailsQueries({ invitationId })`
- `routes/authed/staff/invitations/new.tsx` — `invitationNewQueries({})` (roles list)
- `routes/authed/staff/jobs/dead-letter.tsx` — `deadLetterQueries({ search })` with the three list
  queries **plus** the `permissions` entry; the detail query gets
  `// preload-exempt: enabled only while a row drawer is open`
- `routes/authed/staff/roles/$roleId.tsx` — `staffRoleQueries({ roleId, search })`
- `routes/authed/staff/roles/$roleId/users.tsx` — `staffRoleUsersQueries({ roleId, search })`
- `routes/authed/staff/roles-new.tsx` — `roleNewQueries({})` (permission catalog)
- `routes/authed/staff/staff-users/$userId.tsx` — `staffUserQueries({ userId })`
- `routes/authed/staff/staff-users/$userId-edit.tsx` — `staffUserEditQueries({ userId })`
- `routes/authed/staff/tenant-users/$userId-general.tsx` — `globalTenantUserQueries({ userId })`
- `routes/authed/staff/tenant-users/$userId-organizations.tsx` — `globalTenantUserOrganizationsQueries({ userId })`;
  the picker query in `$userId-organizations-drawer.tsx:69` gets
  `// preload-exempt: search-as-you-type picker inside a click-opened drawer`

**Spec entries (measurement A rows 1, 6, 8, 9, 12, 13, 14, 16, 17, 32, 33 — pinned, ME2):**

| spec | entry → factory |
|---|---|
| `auditLogDetailsQueries` | `details` → `staffAuditLogDetailsQueryOptions` |
| `invitationDetailsQueries` | `details` → `staffInvitationDetailsQueryOptions` |
| `invitationNewQueries` | `roles` → `staffRolesQueryOptions` |
| `deadLetterQueries` | `queue` → `staffJobQueueQueryOptions`; `deadLetters` → `staffDeadLettersQueryOptions`; `systemJobs` → `staffSystemJobDefinitionsQueryOptions`; `permissions` → `staffJobPermissionsQueryOptions` (detail exempt) |
| `staffRoleQueries` | `roleDetails` → `staffRoleDetailsQueryOptions`; `permissionCatalog` → `staffPermissionCatalogQueryOptions`; `permissionKeys` → `staffRolePermissionKeysQueryOptions`; `users` → `staffRoleUsersQueryOptions` |
| `staffRoleUsersQueries` | `roleDetails` → `staffRoleDetailsQueryOptions`; `users` → `staffRoleUsersQueryOptions` |
| `roleNewQueries` | `permissionCatalog` → `staffPermissionCatalogQueryOptions` |
| `staffUserQueries` | `details` → `staffUserDetailsQueryOptions`; `userRoles` → `staffUserRolesQueryOptions` |
| `staffUserEditQueries` | `details` → `staffUserDetailsQueryOptions`; `roles` → `staffRolesQueryOptions`; `userRoles` → `staffUserRolesQueryOptions` |
| `globalTenantUserQueries` | `details` → `globalTenantUserDetailsQueryOptions` |
| `globalTenantUserOrganizationsQueries` | `details` → `globalTenantUserDetailsQueryOptions`; `companies` → `globalTenantUserCompaniesQueryOptions` (picker exempt) |

Same spec/loader pattern as Task 4. Detail routes without list state use
`loader: ({ context, params }) => { preloadRouteQueries(context.queryClient, spec({ <name>: params.<name> })); }`
— the concrete param of that route (`logId`, `invitationId`, `roleId`, `userId`; **no route declares a
`$id`**) — and no `loaderDeps`.

**Tests:** `$logId.preload.test.tsx`, `$invitationId.preload.test.tsx`, `new.preload.test.tsx`,
`dead-letter.preload.test.tsx`, `roles/$roleId.preload.test.tsx`, `roles/$roleId/users.preload.test.tsx`,
`roles-new.preload.test.tsx`, `$userId.preload.test.tsx`, `$userId-edit.preload.test.tsx`,
`$userId-general.preload.test.tsx`, `$userId-organizations.preload.test.tsx` — the same hover-once /
click-no-refetch assertion as Task 4 (the existing route tests keep their assertions; only add the
preload case). Run them with
`pnpm exec vitest run 'src/routes/authed/staff/audit-logs' 'src/routes/authed/staff/invitations' 'src/routes/authed/staff/jobs' 'src/routes/authed/staff/roles' 'src/routes/authed/staff/roles-new.preload.test.tsx' 'src/routes/authed/staff/staff-users' 'src/routes/authed/staff/tenant-users'`.

- [ ] **Step 1:** per route, spec + loader + page variables from the spec; the two exemptions carry
  their exact text — `// preload-exempt: enabled only while a row drawer is open` (dead-letter detail)
  and `// preload-exempt: search-as-you-type picker inside a click-opened drawer` (organizations drawer).
- [ ] **Step 2:** per route, the preload test.
- [ ] **Step 3:** gates + commit `feat(front): preload staff detail pages in their loaders (#2340)`.

---

### Task 6: Loaders for the staff tenant pages (12 routes)

**Files:**
- `routes/authed/staff/tenants/$tenantId.tsx` — `tenantDetailsQueries({ tenantId })` (details + users preview)
- `routes/authed/staff/tenants/$tenantId-edit.tsx` — `tenantEditQueries({ tenantId })`
- `routes/authed/staff/tenants/$tenantId/activity.tsx` — `tenantActivityQueries({ tenantId, search })`
- `routes/authed/staff/tenants/$tenantId/invitations.tsx` — `tenantInvitationsQueries({ tenantId, search })`
- `routes/authed/staff/tenants/$tenantId/usage.tsx` — `tenantUsageQueries({ tenantId })`
- `routes/authed/staff/tenants/$tenantId/users.tsx` — `tenantUsersQueries({ tenantId, search })`
- `routes/authed/staff/tenants/$tenantId/users/$userId.tsx` — `tenantUserQueries({ tenantId, userId })`
- `routes/authed/staff/tenants/$tenantId/users/$userId-edit.tsx` — same
- `routes/authed/staff/tenants/$tenantId/roles.tsx` — `_queries.ts` + `tenantRolesQueries({ tenantId, search })`
- `routes/authed/staff/tenants/$tenantId/roles/$roleId.tsx` — already migrated in Task 2 (add
  `useStaffTenantRoleMembersQuery`'s second call site if the preview uses different variables — it does
  not: `_use-role-details-state.ts` builds exactly the spec's `roleMembers.variables`)
- `routes/authed/staff/tenants/$tenantId/roles/$roleId/members.tsx` — `_queries.ts` +
  `roleMembersQueries({ tenantId, roleId, search })`; `// preload-exempt` on the assignment resolution
  in `_assign-members-state-hook.ts:156`
- `routes/authed/staff/tenants/$tenantId/roles/$roleId/users.tsx` — `roleUsersQueries({ tenantId, roleId, search })`

Every spec takes `tenantId: string` and reads it from `params.tenantId`. `roles.tsx` and `members.tsx`
keep their spec in a route-local `_queries.ts` because their query calls live in
`_use-roles-list-state.ts` / `_use-role-members-state.ts`; those hooks read the variables from the spec.

**Spec entries (measurement A rows 19–30 — pinned, ME2):**

| spec | entry → factory |
|---|---|
| `tenantDetailsQueries` (`$tenantId.tsx`) | `details` → `staffTenantDetailsQueryOptions`; `users` → `staffTenantUsersQueryOptions` (preview) |
| `tenantEditQueries` | `details` → `staffTenantDetailsQueryOptions` |
| `tenantActivityQueries` | `details` → `staffTenantDetailsQueryOptions`; `activity` → `tenantActivityQueryOptions` |
| `tenantInvitationsQueries` | `details` → `staffTenantDetailsQueryOptions`; `invitations` → `staffTenantInvitationsQueryOptions`; `roles` → `staffTenantRolesQueryOptions` |
| `tenantUsageQueries` | `details` → `staffTenantDetailsQueryOptions`; `usage` → `staffTenantUsageQueryOptions` |
| `tenantUsersQueries` | `details` → `staffTenantDetailsQueryOptions`; `roles` → `staffTenantRolesQueryOptions`; `users` → `staffTenantUsersQueryOptions` |
| `tenantUserQueries` (both `$userId` routes) | `details` → `staffTenantDetailsQueryOptions`; `userDetails` → `staffTenantUserDetailsQueryOptions` |
| `tenantRolesQueries` | `details` → `staffTenantDetailsQueryOptions`; `permissionCatalog` → `staffTenantPermissionCatalogQueryOptions`; `roles` → `staffTenantRolesQueryOptions` |
| `roleDetailsQueries` (Task 2) | `tenantDetails`, `roleDetails`, `permissionCatalog`, `roleMembers`, `rolePermissionKeys` — names already pinned in Task 2 |
| `roleMembersQueries` | `roleMembers` → `staffTenantRoleMembersQueryOptions`; `tenantUsers` → `staffTenantUsersQueryOptions` (assignment resolution exempt) |
| `roleUsersQueries` | `tenantDetails` → `staffTenantDetailsQueryOptions`; `roleDetails` → `staffTenantRoleDetailsQueryOptions`; `roleMembers` → `staffTenantRoleMembersQueryOptions`; `tenantUsers` → `staffTenantUsersQueryOptions` (assignment resolution exempt) |

**Tests:** the 12 `*.preload.test.tsx` files (paths above), plus one parent/child case: hovering a child
tab warms the parent's details key too (parent loader re-runs under `defaultPreloadStaleTime: 0`). Run
with `pnpm exec vitest run 'src/routes/authed/staff/tenants'`.

- [ ] **Step 1:** per route, spec + loader (+ `_queries.ts` for the two list hooks) and page variables
  from the spec; the exemption carries its exact text — `// preload-exempt: resolves the roles of user
  ids selected on the page` above `_assign-members-state-hook.ts:156`.
- [ ] **Step 2:** per route, the preload test, plus the parent/child case.
- [ ] **Step 3:** gates + commit `feat(front): preload staff tenant pages in their loaders (#2340)`.

---

### Task 7: Loaders for the three staff dashboard routes

**Files:**
- `routes/authed/staff/dashboard/index.tsx` — `dashboardOverviewQueries({ search })`: tenants counts
  (`size: 1`), latest tenants (`size: CARD_ROW_COUNT`, sort `created_at desc`, scope status), pending
  invitations (`status: 'pending'`), invitation outcomes (`size: 1`), audit (`size: 1`, `startDate`,
  `endDate`), current series, previous series, heatmap series.
- `routes/authed/staff/dashboard/reports.tsx` — `dashboardReportsQueries({ search })`: audit (2),
  series (2), top organisations.
- `routes/authed/staff/dashboard/activity.tsx` — `dashboardActivityQueries({ search })`: tenant names
  (`size: 100`), audit page.

**Spec entries (measurement A rows 3, 4, 5 — pinned, ME2):**

| spec | entry → factory |
|---|---|
| `dashboardOverviewQueries` | `counts` → `staffTenantsQueryOptions` (`size: 1`); `latestTenants` → `staffTenantsQueryOptions` (`size: CARD_ROW_COUNT`, sort `created_at desc`, status scope); `pendingInvitations` → `staffInvitationsQueryOptions` (`status: 'pending'`); `invitationOutcomes` → `staffInvitationsQueryOptions` (`size: 1`); `audit` → `staffAuditLogsQueryOptions` (`size: 1`, `startDate`, `endDate`); `series` → `staffDashboardSeriesQueryOptions` (`currentWindow`); `previousSeries` → `staffDashboardSeriesQueryOptions` (`previousWindow`); `heatmap` → `staffDashboardSeriesQueryOptions` (`heatmapWindow()`) |
| `dashboardReportsQueries` | `audit` → `staffAuditLogsQueryOptions` (`size: 1`, window); `impersonations` → `staffAuditLogsQueryOptions` (action filter); `series` → `staffDashboardSeriesQueryOptions`; `previousSeries` → `staffDashboardSeriesQueryOptions`; `topOrganisations` → `staffDashboardTopOrganisationsQueryOptions` |
| `dashboardActivityQueries` | `tenants` → `staffTenantsQueryOptions` (`size: 100`); `audit` → `staffAuditLogsQueryOptions` (paged) |

The page reads `queries.series.variables` instead of recomputing
`currentWindow`/`previousWindow`/`heatmapWindow()`. Move the window builders next to the spec (they are
inline in the route files today).

**Tests:** `dashboard/index.preload.test.tsx`, `dashboard/reports.preload.test.tsx`,
`dashboard/activity.preload.test.tsx` — hover → one fetch per distinct key; click → no refetch. Run with
`pnpm exec vitest run 'src/routes/authed/staff/dashboard'`.

- [ ] **Step 1:** per route, spec + `loaderDeps` + loader; page variables from the spec.
- [ ] **Step 2:** per route, the preload test.
- [ ] **Step 3:** gates + commit `feat(front): preload staff dashboard routes in their loaders (#2340)`.

---

### Task 8: Loaders for the tenant shell, account and settings (6 routes)

**Files:**
- `routes/authed/tenant.tsx` — `tenantPortalQueries()` warming the picker query; this is the layout
  whose loader warms the picker that `resolveWorkspaceTenantIdFromCache` reads for every child hover.
- `routes/authed/tenant/account/profile.tsx` — `accountProfileQueries({ tenantId })`
- `routes/authed/tenant/organizations.tsx` — `organizationsQueries()` (picker)
- `routes/authed/tenant/settings/general.tsx` — `tenantSettingsGeneralQueries({ tenantId })`
- `routes/authed/tenant/settings/integrations.tsx` — `tenantIntegrationsQueries({ tenantId })`
- `routes/authed/tenant/settings/workspaces.tsx` — `tenantWorkspacesQueries()` (picker)

**Spec entries (measurement A rows 34–44, tenant side — pinned, ME2):**

| spec | entry → factory |
|---|---|
| `tenantPortalQueries` (layout) | `picker` → `tenantsForPickerQueryOptions` |
| `accountProfileQueries` | `profile` → `accountProfileQueryOptions`; `picker` → `tenantsForPickerQueryOptions` |
| `organizationsQueries` | `picker` → `tenantsForPickerQueryOptions` |
| `tenantSettingsGeneralQueries` | `settings` → `tenantSettingsGeneralQueryOptions`; `picker` → `tenantsForPickerQueryOptions` |
| `tenantIntegrationsQueries` | `needsReconnect` → `needsReconnectAccountsQueryOptions`; `socialAccounts` → `socialAccountsQueryOptions`; `projects` → `tenantProjectsQueryOptions`; `picker` → `tenantsForPickerQueryOptions` (the page's `useCanManageSocialAccounts` is exempt — measurement C) |
| `tenantWorkspacesQueries` | `picker` → `tenantsForPickerQueryOptions` |

Tenant loader shape (the tenant id is not in the path):

```ts
	loader: ({ context }) => {
		const tenantId = resolveWorkspaceTenantIdFromCache(context.queryClient);
		if (tenantId === null) {
			return;
		}
		preloadRouteQueries(context.queryClient, tenantSettingsGeneralQueries({ tenantId }));
	},
```

**The `/tenant` layout has no tenant id to resolve** (MINOR 2): its only query is the
tenant-independent picker, whose factory ignores its variables, so `tenantPortalQueries` takes no args
and the loader does not call `resolveWorkspaceTenantIdFromCache` — doing so would add a dependency the
spec cannot use. The pinned shape:

```ts
// routes/authed/tenant.tsx
const tenantPortalQueries = () => ({
	picker: { options: tenantsForPickerQueryOptions, variables: {} },
});

export const Route = createFileRoute('/_authed-layout/tenant')({
	loader: ({ context }) => {
		preloadRouteQueries(context.queryClient, tenantPortalQueries());
	},
	…
});
```

`organizationsQueries` and `tenantWorkspacesQueries` follow the same rule (picker only, no args), and
their loaders use the same no-arg shape as the layout's. `accountProfileQueries`,
`tenantSettingsGeneralQueries` and `tenantIntegrationsQueries` take `tenantId: string` and use the
resolver shape above. Pages keep `useResolvedWorkspaceTenantId()` and pass `tenantId ?? ''` to the same
spec, so the variables are identical when resolved.
`routes/authed/layout.tsx` and the app-shell widgets are **not** in this task: section D's exemptions
land with the guard in Task 10. `settings/integrations.tsx:232` gets its
`// preload-exempt: session-stable permission gate mounted by the app shell, fetched once per workspace tenant`
in this task (measurement C, row 14).

**The shell picker entry (C1, measurement A).** `profile.tsx`, `settings/general.tsx` and
`settings/integrations.tsx` render the picker through `useResolvedWorkspaceTenantId`, so their specs
also declare it (the guard sees `factory lib/query/tenants-for-picker#tenantsForPickerQueryOptions`):

```ts
	picker: { options: tenantsForPickerQueryOptions, variables: {} },
```

It costs no request — the app shell already observes that query, so the helper's observer skip
(decision 5) returns before any fetch. `organizations.tsx`, `settings/workspaces.tsx` and `tenant.tsx`
call `useTenantsForPickerQuery` directly and warm the picker through their own spec entry.

**Tests:** `tenant.preload.test.tsx`, `organizations.preload.test.tsx` and
`settings/workspaces.preload.test.tsx` (cold picker cache: the loader warms the picker once);
`account/profile.preload.test.tsx`, `settings/general.preload.test.tsx` and
`settings/integrations.preload.test.tsx` (hover with the picker cache warm → each route factory fetched
once; hover with an empty picker cache → zero fetch and no error, because
`resolveWorkspaceTenantIdFromCache` returns `null`); click → the page fetches as today. Run with
`pnpm exec vitest run 'src/routes/authed/tenant'`.

- [ ] **Step 1:** per route, spec + loader + page variables; add the 14th marker above
  `settings/integrations.tsx:232` with the exact text pinned in measurement C row 14.
- [ ] **Step 2:** the six preload tests.
- [ ] **Step 3:** gates + commit `feat(front): preload tenant shell and settings in their loaders (#2340)`.

---

### Task 9: Loaders for the tenant posts routes (5 routes)

**Files:**
- `routes/authed/tenant/posts/drafts.tsx` — `postDraftsQueries({ tenantId, search })`
- `routes/authed/tenant/posts/history.tsx` — `postHistoryQueries({ tenantId, search })`
- `routes/authed/tenant/posts/queue.tsx` — `_queries.ts` + `postQueueQueries({ tenantId })`
  (`buildUpcomingPublicationWindow(new Date())`, statuses `scheduled/in_progress/paused`, size 20)
- `routes/authed/tenant/posts/calendar.tsx` — `_queries.ts` + `postCalendarQueries({ tenantId })`
  (`buildVisibleMonthWindow(new Date())`, size 100)
- `routes/authed/tenant/posts/$postId/edit.tsx` — `postEditQueries({ tenantId, postId })`;
  `// preload-exempt` on `_scheduled-rendition-editor.tsx:43` (row-selected rendition)

`queue.tsx` and `calendar.tsx` keep their spec in a route-local `_queries.ts` because the query calls
live in `_use-scheduled-publication-page.ts` / `_use-scheduled-publication-all-pages.ts`; those hooks
read `from`/`to`/`statuses`/`limit` from the spec.

**Spec entries (measurement A rows 36–40 — pinned, ME2):**

| spec | entry → factory |
|---|---|
| `postDraftsQueries` | `posts` → `tenantPostsQueryOptions`; `projects` → `tenantProjectsQueryOptions`; `publishTargets` → `tenantPublishTargetsQueryOptions`; `permissions` → `tenantPermissionsQueryOptions`; `picker` → `tenantsForPickerQueryOptions` |
| `postHistoryQueries` | `publications` → `tenantPublicationsQueryOptions`; `permissions` → `tenantPermissionsQueryOptions`; `picker` → `tenantsForPickerQueryOptions` |
| `postQueueQueries` | `scheduledPublications` → `scheduledPublicationsQueryOptions`; `picker` → `tenantsForPickerQueryOptions` |
| `postCalendarQueries` | `scheduledPublications` → `scheduledPublicationsInfiniteQueryOptions`; `picker` → `tenantsForPickerQueryOptions` |
| `postEditQueries` | `postDetails` → `tenantPostDetailsQueryOptions`; `projects` → `tenantProjectsQueryOptions`; `publishTargets` → `tenantPublishTargetsQueryOptions`; `scheduledPublications` → `scheduledPublicationsInfiniteQueryOptions` (**the infinite factory** — ME2); `permissions` → `tenantPermissionsQueryOptions`; `picker` → `tenantsForPickerQueryOptions` (rendition exempt) |

**Pinned `variables` for the infinite walk and the queue (ME1).** The spec owns the initial key —
`restartKey: 0`, never React state (decision 4) — and the first page (`cursor: undefined`):

```ts
// postCalendarQueries — calendar.tsx
scheduledPublications: {
	options: scheduledPublicationsInfiniteQueryOptions,
	variables: {
		tenantId,
		from: window.from,
		to: window.to,
		statuses: undefined,
		limit: 100,
		restartKey: 0,
	},
},

// postEditQueries — the rendition block's window
scheduledPublications: {
	options: scheduledPublicationsInfiniteQueryOptions,
	variables: {
		tenantId,
		from: scheduleWindow.from,
		to: scheduleWindow.to,
		statuses: CUSTOMIZABLE_STATUSES,
		limit: SCHEDULED_PAGE_SIZE,
		restartKey: 0,
	},
},

// postQueueQueries — the finite first page
scheduledPublications: {
	options: scheduledPublicationsQueryOptions,
	variables: {
		tenantId,
		from: window.from,
		to: window.to,
		statuses: [...QUEUE_STATUSES],
		cursor: undefined,
		limit: 20,
	},
},
```

The page hooks keep their own `restartKey` state (initial `0`) and the cursor state; the spec pins the
value a fresh mount reads, so hover and mount agree. After `restart()` the page's key is
`restartKey + 1`, a transient divergence that the mounted page owns (decision 4).

**Two extra kinds of spec entry (C1):**

- `permissions: { options: tenantPermissionsQueryOptions, variables: { tenantId } }` in
  `postDraftsQueries`, `postHistoryQueries` and `postEditQueries` — the page renders
  `useTenantPermissions(tenantId)` (`history.tsx:53`, `_publish-on-block.tsx:72`,
  `_scheduled-renditions-block.tsx:54`, `_destination-chips.tsx:31`), which the widened guard rule now
  sees as a page query. `tenantPermissionsQueryOptions` is Task 3's extraction and carries
  `staleTime: Infinity`.
- `picker: { options: tenantsForPickerQueryOptions, variables: {} }` in `postDraftsQueries`,
  `postHistoryQueries`, `postQueueQueries`, `postCalendarQueries` and `postEditQueries` — they mount the
  picker through `useResolvedWorkspaceTenantId` (directly or via `_use-tenant-post-list.ts`). Same
  zero-request declaration as Task 8: the shell observes it, the helper skips it.

**Tests:** `posts/drafts.preload.test.tsx`, `posts/history.preload.test.tsx`,
`posts/queue.preload.test.tsx`, `posts/calendar.preload.test.tsx`, `posts/$postId/edit.preload.test.tsx`
— hover warms the infinite query's first page (`{ pages, pageParams }` shape, Task 1 test 8); click
reuses it; a failing preload stays silent (reuse the Task 1 harness). Run with
`pnpm exec vitest run 'src/routes/authed/tenant/posts'`.

- [ ] **Step 1:** per route, spec + loader + page variables; extract the window builders so the spec and
  the page call the same function; the exemption carries its exact text —
  `// preload-exempt: fetches the rendition of the row selected on the page` above
  `_scheduled-rendition-editor.tsx:43`.
- [ ] **Step 2:** the five preload tests.
- [ ] **Step 3:** gates + commit `feat(front): preload tenant posts routes in their loaders (#2340)`.

---

### Task 10: Extend the loader guard to both directions over the import graph

**Files:**
- Create: `apps/front/src/lib/query/route-loader-query-key-guard.ts` (the scanner moved out of the test,
  with `routesDir` injectable)
- Modify: `apps/front/src/lib/query/route-loader-query-key-guard.test.ts` (thin: real-tree test +
  fixture tests)
- Create: `apps/front/tests/fixtures/route-loader-guard/lib/query/*.ts` (the fake factories **and** the
  fake hooks, in a path that contains `lib/query/`) and
  `apps/front/tests/fixtures/route-loader-guard/routes/**` (the fixture route files, which import the
  fakes **relatively**: `import { fakeStaffUsersQueryOptions, useFakeStaffUsersQuery } from
  '../lib/query/fake-staff-users'`).
  **Why this resolves (M4):** the module filter becomes `modulePath.includes('lib/')` — widened from
  `isQueryModule`'s `'lib/query/'` (`guard.test.ts:285`) so `lib/permissions` wrappers are resolved too
  (rule 3(b), round 3) — and `resolveModuleFile` (`:351–400`) computes a relative import's `modulePath`
  as `path.relative(srcDir, candidate)` with the real `srcDir = apps/front/src`. A fake at
  `tests/fixtures/route-loader-guard/lib/query/fake-staff-users.ts` therefore resolves to
  `../tests/fixtures/route-loader-guard/lib/query/fake-staff-users` — it contains `lib/`, so both
  the page-side hook mapping and the loader-side `options:` binding check accept it. Only `routesDir` is
  injected; `srcDir` stays real (so `~/lib/query/*` keeps resolving to the production modules).
- Modify: `apps/front/tsconfig.json` — `exclude` gains `"tests/fixtures/route-loader-guard/**"` (these
  are deliberately invalid route trees: `createFileRoute` with paths that are not in the generated route
  tree cannot typecheck, and `noUnusedLocals` would fight the fixtures). **Narrow on purpose:** the
  existing `tests/fixtures/1784/_repro-1784-throws-assertion-error.test.ts` stays in the typecheck
  program (it is a valid file used by `classify-proof.test.ts`). The fixtures sit outside `src`, so the
  src-walking guards (`check-design-system`, `check-utility-boundaries`) never read them, and
  `check-typecheck-coverage` pins only the files it lists.
- Modify: `apps/front/src/lib/query/route-loader-query-key-guard.test.ts` — **delete**
  `isPreloadCallee` (Task 2), `collectStrictModeOpaqueCalls`, and the Task-2 stand-in counter
  (`callsPreloadRouteQueries`, `routesWithPreloadSpecs`, and its `routesWithLoaderKeys +
  routesWithPreloadSpecs` canary `+` term), and remove `'preloadRouteQueries'` from
  the allowlist: rule 5 below resolves the helper's argument instead of skipping it.

**Algorithm (in the module):**

1. Route set: files under `routesDir` declaring `createFileRoute` whose first argument **starts with
   `/_authed-layout`** (no trailing slash — this includes the layout route `'/_authed-layout'` itself).
   Fixtures use the same prefix.
2. **Page file set**: the route file plus every relative import under `routes/`, transitively, stopping
   at any file that declares `createFileRoute` and at every non-relative import. Resolve `.ts`/`.tsx`
   and `index.*` as today. **For the layout route only**, the page set also includes the pinned
   app-shell files: `components/app-shell/user-menu.tsx`, `components/app-shell/app-shell.tsx`,
   `components/app-shell/_needs-reconnect-banner.tsx`, `lib/navigation/entity-crumb.tsx`,
   `routes/__root.tsx` (section D).
3. **Page keys** — two collectors, both fail-loud:
   (a) direct `useQuery` / `useSuspenseQuery` / `useInfiniteQuery` calls — so `DIRECT_QUERY_HOOKS`
   **gains `useInfiniteQuery`** — resolve the `queryKey` with the existing `extractIdentity`, error on an
   unresolvable shape.
   (b) **every called `lib/**` binding, whatever its name** (no `QUERY_HOOK_NAME_PATTERN` filter —
   C1). "Called" means a call expression **or a JSX element** (`<EntityCrumb />` counts). A binding
   whose module is **itself a pinned page file** (section D: `lib/navigation/entity-crumb.tsx`) is
   skipped here, because collector (a) already scans that file directly and its marker sits there
   (round 4). For every other binding: resolve the binding's exported declaration in its module and collect **every** `useQuery` /
   `useInfiniteQuery` call it reaches — **following same-module local calls and imported `lib/**`
   hook bindings** (a visited set, depth ≤ 3), so a wrapper like
   `useTenantSurfacePermissions → useScopeAuthDataQuery`,
   `useResolvedWorkspaceTenantId → useTenantsForPickerQuery` and
   `useCanManageSocialAccounts → useTenantScopedAuthDataQuery` (`lib/permissions`, round 3) cannot be a
   silent blind spot. Each reached
   query hook maps through `extractIdentity`; an unmappable one returns `{ hasQuery: true, error }`
   (never a silent `hasQuery: false`). A binding that reaches no query hook (a mutation, a key helper,
   an invalidator) is legitimately ignored. Every identity is recorded with its `file:line`, spelled
   with `normalizeSpecifier(binding.module)` (the import specifier), **not** `resolveModuleFile`'s
   `modulePath`, so the hook side and the loader side produce the same string even for a relative
   import.
4. **Exemptions**: the marker is always read **in a page file, at the call the page file makes** —
   for collector (a) the direct query call, for collector (b) the `lib/**` binding call (or JSX
   element) in the page file, **never** at the query reached inside the `lib/**` module (round 4).
   Before recording a call, read the leading comment ranges of the call's **enclosing
   statement** — climb from the call to the nearest `ts.Statement` ancestor and call
   `ts.getLeadingCommentRanges(sourceFile.text, statement.getFullStart())`; the call node's own
   `getFullStart()` carries no comment when the call is nested in `const x = …` / `return …` (M1,
   verified with the installed `ts-morph@28`). Match `preload-exempt:` in each range; empty reason ⇒
   violation; record the marker's `pos` as consumed; **skip the call entirely** (no key resolution) so
   an exempt dynamic key is legal. After the walk, every `preload-exempt` occurrence in the page files
   that was not consumed ⇒ "stale exemption" violation naming `file:line`.
5. **Loader keys**: resolve the loader as today. Find the `preloadRouteQueries(` call. Its second
   argument must be a call to a spec function; resolve that identifier to a local or imported
   declaration; collect every `options:` property initializer of the object literal(s) the function
   returns (`return {…}` or `=> ({…})`). Each initializer must be an identifier bound to a `lib/query/*`
   module (or a factory declared in that module); its identity is
   `factory ${normalizeSpecifier(binding.module)}#${binding.exportedName}` — the exact string the page
   side's `extractIdentity` produces for `xxxQueryOptions.queryKey(...)` over the same import. Anything
   else (conditional, call, member expression) is a violation. Keep the existing
   `queryClient.query/ensureQueryData/prefetchQuery/fetchQuery` collection for any legacy loader. A
   route with no loader contributes no keys (the layout route is the only one).
6. **Both directions**: `loaderKeys ⊆ pageKeys` (old rule, message unchanged) and
   `pageKeys \ exemptions ⊆ loaderKeys` — message:
   `« <route>:<line>: the page renders query <factory> but the route loader never warms it — add it to the
   route's query spec or mark the call with « // preload-exempt: <reason> » (#2340) »`.
7. Any unresolvable shape is a violation naming the file — never a silent pass. Self-check: at least one
   authed route and one loader key resolved.

**Fixtures (red/green proof):** `lib/query/fake-staff-users.ts` (exported `fakeStaffUsersQueryOptions` +
`useFakeStaffUsersQuery` delegating to it) and `routes/good.tsx`, `routes/missing-warm.tsx`,
`routes/orphan-warm.tsx`, `routes/exempt-with-reason.tsx`, `routes/exempt-no-reason.tsx`,
`routes/stale-exempt.tsx`, `routes/unresolvable-key.tsx`, `routes/child-route.tsx` (proves the walk stops
at a child route and does not attribute the child's query to the parent). The test asserts the exact
violation set per fixture — a green fixture must produce `[]`.

**Admission evidence for the PR body** (the six conditions): (1) current reproducible failure: a route
with a page query and no loader passes today (44 routes measured, 43 unguarded); (2) invariant: the
owner-mandated perceived-speed contract, public UI behaviour; (3) no simpler tool: an oxlint rule cannot
resolve a loader's spec call across modules, and the old guard only checked one direction; (4) smallest
mechanism: the existing scanner, one new direction + comment parsing, no new dependency; (5) red/green
fixtures above; (6) retirement condition: the guard retires when TanStack Router can express
"preload every query a route renders" natively, or when the loaders move to a generated manifest.

- [ ] **Step 1:** move the scanner to the module, inject `routesDir`, delete the Task-2 `isPreloadCallee`
  allowlist, `callsPreloadRouteQueries`, `routesWithPreloadSpecs` and its `routesWithLoaderKeys +
  routesWithPreloadSpecs` canary (`+`) term, and `collectStrictModeOpaqueCalls`, add the layout route +
  app-shell page set, add the
  **seven** section-D `preload-exempt` comments (`user-menu.tsx:43`, `entity-crumb.tsx:38`,
  `__root.tsx:604`, `app-shell.tsx:186`, `app-shell.tsx:197`,
  `_needs-reconnect-banner.tsx:17`, `_needs-reconnect-banner.tsx:18`), and keep the real-tree test
  green with the current (Task 1–9) tree.
- [ ] **Step 2:** add the `tests/fixtures/route-loader-guard/lib/query/*.ts` + `routes/**` files and the
  narrowed `tsconfig.json` exclude; add the eight fixture assertions; run them with the design-guards
  config (the default `vitest.config.ts` excludes this suite and would silently skip it):
  `pnpm exec vitest run --config vitest.design-guards.config.ts src/lib/query/route-loader-query-key-guard.test.ts`
  — `missing-warm`, `orphan-warm`, `exempt-no-reason`, `stale-exempt`, `unresolvable-key` must fail with
  the named message, `good`, `exempt-with-reason`, `child-route` must produce `[]`.
- [ ] **Step 3:** run the real-tree guard: zero violations, and the exemption inventory equals the
  **14 sites** of measurement C (the workspace picker is declared by the eight tenant specs, not
  exempted). Then `pnpm --filter front typecheck` (proves the fixtures are out of the program while the
  `1784` fixture stays in it).
- [ ] **Step 4:** gates + commit `feat(front): guard every page query is preloaded by its route loader (#2340)`.

---

### Task 11: Delete `publy/route-query-preload`, rewrite the conventions

**Files:**
- Delete: `packages/lint-ts/src/publy/route-query-preload.ts`,
  `route-query-preload.test.ts`, `route-query-preload.exemption.test.ts`
- Modify: `packages/lint-ts/src/index.ts` (import l.52, map entry l.75)
- Modify: `.oxlintrc.json` (l.77 `"publy/route-query-preload": "warn"`)
- Modify: `docs/guides/lint-rules.md` (delete the `### publy/route-query-preload` section, l.103–114)
- Modify: `apps/front/src/routes/authed/staff/_staff-list-team.tsx` (remove the two
  `// oxlint-disable-next-line publy/route-query-preload` lines; keep the `preload-exempt` ones)
- Modify: `docs/guides/front/conventions.md` §"Client route loaders (#851)" (l.332–355) → rewrite as
  **"Route data preload (#2340)"**: the helper, the spec, `defaultPreloadStaleTime: 0`, fire-and-forget,
  the silent failure, the `meta.routePreload` + observer-count rule, **the helper's own
  observer skip and the per-factory `staleTime` (only when declared)**, the `preload-exempt` syntax
  (enclosing statement,
  comment order with the retired lint directive) and the **fourteen** current exemptions, the shell
  picker declared by the eight tenant specs, the cursor first-page limit and the infinite `restartKey`
  limit, the guard, its two directions, its `lib/**`-binding rule (every binding that reaches a query
  hook, not only `*Query` names) and its app-shell page set. Cross-reference
  `docs/records/2026-11-08-spec-query-display-and-preload.md`.
- Modify: `docs/guides/lint-rules.md` intro list if it names the rule elsewhere.

- [ ] **Step 1:** delete the rule + its two specs, remove the registration and the oxlint config entry.
- [ ] **Step 2:** `just lint` on the whole repo: zero unknown-rule diagnostics, zero
  `route-query-preload` references left (`git grep route-query-preload` empty outside `docs/records/`).
- [ ] **Step 3:** rewrite the conventions section; re-read it against the code (helper name, spec shape,
  exemption syntax, guard path).
- [ ] **Step 4:** gates + commit
  `chore(front): delete the dead route-query-preload rule and document route preload (#2340)`.

---

## Final gate (captain, before the PR leaves draft)

`just lint`, `pnpm --filter front typecheck`, `pnpm --filter front test`,
`pnpm exec vitest run --config vitest.design-guards.config.ts src/lib/query/route-loader-query-key-guard.test.ts`,
`just react-doctor`, `just knip`, then:
- the guard test run on the real tree, with the violation count and the exemption list pasted in the PR;
- a hover-vs-click capture on three routes (one staff list, one staff detail, one tenant page) showing
  the request starts on hover and the page paints without a skeleton on click;
- the six bespoke-guard admission conditions, the temporary Task 2 allowlist note, the cursor limit and
  the infinite `restartKey` limit, and the two hover-safety rules (observer skip + per-factory
  `staleTime` only when declared) stated in the PR body.

## Self-review

- Spec §4.2.1 → Tasks 4–9 (every authed route of measurement A) + section D (app shell). §4.2.2 →
  Tasks 1–2. §4.2.3 → Task 1. §4.2.4 → Task 1. §4.2.5 → Task 10 (page keys include every `lib/query`
  binding that reaches a query hook — C1). §4.2.6 → measurement C + Task 10. §4.2.7 → Task 1 test 3.
  §4.2.8 → Task 11. §5 → Task 10. §7.1 → measurement A scope. §7.2 → section D + Task 10 step 1.
  §7.3 → Task 2 shape + every route task. §7.4 → Task 3 (six inline-key factories, incl. the C1
  `tenantPermissionsQueryOptions`). §7.5 → Task 10 rule 4 + Task 3 step 4 (comment order). §8 → Task 1
  decision 5 (observer skip + backstop) + tests 4/5. §9 → decisions.
- Review round 2: C1 → Task 3 (`tenantPermissionsQueryOptions`) + Task 9 (`permissions` entries) +
  Task 10 rule 3(b) + section D (`app-shell.tsx`). M1 → Task 10 rule 4 + Task 3 step 4. M2 → Task 1
  (`staleTime` on the factory) + Task 3 (session-stable factories). M3 → Task 1 (observer skip) + test 5.
  M4 → Task 10 Files (fixtures under `lib/query/`). ME1 → Task 3 Interfaces. ME2 → measurement A rows +
  section D.
- Review round 3: C1 → Task 1 helper (conditional `staleTime` spread) + test 2 + decision 6 + Verified
  snippets. M1 → section D + measurement A banner note + measurement C (14 sites) + Task 8
  (`integrations.tsx:232`) + Task 10 rule 2/3(b)/step 1/step 3. ME1 → decision 4 + Task 3 + Task 9
  pinned `variables`. ME2 → the per-spec entry tables in Tasks 4–9. MINOR 1 → every count updated.
  MINOR 2 → Task 8 layout loader shape (`tenantPortalQueries()`). MINOR 3 → `RouteQuerySpecArgs` dropped.
- Accepted deviations: the cursor stays out of URL state (decision 4); `$roleId` is the pilot because it
  is the only existing loader; the old guard's opaque-call heuristic is loosened once in Task 2 for the
  helper/spec convention and deleted in Task 10.
- Not covered here: #2341 (merged), API speed, anonymous SSR pages, cursor-in-URL.

## Captain's calls on the open questions (2026-11-09, revised after reviews H/M and round 3)

1. Cursor stays in React state: loaders warm the first page of the current filter / sort / size only. A stated limit, not an exemption.
2. Infinite queries are warmed through the helper's `infiniteQuery` branch (no exemption for the calendar and queue), with `pageParam` pinned to `unknown` in the extracted fetcher and one re-typing assertion at the call.
3. `/tenant/*` with a cold picker cache: the loader warms nothing and never awaits the picker (fire and forget, spec §4.2.2).
4. `$roleId.loader-revalidation.test.tsx` is replaced by `$roleId.preload.test.tsx`.
5. The Task-2 allowlist loosening (`isPreloadCallee`) is accepted, is one edit for the whole plan, and is deleted in Task 10.
6. The `_staff-list-team.tsx` counter keeps a `preload-exempt` comment with its reason (spec §7.5).
7. `useCurrentUserQuery` on the **auth** surface stays out of scope; the **authed** shell's call is covered by section D.
8. The `/_authed-layout` route gets no loader: its data is session-stable shell chrome, covered by seven named exemptions (section D, including the needs-reconnect banner's two calls), and it joins the guard's route set.
9. §8 is enforced by two rules: the helper **never warms a query that already has observers** (M3), and the backstop skips `meta.routePreload` only while the count is 0 — the click's 401 always logs out, including while the preload is still pending.
10. Session-stable factories (`staleTime: Infinity`) carry their `staleTime` through the spec/factory so a hover never refetches them (M2); the QueryClient default would refetch after 30 s.
11. The guard's page set is **every** called `lib/**` binding that reaches a query hook, following same-module local calls and imported `lib/**` hooks — not only `*Query`-named hooks (C1). `useTenantPermissions` is warmed by the three posts specs; `useTenantSurfacePermissions`, the shell's `useResolvedWorkspaceTenantId` and the banner's two calls are exempt (section D); the picker is declared by the eight tenant specs.
12. The exemption marker is read from the **enclosing statement's** leading comments, and an exempt call is skipped before key resolution (M1). Where the old lint disable still exists, the marker goes above it.
13. The guard's fixtures are real files under `tests/fixtures/route-loader-guard/lib/query/**`, imported relatively so the module filter (a path check, `lib/` after round 3) recognises them (M4).
14. The helper passes a factory's `staleTime` **only when the factory defines it** (conditional spread), so the QueryClient default applies otherwise (C1).
15. The shell's needs-reconnect banner is an app-shell widget: `_needs-reconnect-banner.tsx` joins the pinned layout page set and its two query sites are named exemptions (M1). The same `lib/permissions` gate on `settings/integrations.tsx:232` is exempt too — the widened `lib/**` binding rule now sees it, and §7.4 does not extract a factory for its inline key.
16. The infinite spec owns the initial key (`restartKey: 0`), stated next to the cursor limit (ME1); Tasks 4–9 list each spec's entry names from measurement A (ME2).

## Verified snippets (typechecked, then deleted)

The helper, the backstop signature and the infinite-query cast were checked with
`tsc --noEmit --strict` against the installed `@tanstack/react-query@5.105.1` /
`@tanstack/query-core@5.105.1` types in a scratch file under `.reports/` (deleted after the check):
- `RouteQueryOptions<never>` accepts a concrete `buildStaffQueryOptions` result; `<unknown>` does not.
- `RouteInfiniteQueryOptions<never>` accepts a concrete infinite factory (fetcher `pageParam: unknown`,
  `getNextPageParam(lastPage: Response[], …)`).
- `queryClient.infiniteQuery({ …, getNextPageParam: options.getNextPageParam as GetNextPageParamFunction<unknown, unknown> })`
  compiles; without the assertion it is `TS2322` (`unknown` not assignable to `never`), which is why the
  assertion is pinned here.
- `new QueryCache({ onError: handleAuthedQueryError })` still compiles with
  `AuthedErrorBackstopSource` widened by `getObserversCount?: () => number`.

The M2/M3/C1 additions were verified against the installed source rather than re-typechecked (this pass
runs no build): `queryClient.query()` honours `staleTime` (`queryClient.js:406–412`), but
`defaultQueryOptions` spreads the caller's options **last** (`queryClient.js:675-683`), so an explicit
`staleTime: undefined` overwrites the client default and `isStaleByTime(undefined)` falls back to `0`
(`query.js:238-246`) → every warm hover refetches. The helper therefore omits the property; Task 1
test 2 pins the client default and the cache entry's resolved `staleTime`. `Query.fetch`
replaces the query's options with the passed ones (`query.js:78–83`, and returns an in-flight retryer's
promise first at `:351–359`), `Query.getObserversCount()` is public (`query.js:319`), and
`queryCache.find({ queryKey, exact: true })` is the lookup the helper uses. `AbortSignal` is in the DOM
lib the front tsconfig already includes.
