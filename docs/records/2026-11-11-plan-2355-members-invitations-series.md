# Plan — daily series for members and pending invitations (#2355)

Date: 2026-11-11. Status: proposed; amended 2026-11-11 with the owner's answers (see section 11). Issue #2355 (related #2339, #2349, #2364,
#2348). Prior art: PR #2367 (`fdb6b2779`, active-organisations series), `da0dfc029` (sign-in series),
`3cf48ad31` (series endpoint).

Owner words (#2355): "a daily series for members and pending invitations (from audit events or a
daily snapshot — choose in the spec), served by the dashboard `series` endpoint, then the front adds
delta + sparkline to those cards, the same way as « Événements d'audit »."

## 1. What the cards count today

| Card | Source today | Exact predicate |
| --- | --- | --- |
| « Membres des organisations » | `GET /staff/tenants` unfiltered `counts.members` (`TenantAsStaffService.FindTenantsAsStaffAsync`) | `user_accounts` with `Scope = Tenant`, `!IsDeleted`, `!User.IsDeleted`, in a tenant with `!IsDeleted`. A suspended membership or a globally suspended user **still counts**. |
| « Invitations en attente » | Today: `GET /staff/invitations?status=pending` `counts.pending` (staff-scope invitations). **Owner decision 11/11: it must count organisation invitations**, so the figure moves to the tenants read's `counts.pendingInvitations` (see below). |

Tenants read definition today (`TenantAsStaffService.FindTenantsAsStaffAsync`, the source of the
tenants list KPI « Invitations en attente — N organisation(s) concernée(s) »): `invitations` with
`Scope = Tenant`, `Status = Pending`, `!IsDeleted`, `TenantId` not null, in an organisation of the
base query (`!tenant.IsDeleted`; **all organisation statuses** — pending, active, suspended — count).
It does **not** test `ExpiresAt`: a pending invitation past its expiry is still counted today, while
the staff list (and the owner's wording "not expired") excludes it. See section 11, Q3.

## 2. Investigation: is the data exact enough?

### Members (`user_accounts`, `users`, `tenants`)

- `BaseAttributes` gives every row `CreatedAt`, `IsDeleted`, `DeletedAt`.
- Every tenant-scope membership removal sets `DeletedAt` together with `IsDeleted`: `SaveChanges`
  soft delete (`AppDbContext`) and `TenantUserMembershipOperations` (single and bulk remove). A
  tenant delete writes `tenants.deleted_at` only (accounts stay live), which is why the tenant join
  is part of the definition.
- **Ceiling (decision: keep the restore).** Two rejoin paths exist. Invitation acceptance inserts a
  **new** row, so that interval is exact. The staff assign path
  (`TenantUserCompanyMembershipService`, `POST /staff/tenant-users/{userId}/companies`) looks the
  account up with `IgnoreQueryFilters()` and **revives the same soft-deleted row**
  (`IsDeleted = false; DeletedAt = null`), keeping the original `CreatedAt`. For a member removed and
  then re-assigned, the removal instant is erased, so the series counts that member continuously
  from their first join, including the time they were not a member. Today's point is still correct
  (parity holds). The assign flow is deliberately **not** changed; this is a documented trade-off,
  pinned by an API spec (section 8).
- Hard delete: no production code removes `user_accounts` or `invitations` rows
  (`ForceHardDelete` is used only for post media and role links). A hard deleted row would silently
  vanish from past days; accepted and documented, as in #2367.
- Suspension is **not** a state of the metric (the card counts suspended members), so the missing
  suspension timestamps do not matter.
- Tenant liveness: `tenants.DeletedAt` is exact for a soft delete. A restore is the one lossy case
  (only the current flag survives); no restore endpoint is used by the dashboard flows and the loss
  would only move one tenant's members between days.

Conclusion: exact except for the restore ceiling above. Nothing needs recording.

### Pending invitations (`invitations`)

- The invitations in scope are now `Scope = Tenant` (with a `TenantId`); the same fields apply to
  every scope.
- `CreatedAt`, `ExpiresAt` (required, never rewritten after creation: resend does not touch it),
  `AcceptedAt` (set by the 4 acceptance paths in `InvitationAcceptanceService`, together with
  `Status = Accepted`), `RevokedAt` (set by the 2 paths in `InvitationRevokeService`, together with
  `Status = Revoked`), `IsDeleted`/`DeletedAt`.
- Expiry is derived (`Pending` + `ExpiresAt`), so "expired on day D" is computable from `ExpiresAt`.
- No code path hard-deletes or soft-deletes an invitation.
- The organisation's liveness matters for tenant-scope invitations: the tenants read ignores
  invitations of a deleted organisation. `tenants.DeletedAt` is exact (same as members); suspension
  is not a filter (suspended organisations count), so its missing timestamps do not matter.
- Status transitions are one-way (Pending to Accepted or Revoked), so a row has at most one
  "leaves pending" instant.

Conclusion: the timestamps are exact.

## 3. Decision

| Series | Approach | Why |
| --- | --- | --- |
| `members` | (a) computed from existing timestamps, no new table | Interval data is exact (one row per membership interval, `CreatedAt` / `DeletedAt`). A history table would duplicate it and could only start recording from its migration, losing the real past. |
| `pending_invitations` | (a) computed from existing timestamps, no new table | Created / accepted / revoked / expires are all stored and immutable. A snapshot job would add a scheduler and a table to store what is derivable. |

Rejected: (b) history table and (d) daily snapshot: strictly weaker than the real timestamps and they
create an "unrecorded before" gap. (c) audit events: not every membership change writes one, so it
would be lossy.

This differs from #2367 on purpose: there the database kept only the current status, so history had
to be recorded. #2349 itself said "if the data already carries every transition, compute from it and
add no table"; here it does.

### Days before any data

No `recordedSince` and no ghost: the series is exact back to the first row. A day before the first
member or invitation is a **real 0** (nothing existed). `recordedSince` stays `null` for both metrics,
like the audit-log metrics. The only caveat is the hard-delete one above.

## 4. Exact definitions

Time zone: **UTC**, the one every existing series uses. A point is one UTC calendar day `YYYY-MM-DD`;
the window bounds come from the existing `DashboardQueryRules.TryParseWindow` (start/end inclusive).

Let `T(D) = min(start of day D+1 UTC, now)`: the end of day D, but never in the future. Only the
last day (the current UTC day) is clamped; every earlier day is evaluated at its end. The last point
is then evaluated at "now", the same instant the card uses, so it equals the card's figure **only
when `end_date` is the current UTC day** (a future `end_date`, or a local "today" ahead of UTC,
repeats today's stock). The parity specs pin `end_date` = current UTC day. The two series are not
filtered by the page's organisation `scope` (do not pass it).

**Member on day D** — a `user_accounts` row `a` such that:

- `a.Scope = Tenant`, and `a.CreatedAt < T(D)`;
- `a.DeletedAt` is null or `>= T(D)` (account not yet removed);
- its user: `u.DeletedAt` is null or `>= T(D)`;
- its tenant: `t.DeletedAt` is null or `>= T(D)`.

Suspended accounts/users count, as on the card. The value is the number of such rows (accounts, as
the card counts accounts).

**Pending invitation on day D** (organisation invitation) — an `invitations` row `i` such that:

- `i.Scope = Tenant`, `i.TenantId` not null, and `i.CreatedAt < T(D)`;
- its organisation: `t.DeletedAt` is null or `>= T(D)` (suspended and pending organisations count);
- `i.AcceptedAt` is null or `>= T(D)`;
- `i.RevokedAt` is null or `>= T(D)`;
- `i.ExpiresAt > T(D)` (not expired; see Q3 for the tenants read);
- `i.DeletedAt` is null or `>= T(D)` (no path deletes today; kept so a future soft delete is
  consistent).

Today's point equals `counts.pendingInvitations` of the tenants read once Q3 is applied (task 5b).

Both are **stock** series (a level at the end of the day), unlike the audit series which are flows.

## 5. API contract

Same endpoint `GET /staff/dashboard/series`, two metrics added to `DashboardMetrics`:

- `members`
- `pending_invitations`

Names are snake_case plural nouns like `active_tenants`. No new query parameter, no new response
field: `{ metric, startDate, endDate, recordedSince: null, points: [{ date, value }] }`, zero-filled,
one point per day of the window. `DashboardMetrics.Available` and the validator message list them
(the validator already reads `Available`, so an unknown metric stays a 422 with the existing
message). The XML doc of `RecordedSince` says it is `null` for these metrics too.

`apps/api/openapi.json` carries no enum for `metric`; regenerate it and the Kiota client
(`packages/client-ts`) anyway to prove there is no diff, per openapi-kiota-safeguards. Expected
change: none or the doc comment only.

No migration, no backfill, no new table, no index (see performance).

## 6. Backend design (AGENTS.md rules)

- Vertical slice stays `Modules/Dashboard`: handler `GetDashboardSeriesForStaff` (already the
  `*ForStaff` variant) gains two `case`s; no new route, no new permission.
- `IDashboardQueryService` / `DashboardQueryService` gains `GetMemberSeriesAsync` and
  `GetPendingInvitationSeriesAsync`, both taking the existing `GetDashboardSeriesArgs` and returning
  `IReadOnlyList<DashboardSeriesPoint>`. They read `AppDbContext` directly; **no service calls
  another service**.
- LINQ in **query syntax** (`from ... where ... select`), as the sibling methods do.
- No new TypedProblem: errors remain the validator's 400 for a bad metric/window.
- Algorithm (no per-day query): load the narrow rows that overlap the window, then sweep days in
  memory with a +1 / -1 event per row, like `GetActiveTenantSeriesAsync`.
  - Members: project `(a.CreatedAt, exit)` where `exit` is the earliest non-null of `a.DeletedAt`,
    `u.DeletedAt`, `t.DeletedAt`, for rows with `a.CreatedAt < T(end)` and `exit` null or
    `>= T(start of window)`. Rows that entered before the window feed the starting level.
  - Invitations: project `(i.CreatedAt, exit)` where `exit` is the earliest of `AcceptedAt`,
    `RevokedAt`, `DeletedAt` and the organisation's `DeletedAt` (inclusive exits), with `ExpiresAt`
    carried as a **separate** exclusive bound (never collapsed into `exit`: a row expiring exactly
    at `T(D)` must not count), same overlap filter, `Scope = Tenant`, joined to `tenants` (query
    syntax).
  - A row is counted on day D iff `enter < T(D)` and (`exit` is null or `exit >= T(D)`). For
    invitations `ExpiresAt` is exclusive (`ExpiresAt > T(D)`) while the other exits use `>=`; keep
    the two comparisons separate in code and in tests.
- ponytail note in code: whole overlapping rows in memory is fine at staff-scale (two timestamps per
  row); if members pass ~100k rows, group the entries and exits by day in SQL and read a baseline
  count before the window.
- Performance: no index serves the `created_at` / `deleted_at` / `expires_at` predicates and both
  queries are joins, so each is a table scan, four per dashboard load (current and previous window, two
  metrics). That is fine at staff scale; add an index only if a measured query needs it.

## 7. Front changes

Files under `apps/front/src/routes/authed/staff/dashboard/` and `lib/query/staff-dashboard.ts`:

1. `lib/query/staff-dashboard.ts`: `StaffDashboardMetric` adds `'members' | 'pending_invitations'`.
2. `index.tsx` `dashboardOverviewQueries`: add four entries beside `series` / `previousSeries`:
   `membersSeries`, `previousMembersSeries`, `pendingInvitationsSeries`,
   `previousPendingInvitationsSeries` (same window and `previousPeriod(period)` as the audit pair).
   Declared once there, so `preloadRouteQueries` in the loader warms them and the page reads the same
   variables (the route-loader guard and `index.preload.test.tsx` enforce this). The comment "nine
   queries" becomes thirteen.
3. `index.tsx` `Overview`: one `useStaffDashboardSeriesQuery` per new entry; include their `.error`
   in the `shouldLogoutForFailure` loop.
4. `_dashboard-format.ts`: **no third copy**. Move the existing `{ label, direction }` delta builder
   (today duplicated as `seriesDelta` in `reports.tsx` and inline in `index.tsx`) into
   `_dashboard-format.ts`, add `seriesLastValue(points)` next to `seriesTotal`, and delete both
   copies. The flow delta feeds it the window sums, the stock delta feeds it the last values. The
   result is `undefined` when either side is missing or the previous value is 0; equality is `up`
   with `+0,0 %` (the audit convention).
5. `_overview-kpis.tsx`: the members and pending-invitations `KpiCard`s receive `deltaQuery` (the
   previous series), `delta`, `deltaPeriod` (`dashboard-delta-vs-previous`, same string as the audit
   card) and `sparkline` (the current series values), exactly the props the audit card uses. The
   members figure and main `query` stay `counts.members` of `countsQuery`. The pending-invitations
   card's figure and main `query` become `countsQuery`'s `counts.pendingInvitations` (the same
   unfiltered tenants read the members and active-organisations cards already use): **no new
   endpoint and no new field**, the figure source simply changes from the staff invitations list.
   The `pendingInvitationsQuery` prop leaves `OverviewKpis` (unused otherwise); the query stays in
   `index.tsx` for the list below the cards. The
   header comment that says "only the audit-events card has a series" is updated. `KpiCard` itself is
   not modified: the delta footer already goes through `QueryDisplay` (`discreet`), so a series that
   fails never hides the figure.
6. i18n: the delta line and period labels exist (`Sparkline` is `aria-hidden`). One FR+EN pair is
   added: the staff-invitations **list** card under the KPIs gets a distinct label (« Invitations
   staff en attente » / "Pending staff invitations"), since the KPI now counts organisation
   invitations and the list still shows staff ones (the two numbers differ on the same screen).

Composition: `OverviewKpis` keeps composing `KpiCard`; props are passed as data, no new boolean
options. All async display goes through `QueryDisplay`.

Behaviour kept identical to the audit card: the sparkline appears only with a delta (previous window
last point > 0), and a missing previous window means no delta, never an error.

## 8. Tests

API (`*.Spec.cs`, `Spec` suffix and BDD names per docs/guides/test-conventions.md), extending
`apps/api/Modules/Dashboard/Handlers/Staff/GetDashboardSeriesForStaff.Spec.cs`:

- `members`: member created in the window appears from its day; soft-deleted account leaves on its
  `DeletedAt` day; a user soft delete and a tenant soft delete remove their members from that day;
  suspended account/user still counted; a removed-then-rejoined member counts once per interval; zero
  days stay `0`; today's last point equals the live count (card parity); non-tenant-scope accounts
  (staff, project) are ignored; window bounds inclusive; `recordedSince` is `null`.
- `pending_invitations`: pending from `CreatedAt` day; accepted and revoked leave on their day;
  expires on the `ExpiresAt` boundary (exclusive); staff and project-scope invitations ignored;
  invitations of a soft-deleted organisation leave on its `DeletedAt` day; suspended and pending
  organisations still count; today's point equals `counts.pendingInvitations` of the tenants read
  (parity spec); `recordedSince` `null`.
- Tenants read (`FindTenantsAsStaff` spec): `counts.pendingInvitations`, `pendingInvitationTenants`
  exclude a pending invitation whose `ExpiresAt` has passed (Q3); existing facet specs updated.
- Validation: an unknown metric still answers 422 and the message now lists the two new metrics;
  401/403 specs unchanged.
- Members restore ceiling: a member removed then re-assigned through the staff assign path is counted
  continuously from the first join (the documented trade-off), while a member removed and re-invited
  gets a gap. The spec names the ceiling so it is not a surprise.
- Parity specs are the guard against drifting from the card's definition.

Front (vitest):

- `index.test.tsx`: the pending-invitations card figure comes from the tenants read
  (`counts.pendingInvitations`), not from the staff invitations list.
- `_dashboard-format.test.ts`: the shared delta builder and `seriesLastValue` (up / down / equal /
  previous 0 / missing current or previous).
- `index.test.tsx`: both cards show delta + sparkline with the series mocked; no delta when the
  previous window is empty; a failing series leaves the figure visible.
- `index.preload.test.tsx`: the loader warms the four new queries with the expected `metric`,
  `startDate`, `endDate`. Update its hard-coded counts: the `settle` wait on `SERIES === 4`, the two
  assertions hard-coded to 9 queries and the test title (series calls 4 to 8, total 9 to 13), or the
  suite hangs.
- E2E: skipped on purpose (docs/guides/e2e-coverage.md). The API parity and boundary specs are the
  deterministic proof of the series arithmetic; a Playwright spec over seeded timestamps would be a
  slow duplicate.

## 9. Tasks (bite-sized)

1. API: add the two metric constants to `DashboardMetrics`, extend `Available`, update the
   `RecordedSince` XML doc. Files: `Handlers/Staff/GetDashboardSeriesForStaff.cs`.
2. API (red): write the `members` specs. File: `GetDashboardSeriesForStaff.Spec.cs`.
3. API: `GetMemberSeriesAsync` + interface + handler `case`. File: `Services/DashboardQueryService.cs`,
   handler. Green.
4. API (red/green): the `pending_invitations` specs, then `GetPendingInvitationSeriesAsync` + `case`.
5. API (Q3, first): make the tenants read's `PendingInvitations` / `PendingInvitationTenants` ignore
   expired invitations (`ExpiresAt > now`) in `Modules/Tenants/Services/TenantAsStaffService.cs`;
   add the expired-row assertion to `Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs`.
5b. API: parity specs with the live counts (`end_date` = current UTC day); validation-message spec;
    members restore-ceiling spec.
6. Contract: regenerate `apps/api/openapi.json` and `packages/client-ts` (no diff expected); extend
   `StaffDashboardMetric` in `lib/query/staff-dashboard.ts`.
7. Front: move the delta builder to `_dashboard-format.ts`, add `seriesLastValue`, delete the copies in
   `reports.tsx` and `index.tsx`, with tests.
8. Front: four queries in `dashboardOverviewQueries` and hooks in `Overview`; loader preload test.
9. Front: pass `deltaQuery` / `delta` / `deltaPeriod` / `sparkline` to the two cards in
   `_overview-kpis.tsx`; update the component comment; card tests in `index.test.tsx`.
10. Gates (run only in the implementation step): api spec project, front tests, lint (incl. the
    route-loader guard), typecheck, openapi/Kiota check; then annotated UI screenshots on the PR as
    the project requires for UI PRs.

## 10. Owner decisions

- **Q1 (answered 11/11).** The card counts **organisation** invitations. Figure from the tenants
  read's `counts.pendingInvitations`; series `pending_invitations` uses the same definition
  (section 4).
- **Q2 (answered 11/11).** Members keep the card's rule: accounts in non-deleted organisations,
  suspended members included.

## 11. Amendment 2026-11-11 and review decisions

Amended for Q1 (scope `Staff` became `Tenant`, organisation liveness, card figure source) and for the
plan review (captain decisions): restore ceiling kept and pinned (the assign flow is not changed),
only the last day clamped, honest table-scan statement, 422 for an invalid metric, delta builder
reused, distinct label for the staff-invitations list.

- **Q3 (decided).** Expired is not pending anywhere: the tenants read excludes expired invitations
  too (task 5), so the tenants list KPI, the card and the series agree. The tenants list number
  changes slightly.
- **Q4 (decided).** The staff-invitations list under the cards stays out of scope; it only gets a
  distinct label (section 7, item 6).
