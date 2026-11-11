# Plan — daily series for members and pending invitations (#2355)

Date: 2026-11-11. Status: proposed, awaiting owner review. Issue #2355 (related #2339, #2349, #2364,
#2348). Prior art: PR #2367 (`fdb6b2779`, active-organisations series), `da0dfc029` (sign-in series),
`3cf48ad31` (series endpoint).

Owner words (#2355): "a daily series for members and pending invitations (from audit events or a
daily snapshot — choose in the spec), served by the dashboard `series` endpoint, then the front adds
delta + sparkline to those cards, the same way as « Événements d'audit »."

## 1. What the cards count today

| Card | Source today | Exact predicate |
| --- | --- | --- |
| « Membres des organisations » | `GET /staff/tenants` unfiltered `counts.members` (`TenantAsStaffService.FindTenantsAsStaffAsync`) | `user_accounts` with `Scope = Tenant`, `!IsDeleted`, `!User.IsDeleted`, in a tenant with `!IsDeleted`. A suspended membership or a globally suspended user **still counts**. |
| « Invitations en attente » | `GET /staff/invitations?status=pending` `counts.pending` (`InvitationQueryService.FindStaffInvitationsAsync`) | `invitations` with `Scope = Staff`, `Status = Pending`, `ExpiresAt > now`. |

The pending-invitations card is the **staff-scope** invitation list (platform staff invitations), not
the organisation invitations (those are `counts.pendingInvitations` of the tenants read, which no
card uses). The series follows the card. See open question Q1.

## 2. Investigation: is the data exact enough?

### Members (`user_accounts`, `users`, `tenants`)

- `BaseAttributes` gives every row `CreatedAt`, `IsDeleted`, `DeletedAt`.
- Every production removal path sets `DeletedAt` together with `IsDeleted`: `SaveChanges` soft delete
  and normalisation (`AppDbContext`), `ExecuteUpdateAsync` in `StaffUserLifecycleService`,
  `TenantUserMembershipOperations` (single and bulk remove), tenant delete in `TenantAsStaffService`.
- A removed member who rejoins gets a **new** account row (filtered unique index
  `ux_user_accounts_tenant_active`), so each membership interval is exactly one row. No interval is
  overwritten.
- Hard delete: `AppDbContext.ForceHardDelete` exists, no production caller found (specs only). A hard
  deleted row would silently vanish from past days; it is accepted and documented as the same
  trade-off as #2367.
- Suspension is **not** a state of the metric (the card counts suspended members), so the missing
  suspension timestamps do not matter.
- Tenant liveness: `tenants.DeletedAt` is exact for a soft delete. A restore is the one lossy case
  (only the current flag survives); no restore endpoint is used by the dashboard flows and the loss
  would only move one tenant's members between days.

Conclusion: the timestamps are exact. Nothing needs recording.

### Pending invitations (`invitations`)

- `CreatedAt`, `ExpiresAt` (required, never rewritten after creation: resend does not touch it),
  `AcceptedAt` (set by the 4 acceptance paths in `InvitationAcceptanceService`, together with
  `Status = Accepted`), `RevokedAt` (set by the 2 paths in `InvitationRevokeService`, together with
  `Status = Revoked`), `IsDeleted`/`DeletedAt`.
- Expiry is derived (`Pending` + `ExpiresAt`), so "expired on day D" is computable from `ExpiresAt`.
- No code path hard-deletes or soft-deletes an invitation.
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

Let `T(D) = min(start of day D+1 UTC, now)`: the end of day D, but never in the future. The last point
(today) is therefore evaluated at "now", the same instant the card uses, so the last point equals the
card's current figure.

**Member on day D** — a `user_accounts` row `a` such that:

- `a.Scope = Tenant`, and `a.CreatedAt < T(D)`;
- `a.DeletedAt` is null or `>= T(D)` (account not yet removed);
- its user: `u.DeletedAt` is null or `>= T(D)`;
- its tenant: `t.DeletedAt` is null or `>= T(D)`.

Suspended accounts/users count, as on the card. The value is the number of such rows (accounts, as
the card counts accounts).

**Pending invitation on day D** — an `invitations` row `i` such that:

- `i.Scope = Staff`, and `i.CreatedAt < T(D)`;
- `i.AcceptedAt` is null or `>= T(D)`;
- `i.RevokedAt` is null or `>= T(D)`;
- `i.ExpiresAt > T(D)`;
- `i.DeletedAt` is null or `>= T(D)` (no path deletes today; kept so a future soft delete is
  consistent).

Both are **stock** series (a level at the end of the day), unlike the audit series which are flows.

## 5. API contract

Same endpoint `GET /staff/dashboard/series`, two metrics added to `DashboardMetrics`:

- `members`
- `pending_invitations`

Names are snake_case plural nouns like `active_tenants`. No new query parameter, no new response
field: `{ metric, startDate, endDate, recordedSince: null, points: [{ date, value }] }`, zero-filled,
one point per day of the window. `DashboardMetrics.Available` and the validator message list them
(the validator already reads `Available`, so an unknown metric stays a 400 with the existing
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
    `RevokedAt`, `ExpiresAt`, `DeletedAt`, same overlap filter, `Scope = Staff`.
  - A row is counted on day D iff `enter < T(D)` and (`exit` is null or `exit >= T(D)`). For
    invitations `ExpiresAt` is exclusive (`ExpiresAt > T(D)`) while the other exits use `>=`; keep
    the two comparisons separate in code and in tests.
- ponytail note in code: whole overlapping rows in memory is fine at staff-scale (two timestamps per
  row); if members pass ~100k rows, group the entries and exits by day in SQL and read a baseline
  count before the window.
- Performance: the existing indexes (`user_accounts (tenant_id, scope)`, `invitations (tenant_id,
  scope)`) are enough at this scale; the staff-scope invitation count is tiny. Add an index only if a
  measured query needs it.

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
4. `_dashboard-format.ts`: a small `stockDelta(current, previous, locale)` helper: compares the
   **last point** of the current window with the **last point** of the previous window (a stock, not
   the sum used for the audit flow), returns `{ label: formatSignedPercent(...), direction }`, or
   `undefined` when the previous last point is 0 or missing. `formatSignedPercent` is reused.
5. `_overview-kpis.tsx`: the members and pending-invitations `KpiCard`s receive `deltaQuery` (the
   previous series), `delta`, `deltaPeriod` (`dashboard-delta-vs-previous`, same string as the audit
   card) and `sparkline` (the current series values), exactly the props the audit card uses; the
   figure and the main `query` stay the current live ones (`counts.members`, `counts.pending`). The
   header comment that says "only the audit-events card has a series" is updated. `KpiCard` itself is
   not modified: the delta footer already goes through `QueryDisplay` (`discreet`), so a series that
   fails never hides the figure.
6. i18n: no new key (the delta line and period labels exist). If a card needs an `aria-label` for the
   sparkline, add FR+EN keys together in `common.fr.json` and `common.en.json`.

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
  expires on the `ExpiresAt` boundary (exclusive); tenant/project-scope invitations ignored; today's
  point equals `counts.pending` of the staff invitations endpoint (parity spec); `recordedSince`
  `null`.
- Validation: unknown metric still 400 and the message now lists the two new metrics; 401/403 specs
  unchanged.
- Parity specs are the guard against drifting from the card's definition.

Front (vitest):

- `_dashboard-format.test.ts`: `stockDelta` up / down / previous 0 / missing data.
- `index.test.tsx`: both cards show delta + sparkline with the series mocked; no delta when the
  previous window is empty; a failing series leaves the figure visible.
- `index.preload.test.tsx`: the loader warms the four new queries with the expected `metric`,
  `startDate`, `endDate` (the preload harness already asserts the page reads what the loader warmed).

## 9. Tasks (bite-sized)

1. API: add the two metric constants to `DashboardMetrics`, extend `Available`, update the
   `RecordedSince` XML doc. Files: `Handlers/Staff/GetDashboardSeriesForStaff.cs`.
2. API (red): write the `members` specs. File: `GetDashboardSeriesForStaff.Spec.cs`.
3. API: `GetMemberSeriesAsync` + interface + handler `case`. File: `Services/DashboardQueryService.cs`,
   handler. Green.
4. API (red/green): the `pending_invitations` specs, then `GetPendingInvitationSeriesAsync` + `case`.
5. API: parity specs with the live counts; validation-message spec.
6. Contract: regenerate `apps/api/openapi.json` and `packages/client-ts` (no diff expected); extend
   `StaffDashboardMetric` in `lib/query/staff-dashboard.ts`.
7. Front: `stockDelta` in `_dashboard-format.ts` with its tests.
8. Front: four queries in `dashboardOverviewQueries` and hooks in `Overview`; loader preload test.
9. Front: pass `deltaQuery` / `delta` / `deltaPeriod` / `sparkline` to the two cards in
   `_overview-kpis.tsx`; update the component comment; card tests in `index.test.tsx`.
10. Gates (run only in the implementation step): api spec project, front tests, lint (incl. the
    route-loader guard), typecheck, openapi/Kiota check; then annotated UI screenshots on the PR as
    the project requires for UI PRs.

## 10. Open questions for the owner

- **Q1.** « Invitations en attente » today counts **staff** invitations (the staff invitations list).
  Is that the intended meaning, or should the card (and series) count **organisation** invitations
  (the `pendingInvitations` of the tenants read)? This plan follows the card as it is; switching the
  scope is a one-line predicate change plus the card's figure source.
- **Q2.** Should the member series stay "accounts in live organisations, suspended included" (the
  card's current rule)? This plan keeps it so the last point equals the card.
