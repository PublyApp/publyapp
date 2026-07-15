# Status Filter Multi-Select Consistency Design

**Issue:** [#828 - make status filters true multi-select controls](https://github.com/radandevist/publyapp/issues/828)

## Problem

The `/staff/tenants` status filter is singular even though the existing staff-tenants API validates comma-separated status sets and the service applies them with set membership. The route therefore exposes less filtering capability than the backend already supports. Its actual status rows also use checked-only menu indicators and close after every selection, while the accepted front-2 multi-select pattern uses visible square checkboxes and leaves the menu open.

The inconsistency is broader than that route. Four front-2 status menus exist today. Three already use persistent multi-select value rows, but the staff invitations menu has no `All statuses` reset row; its only reset command is `Clear`. A source-level guard is needed so later status menus cannot silently omit persistence, visible checkbox semantics, or the reset-row distinction.

## Goals

- Represent the selected `/staff/tenants` statuses as a typed array in route logic.
- Normalize URL input and serialize a deterministic, lowercase comma-separated `status` value accepted by the existing API.
- Let Pending, Active, and Suspended be toggled independently without closing the menu.
- Render an always-visible square checkbox for each actual status value.
- Make `All statuses` clear the set and close the menu without rendering a square checkbox.
- Preserve cursor reset, debounced-search race protection, selection locks, query keys/request behavior, and the existing exclusive secondary-navigation links.
- Bring the one audited reset-row outlier into the same interaction contract.
- Add a repo-wide, fail-closed status-menu guard and prove that the guard rejects the defects it is intended to prevent.

## Non-Goals

- No backend handler, validator, service, entity, database, OpenAPI, or generated-client change.
- No new API parameter and no change to the meaning of an empty or omitted `status` query parameter.
- No change to tenant lifecycle states or their order.
- No redesign of the dropdown primitive, checkbox primitive, data table, or filter-button styling.
- No conversion of exclusive filters, including the tenant secondary-panel shortcuts and non-status level filters, to multi-select navigation semantics.
- No extraction of a shared status-filter component in this change. The menus have different status domains and route ownership; the invariant belongs in the guard and shared dropdown semantics, not a new cross-route component.

## Current Inventory

| Surface | Current URL/state behavior | Current menu behavior | Required action |
| --- | --- | --- | --- |
| `src/routes/authed/staff/tenants.tsx` | One of `pending`, `active`, or `suspended` | Actual values close and use checked-only indicators; `All statuses` resets | Convert to array/set toggling, persistent square-checkbox value rows, and one reset row |
| `src/routes/authed/staff/invitations/index.tsx` | Comma-separated invitation statuses | Actual values are persistent and use square checkboxes; only `Clear` resets | Replace `Clear` with the standard `All statuses` close-and-reset row without a square checkbox |
| `src/routes/authed/staff/tenants/$tenantId/invitations.tsx` | Comma-separated invitation statuses | Compliant persistent value rows and `All statuses` reset row | Audit only; no source change expected |
| `src/routes/authed/staff/tenants/$tenantId/users.tsx` | Comma-separated tenant-user statuses | Compliant persistent value rows and `All statuses` reset row | Audit only; no source change expected |

`DropdownMenuCheckboxItem` already provides the required primitive contract: `showCheckbox` renders a visible, always-present square box, while the default renders only the checked-state indicator. Its existing test covers both branches. The accepted status menus pair `showCheckbox` with `closeOnClick={false}` on actual values and use a closing reset row without `showCheckbox`.

The API evidence is also complete. `FindTenantsAsStaffQueryValidator` validates each comma-separated token case-insensitively against Pending, Active, and Suspended; `GetStatusesOrNull()` returns a deduplicated `IReadOnlySet<TenantStatus>`; and `TenantAsStaffService` filters with `statuses.Contains(t.Status)`. No backend or generated-client work is justified.

## Architecture And Data Flow

### Canonical status helpers

`TENANT_STATUS_FILTERS` remains the single frontend ordering and type source: Pending, Active, Suspended. `parseTenantStatusFilter` changes from returning one optional value to returning `TenantStatusFilter[]`. It accepts only a string wire value, splits on commas, trims whitespace, normalizes case, removes unknown and duplicate tokens, and returns recognized values in `TENANT_STATUS_FILTERS` lifecycle order. Missing, non-string, empty, or wholly invalid input returns `[]`.

Add `serializeTenantStatusFilter(statuses)`. It revalidates and deduplicates the input, orders it by `TENANT_STATUS_FILTERS`, joins with commas, and returns `undefined` for an empty set. Examples:

| Input | Canonical wire value |
| --- | --- |
| `undefined`, `''`, or `bogus` | omitted |
| `Active` | `active` |
| `suspended, active` | `active,suspended` |
| `Suspended,pending,active,pending` | `pending,active,suspended` |
| `active,bogus,suspended` | `active,suspended` |

`TenantListSearchParams.status` becomes `TenantStatusFilter[]`. `parseTenantListSearchParams` exposes the array to route logic; `serializeTenantListSearchParams` converts it back to the canonical wire string. `validateTenantListSearchParams` continues to return the snake_case wire shape expected by TanStack Router, so route validation never leaks an array or camelCase table fields into the URL.

### Route state and navigation

`StaffTenantsPage` derives `selectedStatuses` from the parsed search state. `toggleStatus(status)` removes an already-selected value or adds an unselected value, then navigates through `serializeTenantListSearchParams` with `cursor: undefined` and `replace: true`. `setStatuses([])` is the only reset operation.

The filter label is `All statuses` for an empty array and otherwise joins translated selected labels in canonical lifecycle order. `hasActiveSearch` checks `selectedStatuses.length > 0`; it must not rely on array truthiness. The table controller's `cursorResetKey` and the staff-tenants query receive the canonical serialized status string, not the array. Thus any set change resets the page generation, query keys distinguish combinations, and the generated client continues receiving its existing `status?: string` input.

The existing debounce safety remains unchanged in shape: every navigation is built from the latest parsed route search, and the controller's pending search commit must retain the latest canonical status string when it fires. Entering selection mode still cancels a pending search draft and disables the status trigger, so a bulk-action target set cannot change underneath an active selection.

The secondary-panel Pending, Active, and Suspended links remain exclusive shortcuts. Each still navigates to a singular status value. A multi-value URL matches none of those singular links and must not mark `All tenants` active; this behavior is asserted rather than changing the navigation model.

### Existing API request path

The complete data flow is:

1. TanStack Router supplies raw `status` search input.
2. The tenant helpers parse it to a canonical `TenantStatusFilter[]` for UI state.
3. A toggle/reset serializes that array to a lowercase comma-separated string or omission.
4. `useStaffTenantsQuery` receives that string; `buildFindStaffTenantsQueryParameters` passes it through unchanged after string normalization.
5. The generated client emits the existing `status` query parameter.
6. The API validator validates every token, `GetStatusesOrNull()` builds the enum set, and the service uses `Contains`.

There is no contract seam that requires client regeneration. If implementation evidence contradicts this path, stop rather than changing backend semantics.

## Interaction And Accessibility Semantics

- The trigger remains a real button, retains the existing test id, translated text, filter-button geometry, disabled state, and selection-lock title.
- `All statuses` is the first row. It reports checked when the selected array is empty, uses `closeOnClick`, clears the set, and omits `showCheckbox`. It is a reset choice, not a persistent value.
- Pending, Active, and Suspended remain `menuitemcheckbox` rows. Each sets `checked` from membership in `selectedStatuses`, explicitly uses `closeOnClick={false}`, and sets `showCheckbox` so checked and unchecked states both have a visible square target.
- Toggling an actual value keeps the menu open and preserves keyboard focus within the menu. The Base UI checkbox-item role and checked state remain the accessible source of truth; the nested visual checkbox stays `aria-hidden`, read-only, untabbable, and pointer-inert as defined by the shared primitive.
- Choosing `All statuses` closes the menu and returns focus through the existing menu primitive behavior.
- The trigger label lists the selected translated statuses in canonical order. Existing truncation and `max-w-64` prevent long combinations from resizing the toolbar.
- The staff invitations audit correction uses the same reset-row semantics. Its actual invitation-status rows remain unchanged.
- The trailing `Clear` command in `/staff/tenants` is removed because it duplicates `All statuses`. On staff invitations, the implementation uses one reset affordance as well; the new `All statuses` row replaces the duplicate `Clear` command rather than retaining two ways to do the same action.

## Repo-Wide Guard

Extend `check-design-system.mjs` with a TypeScript compiler-API scan over every front-2 `src/**/*.tsx` file; TypeScript is already a workspace dependency, so this adds no package. Parse each file as TSX and fail that file on parser diagnostics. A `DropdownMenuContent` is a status menu when either its subtree contains the `all-statuses` translation key or it contains a `.map(...)` expression whose collection/callback source text contains `status` case-insensitively. This recognizes every current menu, including the audited staff-invitations outlier before its reset row is added.

Within a discovered status menu, a `DropdownMenuCheckboxItem` whose subtree contains `all-statuses` is the reset row. Every other `DropdownMenuCheckboxItem` is an actual status-value row and must explicitly contain both `closeOnClick={false}` and boolean `showCheckbox` attributes.

For every file containing persistent status-value rows, the detector also requires an `All statuses` reset item in the same dropdown. That reset item must explicitly close on click and must not contain `showCheckbox`. This distinguishes the exclusive reset row from actual values. Non-status persistent checkbox menus, such as level filters, are outside the status-specific rule.

The guard must fail closed when it discovers a status-value row but cannot parse its opening JSX element. Its diagnostics name the file, rule id, and missing or conflicting semantic. Guard fixtures prove failure for:

- a status value missing `showCheckbox`;
- a status value that closes or omits explicit `closeOnClick={false}`;
- a status menu missing its `All statuses` reset row;
- an `All statuses` row that uses `showCheckbox` or does not explicitly close;
- a syntactically obscured status item the scanner cannot classify safely.

Positive fixtures cover all four audited menu shapes and a non-status persistent filter. Following the repository's guard policy, each negative fixture is the planted defect that demonstrates the guard can fail, not merely a passing fixture suite.

## Test Strategy

### Helper tests

- Parse single values case-insensitively.
- Parse every two- and three-status combination.
- Normalize whitespace/case, remove duplicates and unknown tokens, and impose lifecycle order.
- Serialize arrays to canonical comma-separated strings and omit the empty set.
- Round-trip canonical status arrays alongside search, sort, and pagination fields.
- Prove invalid-only input never reaches the request shape.

### Route component tests

- Render the three actual status values as `menuitemcheckbox` elements with visible checkbox boxes.
- Assert `All statuses` has no visible square checkbox, clears, and closes.
- Toggle Pending, Active, and Suspended without closing, including deselection and the empty-set transition.
- Assert navigation uses `pending,active,suspended` in canonical order and always clears `cursor`.
- Assert the trigger label reflects multiple selected values.
- Preserve both debounce-race tests, adapting them to canonical status strings.
- Preserve the selection-lock and pending-debounce cancellation tests.
- Preserve cursor page-generation reset and active-search behavior for non-empty arrays.

### Boundary and query tests

- Extend router-boundary coverage to prove a mixed-case, duplicate, partly invalid deep link rewrites to the canonical comma-separated value and a wholly invalid link omits `status`.
- Assert a combined canonical status string reaches `useStaffTenantsQuery`, the staff-tenants query key, and `buildFindStaffTenantsQueryParameters` unchanged.
- Assert a multi-status URL activates none of the exclusive tenant secondary-panel shortcuts.

### Browser tests

- Update the staff-tenants API mock to split the `status` parameter and return the union of matching rows.
- Select Active and Suspended in one still-open menu, observe square checkbox states, assert `status=active%2Csuspended` through `URLSearchParams`, and observe both matching rows.
- Deselect one value and assert the URL/request/table narrow without closing the menu.
- Choose `All statuses`, assert the menu closes, `status` disappears, and all rows return.
- Extend the existing staff-invitations browser spec to assert its `All statuses` row resets and closes without a square checkbox.

### Guard tests

- Run the positive and planted-defect fixtures described above.
- Run the live guard over the repository so all four current status menus are covered by the same invariant.

## Verification Gates

Implementation verification runs after dependency setup in its implementation worktree, not in this documentation packet:

1. Focused Vitest for tenant helpers, tenant route, deep-link canonicalization, staff-tenants query, route metadata, and the shared dropdown tests.
2. `node --test apps/front-2/scripts/check-design-system.test.mjs`, with explicit evidence that each planted defect produces the intended rule violation.
3. `pnpm --filter front-2 check:design-system` with zero violations.
4. `npx oxlint` over every changed TypeScript/TSX/MJS file with zero errors.
5. `pnpm --filter front-2 typecheck` with zero errors.
6. Focused Playwright for staff tenants and staff invitations using the repository's single Docker e2e stack.
7. The full front-2 acceptance gate required by the orchestration adapter before review or merge.

## Exact Expected File Surface

The implementation is expected to modify only these files:

- `apps/front-2/src/routes/authed/staff/tenants-list-helpers.ts`
- `apps/front-2/src/routes/authed/staff/tenants-list-helpers.test.ts`
- `apps/front-2/src/routes/authed/staff/tenants.tsx`
- `apps/front-2/src/routes/authed/staff/tenants.test.tsx`
- `apps/front-2/src/routes/authed/staff/deep-link-canonicalization.test.tsx`
- `apps/front-2/src/lib/query/staff-tenants.test.ts`
- `apps/front-2/src/lib/navigation/route-metadata.test.tsx`
- `apps/front-2/src/routes/authed/staff/invitations/index.tsx`
- `apps/front-2/e2e/staff-tenants.spec.ts`
- `apps/front-2/e2e/staff-invitations.spec.ts`
- `apps/front-2/scripts/check-design-system.mjs`
- `apps/front-2/scripts/check-design-system.test.mjs`

No change is expected in `dropdown-menu.tsx` or its test because the needed visual and accessible checkbox contract already exists and is covered. No change is expected in the two compliant tenant-detail status menus, `staff-tenants.ts`, route metadata source, API files, OpenAPI output, generated client, translations, package manifests, lockfiles, or formatting configuration.

Any implementation need outside this list is a scope review point. Any need to alter backend status semantics, edit generated client code, or weaken an exclusive non-status filter is a stop condition.
