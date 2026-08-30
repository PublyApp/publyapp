# Plan — #1556: expose the total of cursor-paginated lists (`includeTotalCount`)

- **Issue**: #1556 (`Closes #1556`)
- **Part of**: #282 (continuation of #1549)
- **Branch**: `lane/wt-1556` (on `develop` `91d5539fe`, clean tree)
- **Deliverable**: this plan + PR to `develop` stating `Closes #1556` and `Part of #282`.
- **Writing model**: `tencent/hy3:free` (Nous Portal, effort high). Heavy file via
  `~/ai-orchestration-playbook/tools/heavy.sh`. No local e2e (CI front-e2e 4/4).
  No sub-agents (`opencode`/`claude`/`codex` blocked, exit 86).

## Applied decision (owner arbitration, 2026-08-26)

The total travels **in the same list response**, calculated on demand via the query
flag **`includeTotalCount`** (default `false`). No separate counting endpoint. If
`includeTotalCount=true`, the response carries `totalCount`; otherwise the field is **absent** —
the "unknown total" state remains reachable, but only when the client chose not to request it
(never by contract default). Rows and total are derived from **the same filter specification**
(a single predicate builder consumed by both queries), which makes drift structurally impossible.

> No measured objection contradicts this decision. The only real cost (audit log count) is
> addressed in the "Counting cost" section; it remains acceptable, measured in a dedicated
> section, not estimated.

## Endpoint mapping (re-verified against `91d5539fe`)

The census `.dump/recensement-282.md` was written against `198a6e4b7`. Re-verified against the
current tip: **no new cursor surface has appeared**, and the two `CursorPaginatedResult` types
not consumed by the front (`SystemNotices`, `SocialAccounts`) remain out of scope (no front route
calls them — `git grep` confirmed it). The **10 endpoints to cover** (the 11 from the census
minus the assignment drawer, settled in the "Cases to settle" section):

| # | Endpoint (route) | Handler (file:symbol) | Service (file:symbol) | Request DTO | Response DTO | Predicate sharing point (filter, pre-cursor) |
|---|---|---|---|---|---|---|
| 1 | `GET /staff/audit-logs` | `apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs:FindAuditLogs` | `apps/api/Modules/AuditLogs/Services/AuditLogQueryService.cs:AuditLogQueryService.FindAsync` | `FindAuditLogsQuery` (`CursorPaginatedQuery`) | `FindAuditLogsResponse : CursorPaginatedResult<AuditLogListItem>` | `ApplyFilters(query, …)` on `BaseQuery()` → `query`; `COUNT` on this `query`, before `handler.ApplyFilter` |
| 2 | `GET /staff/tenants` | `apps/api/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:FindTenantsAsStaff` | `apps/api/Modules/Tenants/Services/TenantAsStaffService.cs:FindTenantsAsStaffAsync` | `FindTenantsAsStaffQuery` (search, status) | `FindTenantsAsStaffResponse : CursorPaginatedResult<TenantAsStaffListItem>` | `baseQuery` after `Where(t => search)` / `Where(t => statuses.Contains)`; `COUNT` before `handler.ApplyFilter` |
| 3 | `GET /staff/profiles` | `apps/api/Modules/Profiles/Handlers/Staff/FindStaffProfiles.cs:FindStaffProfiles` | `apps/api/Modules/Profiles/Services/StaffProfileQueryAsStaffService.cs:FindStaffProfilesAsync` | `FindStaffProfilesQuery` | `FindStaffProfilesResult : CursorPaginatedResult<StaffProfileItem>` | `query` after `query.Where(p => …)`; `COUNT` before `handler.ApplyFilter` |
| 4 | `GET /staff/users` | `apps/api/Modules/Users/Handlers/Staff/FindStaffUsers.cs:FindStaffUsers` | `apps/api/Modules/Users/Services/StaffUserQueryService.cs:FindStaffUsersAsync` | `FindStaffUsersQuery` | `FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem>` | `query` after filters; `COUNT` before `handler.ApplyFilter` |
| 5 | `GET /staff/invitations` | `apps/api/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs:FindStaffInvitations` | `apps/api/Modules/Invitations/Services/InvitationQueryService.cs:FindStaffInvitationsAsync` | `FindStaffInvitationsQuery` | `FindStaffInvitationsResult : CursorPaginatedResult<InvitationListItem>` | `query` after `Where(inv => Scope==Staff && …)`; `COUNT` before `handler.ApplyFilter` |
| 6 | `GET /staff/tenants/{tenantId}/users` | `apps/api/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:FindTenantUsersAsStaff` | `apps/api/Modules/Users/Services/TenantUserQueryService.cs:FindTenantUsersAsync` | `FindTenantUsersAsStaffQuery` | `FindTenantUsersAsStaffResponse : CursorPaginatedResult<TenantUserItem>` | `query` after filters; `COUNT` before `handler.ApplyFilter` |
| 7 | `GET /staff/tenants/{tenantId}/invitations` | `apps/api/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs:FindInvitationsForTenantAsStaff` | `apps/api/Modules/Invitations/Services/InvitationQueryService.cs:FindTenantInvitationsAsync` | `FindInvitationsForTenantAsStaffQuery` | `FindInvitationsForTenantAsStaffResult : CursorPaginatedResult<StaffTenantInvitationListItem>` | `query` after tenant filters; `COUNT` before `handler.ApplyFilter` (tenant variant) |
| 8 | `GET /staff/tenants/{tenantId}/profiles` | `apps/api/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs:FindTenantProfilesAsStaff` | `apps/api/Modules/Profiles/Services/TenantProfileQueryAsStaffService.cs:FindTenantProfilesAsync` | `FindTenantProfilesAsStaffQuery` | `FindTenantProfilesAsStaffResult : CursorPaginatedResult<TenantProfileItem>` | `query` after `Where(p => …)`; `COUNT` before `handler.ApplyFilter` |
| 9 | `GET /staff/tenant-users/{userId}/companies` | `apps/api/Modules/Users/Handlers/Staff/FindTenantUserCompaniesForStaff.cs:FindTenantUserCompaniesForStaff` | `apps/api/Modules/Users/Services/TenantUserCompanyQueryService.cs:FindTenantUserCompaniesForStaffAsync` | `FindTenantUserCompaniesForStaffQuery` | `FindTenantUserCompaniesForStaffResult : CursorPaginatedResult<TenantUserCompanyForStaffResult>` | `query` after filters; `COUNT` before `handler.ApplyFilter` |
| 10 | `GET /posts` | `apps/api/Modules/Posts/Handlers/Tenant/FindPostsForTenant.cs:FindPostsForTenant` | `apps/api/Modules/Posts/Services/PostService.cs:FindForTenantAsync` | `FindPostsForTenantQuery` | `FindPostsForTenantResponse : CursorPaginatedResult<PostListItem>` | `query` after `Where(p => ILike(…))`; `COUNT` before `handler.ApplyFilter` |

> Explicitly settled cases (dedicated section, not glossed over):
> - **Member assignment drawer** (`_assign-members-table.tsx`, cursor):
>   argued exclusion (reuses endpoint #6 as a subset; see section).
> - **Connected integrations** (`settings/integrations.tsx`): no real paginator
>   (`hasNextPage:false` hardcoded) — argued exclusion.

## Symbol proof and line numbers (quotation)

All quotations above are **symbol names + paths on the `develop` tip `91d5539fe`**,
verifiable via `git grep -n` (no line numbers on in-flight branches). The full proof
(`git show … | sed -n` outputs) is logged in `.dump/citations-r1.md` as work progresses;
no commit is made while any line there reads `FAIL`.

Independent re-verification at delivery time (`lane/wt-1556` tree aligned on `origin/develop`
`91d5539fe`) — **12 PASS / 0 FAIL** (10 endpoints + audit `ApplyFilters` + `ApplyFilter@206`) — via `git grep -n`:

| # | Symbol / anchor | Proof `git grep -n` (on `origin/develop`) |
|---|---|---|
| 1 | `FindAuditLogs` (+ `ApplyFilters` l.406, `handler.ApplyFilter` l.206) | `git grep -n "public sealed class FindAuditLogs" origin/develop -- apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`; `git grep -n "private static IQueryable<AuditLog> ApplyFilters" origin/develop -- apps/api/Modules/AuditLogs/Services/AuditLogQueryService.cs`; `git grep -n "handler.ApplyFilter" origin/develop -- apps/api/Modules/AuditLogs/Services/AuditLogQueryService.cs` |
| 2 | `FindTenantsAsStaffAsync` + search/status filters (l.409/416), `ApplyFilter` (l.425) | `git grep -n -e "ILike(t.Name" -e "statuses.Contains(t.Status)" -e "handler.ApplyFilter(baseQuery" origin/develop -- apps/api/Modules/Tenants/Services/TenantAsStaffService.cs` |
| 3 | `FindStaffProfilesAsync` + `ILike(p.Name)` (l.328), `ApplyFilter` (l.351) | `git grep -n -e "ILike(p.Name" -e "query = handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Profiles/Services/StaffProfileQueryAsStaffService.cs` |
| 4 | `FindStaffUsersAsync` + filters (l.441), `ApplyFilter` (l.464) | `git grep -n -e "from ua in query" -e "query = handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Users/Services/StaffUserQueryService.cs` |
| 5 | `FindStaffInvitationsAsync` + `Scope == InvitationScope.Staff` (l.338), filters (l.342), `ApplyFilter` (l.357) | `git grep -n -e "Scope == InvitationScope.Staff" -e "query = query.Where(inv" -e "handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Invitations/Services/InvitationQueryService.cs` |
| 6 | `FindTenantUsersAsync` + filters (l.417–446), `ApplyFilter` (l.458) | `git grep -n -e "EF.Functions.ILike(ua.User.FirstName" -e "query = query.Where(ua => levels.Contains" -e "query = handler.ApplyFilter(" origin/develop -- apps/api/Modules/Users/Services/TenantUserQueryService.cs` |
| 7 | `FindTenantInvitationsAsync` + `Scope == InvitationScope.Tenant && TenantId` (l.459) | `git grep -n -e "Scope == InvitationScope.Tenant" origin/develop -- apps/api/Modules/Invitations/Services/InvitationQueryService.cs` |
| 8 | `FindTenantProfilesAsync` + `ILike(p.Name)` (l.318), `IsDefault` (l.324), `ApplyFilter` (l.333) | `git grep -n -e "ILike(p.Name" -e "query = query.Where(p => p.IsDefault" -e "query = handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Profiles/Services/TenantProfileQueryAsStaffService.cs` |
| 9 | `FindTenantUserCompaniesForStaffAsync` + `ILike(row.Tenant.Name)` (l.392), `ApplyFilter` (l.422) | `git grep -n -e "ILike(row.Tenant.Name" -e "query = handler.ApplyFilter(" origin/develop -- apps/api/Modules/Users/Services/TenantUserCompanyQueryService.cs` |
| 10 | `FindForTenantAsync` + `TenantId == tenantId` (l.253), `ILike` (l.260), `ApplyFilter` (l.273) | `git grep -n -e "p.TenantId == tenantId" -e "EF.Functions.ILike(" -e "query = handler.ApplyFilter(" origin/develop -- apps/api/Modules/Posts/Services/PostService.cs` |

Cross-cutting anchors verified:
- `CursorPaginatedResult<T>` (`apps/api/Lib/CursorPaginatedResult.cs:7`) and `CursorPaginatedQuery`
  (`apps/api/Lib/CursorPaginatedQuery.cs:5`) exist and are the base the DTOs inherit from.
- Front: `apps/front/src/components/table/data-table.tsx` exposes `DataTableCursorFooter` with
  `totalCount?: number | null` (l.114) and the `range-of-counted` branch (l.169) — the footer
  already handles absent `totalCount` as "unknown".
- Section 6a: `apps/front/src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_assign-members-table.tsx` exists.
- Section 6b: `apps/front/src/routes/authed/tenant/settings/integrations.tsx` carries
  `hasNextPage: false` (l.300) — confirming no real cursor paginator is in place.
- Out of scope — corrected verification (delivery re-read): `SystemNotices` has **no** front
  route calling it (only a wire test `folded-body-wire.test.tsx` references `SystemNotice`).
  `SocialAccounts` **is** consumed by a front route
  (`apps/front/src/routes/authed/tenant/settings/integrations.tsx`, via `useSocialAccountsQuery`
  returning `CursorPaginatedResult<SocialAccountListItem>`), but that route renders it **non-paginated**
  (`hasNextPage:false` hardcoded, see section 6b). So there is no cursor surface on which to expose
  `totalCount`: the #1556 out-of-scope decision holds. Only the "no front route calls them" rationale
  from the original plan was inaccurate for `SocialAccounts` (it holds for `SystemNotices`) —
  flagged here rather than disguised.

- **Route label correction (delivery re-read)**: two routes on the endpoint map (inherited from
  the original plan) were wrong and have been corrected:
  - **#9** was `GET /staff/tenant-users/{userId}/organizations` → actually
    `GET /staff/tenant-users/{userId}/companies` (endpoint is `FindTenantUserCompaniesForStaff`,
    `Routes.Users.ForTenantUsersAsStaff.FindCompanies = "/{userId}/companies"`).
  - **#10** was `GET /tenant/posts/drafts` → actually `GET /posts` (the tenant group has **no**
    `/tenant` prefix, `Routes.Tenant.Root = "/"`; `Posts.ForTenant.Root = "/posts"`,
    `Find = "/"`, and no `drafts` segment exists in the Posts module).
  The handler/service symbols for both were correct; only the route labels were wrong. The
  handlers remain valid (verified by `git grep` on `origin/develop`).

## 2. Anti-drift: the heart of the work

### Structural principle

For each endpoint, **rows and total share the same filtered `IQueryable`** up to the point
where the cursor applies. Concretely:

1. We build `filteredQuery` = base + all list filters (search, status, dates,
   scope, tenant…). This is the **single sharing point**.
2. Total = `await filteredQuery.CountAsync(ct)` — **never** a `Take`, never a
   cursor `ApplyFilter`, never a join projection.
3. Rows = `filteredQuery` → `handler.ApplyFilter(filteredQuery, cursorValue, isAsc)` →
   `Take(limit+1)` → projection → `ToListAsync`.

Thus the total and rows are derived from the **same `filteredQuery` expression tree**. Any future
evolution of a filter propagates to both. Drift becomes impossible *by construction*, not by
surveillance.

### The anti-drift test (queries the real artifact, not a form)

The dominant defect in this repo is a guard that reads a *form* (regex on code, model
descriptor) instead of the *real executed content*. The test below queries the **real service**
(`IAuditLogQueryService.FindAsync` executed against the Testcontainers test database), so it goes
red if the two queries take a different filter path.

**Specification (one test per endpoint, identical pattern) — example on audit log #1:**

- Seed N rows with a discriminating filter (e.g. `Action = "LOGIN"` on K<N of them,
  plus other actions).
- Call `FindAsync(args with includeTotalCount:true)`.
- `result` is `Success`.
- `result.Data.Data.Count` = `min(limit, K)` (rows respect the filter).
- `result.Data.TotalCount` = `K` (total respects the **same** filter).
- **Drift assertion**: `result.Data.TotalCount` == number of entities in the database that
  satisfy `filteredQuery` *as executed*. We do not compare to a guessed constant: we replay the
  same `IQueryable` via the service at `limit = int.MaxValue` and count — the two must be equal.
  If the total used a different filter path (e.g. forgetting the `actions` filter), `TotalCount`
  would diverge from this recount and the test would go red.

The test lives in each handler's `.Spec.cs` (co-located, `*.Spec.cs`), uses the existing
`ApiFixture` (Testcontainers Postgres), and calls `FindAsync` directly — not a mock and not a
source regex.

### Adversarial mutation (the right one)

To prove the test *catches* the bug and is not a colander, we apply the following mutation
**on a temporary local copy** during review (never committed):

- **Bad mutation**: "remove the sharing" (rewrite the total with an independent query). It breaks
  the structure but proves nothing about the *filter*.
- **Good mutation**: "add an *extra* filter on the rows query only" (e.g.
  `query = query.Where(a => a.Action == "LOGIN")` after the sharing point, just before the
  `Take`). The total stays computed on `filteredQuery` (without that filter), so `TotalCount !=
  count of filtered rows` → the drift test goes red. This is exactly the silent bug the owner
  wants to forbid (a total that does not match the displayed rows).

Each endpoint carries its own anti-drift `.Spec.cs`; the adversarial mutation is replayed on
a witness endpoint during review to confirm the net works.

## 3. Real counting cost on the audit log (measured, not estimated)

> The measurement is executed via `heavy.sh` on a Testcontainers database seeded with 5000 audit
> rows, comparing `FindAsync` (rows only) and a `COUNT(*)` on the filtered query (`AsNoTracking`
> + `!IsDeleted`, without `Take`, without `ApplyFilter`, without join projection — the exact
> total path). Output pasted in `.dump/measure-audit-count.md` and recalled here:

```
Passed PublyApp.Api.Modules.AuditLogs.Handlers.Staff.BenchmarkCountCostSpec.MeasureAuditLogCountCost [27 s]
BENCH rows=5000 lines_only_avg_ms=18.8 exact_count_avg_ms=4.6 count_overhead_ms=4.6
```

**Measurement and conclusion**: the exact `COUNT(*)` on 5000 audit rows costs **~4.6 ms**,
roughly **24%** of the cost of a rows-only page (18.8 ms, which carries the user join projection
+ the keyset sort + the `Take`). The exact count is **cheap** here — it is not "as expensive as
the page itself" (the page pays for the join and the keyset; the count is an aggregate-only scan,
indexed via `(UserId, CreatedAt)`, `(Action, CreatedAt)`, `(TargetId)`). The fallback clause
below remains documented as a safety net, but is **not enabled**: the exact count is applied
across the 10 endpoints.

**Conditional fallback (NOT enabled, kept as a net)** — only if a real deployment shows an audit
volume far higher where the `COUNT` would drift:

- Keep `includeTotalCount` but calculate the total via an **approximate count announced as
  approximate** (e.g. `reltuples` from `pg_class` bounded by the `created_at` filter, or an
  incremental materialized counter), and label it `totalCountIsEstimate: true` in the response;
  the front displays "~N" instead of "N". An *announced-as-approximate* total is acceptable
  (#1556 §3); an *unannounced* exact-but-slow total is not.
- For the other 9 endpoints (tenants, profiles, users, invitations, organizations, posts),
  the exact `COUNT` remains negligible (well-indexed tables, far lower volumes); we keep the
  exact count everywhere.

## 4. Counting fails while rows succeed

**Rule**: the list displays with the range only ("x–y") and the cause visible in plain words,
never an error page.

### API side

In each service, the `totalCount` is computed in an isolated `try/catch` **after** the row
retrieval (which itself must not fail if the count fails). On a counting exception:

- rows are returned normally (with `nextCursor`);
- `totalCount` is **omitted** from the response ("unknown" behavior);
- a structured `LogWarning` carries the sanitized cause (never a secret, never a stack trace) —
  compliant with the owner's "transparent failure causes" rule (2026-08-22) and with "never log
  the X-Session-Token".

The `CursorPaginatedResult<T>` stays unchanged (no nullable `totalCount` field); only each
endpoint's **response type** (e.g. `FindAuditLogsResponse`) adds
`public int? TotalCount { get; set; }` (optional, omitted on failure). Thus an absent field =
unknown, never zero (#999).

### Front side

The `DataTableCursorFooter` built in #1549 already treats `totalCount === undefined` as
"unknown" and renders the range only (see `apps/front/src/components/table/data-table.tsx`
`DataTableCursorFooter`, `range-of-counted` branch). No component-side change is needed: simply
do not pass `totalCount` (or pass `undefined`) when the backend does not provide it. The front
never displays "of 0".

### Test (API) — named specification (T1-abs, #1595)

Spec per endpoint. Seed N rows. Force the `COUNT` failure (via a test `IDbContextInterceptor`
that throws on the second `CountAsync`, or an error seed). `GET` with `includeTotalCount=true`.
Assertions on the **real JSON body** (deserialized from the HTTP response, not the handler's
return object: only serialization is authoritative):

- status `200`;
- `data` populated (rows returned normally, with `nextCursor`);
- the `totalCount` key is **strictly absent** from the JSON — `JsonElement.TryGetProperty("totalCount", out _)` returns `false`. Not `null`, not `0`, not a present key: **absent**.

**Paired proof (red without the fix, green with).** Adversarial mutation: a lane that emits
`totalCount: null` instead of omitting the field satisfies `TotalCount == null` on the object
side but the JSON contains the key — the test goes red. The recurring defect in the repo is an
empty test whose green is forced by a second mechanism: here, an assertion on the return object
(instead of the JSON) that stays green while the JSON carries `null`.

The front represents the range only.

#### T1-ord (#1596) — rows survive a counting failure

Same seed game. Under the same forced `COUNT` failure:

- status is `200` (never `500`);
- rows are returned with their `nextCursor`.

**Adversarial mutation (named): "count before rows."** Move the `CountAsync` before the row
retrieval so a counting exception makes the whole query fail with 500 instead of returning a
partial 200. Under this mutation, T1-ord goes red (500 instead of 200) while T1-abs stays green
(unrelated to the total's presence) — proving T1-ord captures the ordering, not the value.
Equivalent variant: "catch the failure but emit `totalCount: null`" — caught by T1-abs (key is
present), not by T1-ord (status stays 200). Together, T1-abs + T1-ord close the surface: a lane
that implements one without the other lets the other half slip through.

**Required paired proof** (named color, `--reporter=verbose`): apply the "count before rows"
mutation → T1-abs GREEN, T1-ord RED; restore → both GREEN.

## 5. OpenAPI + regenerated Kiota client + front wiring

### Contract (all endpoints #1–#10)

1. Each `Query` inherits `CursorPaginatedQuery` and adds
   `[FromQuery(Name = "include_total_count")] public string? IncludeTotalCount { get; set; }`
   (boolean interpreted as `true` if present/non-empty — follow the existing `GetSortOrder`/
   `GetLimit` pattern).
2. Each response type (e.g. `FindAuditLogsResponse`) adds `totalCount` (`int?`,
   camelCase) — absent if not requested or if counting fails.
3. `just build-api` then `just generate-client` regenerates `@org/client-ts`. **No manual
   modification of `packages/client-ts/`** (PUBLY0004 / Kiota safeguards).

### Front wiring (reuses the #1549 counter, no second mechanism)

For each of the 10 cursor routes, we modify **only** the query hook
(`apps/front/src/lib/query/*`) and the pass to `DataTable`/`DataTableCursorFooter`:

- The hook adds `includeTotalCount: true` to `StaffAuditLogsQueryVariables` (and equivalents)
  and to the query parameter (`buildFindStaffAuditLogsQueryParameters`);
- The route reads `query.data?.totalCount` and passes it to `pagination={{ …, totalCount }}`.
- **Invalidation per filter set**: TanStack's `queryKey` already includes the **filter set**
  (sortId, sortOrder, size, search, actions, dates, tenantId…) via
  `staffAuditLogsQueryOptions.queryKey(variables)`. So the total is naturally recalculed
  when a filter changes, and retained across page navigation (only the `cursor` changes, not the
  filter key). No additional cache logic is required.

The shared footer `DataTableCursorFooter` (also rendered by the profiles card grid) covers all
10 surfaces at once: each route passes its known `totalCount` or `undefined`.

## 6. Cases to settle explicitly

### 6a. Member assignment drawer (`_assign-members-table.tsx`)

**Decision: EXCLUDED from #1556 scope.** Reason: the drawer reuses endpoint #6
(`GET /staff/tenants/{tenantId}/users`) as a filtered subset (search + assignment scope).
When #6 gains `includeTotalCount`, the drawer **inherits** the total for free: simply relay
`query.data?.totalCount` from the same hook. No separate endpoint or counting is written. No
silence: the total appears there via the same mechanism as #6, with no line of code dedicated
to the drawer. (If the drawer wants a total specific to its assignment subset, that will be an
explicit later addition, outside #1556.)

### 6b. Connected integrations (`settings/integrations.tsx`)

**Decision: EXCLUDED, argued.** This surface has **no real paginator**: `hasNextPage`
is hardcoded to `false` (no cursor query, no `nextCursor` from the backend). So there is no
"cursor-paginated list" in the sense of #1556, and no `totalCount` contract to expose. Forcing
a total here would invent a non-existent paginator — contrary to the owner arbitration ("does not
extend the API to force them"). We leave an honest "x–y" (or the full range) without "of N".

## 7. Never "of 0" when the total is unknown (#999)

The honest behavior built in #1549 remains the default: if `includeTotalCount` was not
requested (or failed), the `totalCount` field is absent, and `DataTableCursorFooter` renders the
range only (`range-of-counted`), never `range-no-total` with `count:0`. The existing non-regression
test `data-table-range-label.test.tsx` must continue covering this case; we add a "total
provided → range-of-total" case to lock in "x–y of N".

## Task breakdown (one task = one commit, green tree)

- **T1** — `CursorPaginatedResult`: no type change; add optional `TotalCount` on
  `FindAuditLogsResponse` + `FindAuditLogsQuery.IncludeTotalCount` + shared `CountAsync`
  service (anti-drift) + anti-drift spec + counting-failure spec. `just test-api` green.
- **T2** — Staff endpoints batch 1: tenants (#2), staff profiles (#3), staff users (#4),
  staff invitations (#5): same pattern. Anti-drift + failure specs per endpoint.
- **T3** — Staff endpoints batch 2: tenant-users (#6), tenant-invitations (#7),
  tenant-profiles (#8), organizations (#9): same pattern.
- **T4** — Tenant endpoint: posts (`GET /posts`, #10): same pattern.
- **T5** — `just build-api && just generate-client`: regenerates `@org/client-ts` with
  `includeTotalCount` + `totalCount`. Verify `pnpm --filter front typecheck`.
- **T6** — Front: wiring the 10 query hooks (`includeTotalCount:true` + passing
  `totalCount` to `DataTableCursorFooter`); assignment drawer (#6a) inherits.
  `pnpm --filter front test` green (including `data-table-range-label.test.tsx`).
- **T7** — Audit fallback if measurement unfavorable: `totalCountIsEstimate` + "~N" display.
- **T8** — PR to `develop`: `Closes #1556`, `Part of #282`, rebase on `origin/develop`
  beforehand (see resume rules: #1520/#1530/#1542/#1549 may have moved). `gh pr checks`
  green.

## Citation / proof rules

All references are `<branch>:<path>` + symbol + `git grep -n` (no line numbers on in-flight
branches). The `git show … | sed -n` proof is logged in `.dump/citations-r1.md`, one line per
citation, PASS/FAIL, no commit while any line is FAIL. Nothing under `.dump/` is committed
(`git add -f` forbidden — see 2026-08-26 resume rule: a lane force-added `.dump/` and PR #1471
propagated a foreign DONE).
