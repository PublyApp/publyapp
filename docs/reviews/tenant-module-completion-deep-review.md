# Deep Review: Tenant Module Completion

## Executive Summary

This implementation is not production-ready yet.

The backend and frontend both compile (`dotnet build apps/api/MainApi.csproj -c Test` and `make tsc-front` passed), but the review uncovered several runtime and product-level defects that are more important than compile health:

1. The new tenant-user invite drawer does not open because the shared drawer wrapper is now half-controlled and half-uncontrolled.
2. The tenant-users page defaults to a sort key the backend does not accept, which makes the initial list request fail with `400`.
3. The export workstream is only partially implemented: there is no backend export contract, and the frontend “export” only dumps the current in-memory page with missing fields.
4. The invite-user flow is incomplete as a product feature: invitations are created, but no email is sent, there is no recovery UI to access the link/token, and the raw token is returned in the API response.

There is also a second tier of important issues: weak bulk-action validation, missing query-parameter validation, stale client cache after user mutations, and JSON i18n files with duplicate keys.

## Observations & Issues

### Critical Issues

1. The invite drawer cannot open in the tenant-users page.

Files:
- [section-page-with-drawer.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/components/settings/section-page-with-drawer.tsx#L29)
- [tenant-details-users-page.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx#L13)

Why this is critical:
- `SectionPageWithDrawer` still owns its own `openDrawer` state.
- The CTA button now optionally calls an external `ctaOnClick`.
- `TenantDetailsUsersPage` passes `ctaOnClick={drawerOpen.onTrue}`, but the actual `Drawer` still renders from the internal `openDrawer.value`.
- Result: clicking “Invite user” toggles the page-local boolean, not the drawer’s boolean.

Impact:
- B3 is functionally inaccessible from the intended entry point.
- This is not a polish issue; it blocks the primary UI path.

2. The tenant-users table defaults to an invalid sort id and likely fails on first load.

Files:
- [tenant-users-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx#L70)
- [UserService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L456)

Why this is critical:
- The table’s default sort id is `createdAt`.
- The backend only accepts `id`, `email`, `status`, `level`, and `createdat`.
- `useTableState` forwards the sort id as-is; there is no normalization layer.
- The handler returns `InvalidSortId`, which becomes `400`.

Impact:
- B6 can fail before the user touches anything.
- Even if the page sometimes appears to work in manual testing, the default request contract is wrong.

3. The export workstream is not actually implemented as planned.

Files:
- [tenants-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx#L370)
- [Routes.Tenants.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Routes.Tenants.cs#L11)

Why this is critical:
- There is no backend export route, handler, or service method in the changed API surface.
- The frontend “export” is a client-side download of the current `dataTable` only.
- `TenantRowDataMapper` does not populate `code`, `createdAt`, or `updatedAt`, yet the CSV export includes `Code` and `Created`.
- That means the exported file is page-local and incomplete, while the plan explicitly described A3 as backend export functionality.

Impact:
- Users cannot export the full filtered dataset.
- The CSV contains blank fields for columns it claims to export.
- This is a gap between implementation and product promise, not just a refactor opportunity.

4. The invite-user backend is not a complete or safe product flow yet.

Files:
- [CreateInvitationForTenantAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs#L27)
- [tenant-users-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx#L425)

Why this is critical:
- The handler explicitly contains `TODO: Send invitation email`.
- The endpoint returns the raw invitation token to the client.
- The invite form ignores that token and only shows a success toast.
- The tenant-users page has no invitation management UI and `ALLOW_COPY_LINK = false`, so staff have no fallback way to retrieve/use the token.

Impact:
- The invited user never receives an invitation.
- Staff are told “Invitation sent successfully” even though no message is sent.
- The API leaks an invitation token into the browser response without a corresponding UX need.

### Major Issues

1. Bulk action validation is too weak and silently drops malformed ids.

Files:
- [BulkSuspendTenantsAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/BulkSuspendTenantsAsStaff.cs#L35)
- [BulkReactivateTenantsAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/BulkReactivateTenantsAsStaff.cs)
- [BulkDeleteTenantsAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/BulkDeleteTenantsAsStaff.cs)

Why this matters:
- The validator checks only “array, non-empty, <= 100”.
- It does not validate that every element is a GUID.
- The handler silently filters invalid values out.
- A payload like `["valid-guid", "wat"]` partially executes and reports success for the valid item without telling the caller the request itself was malformed.

What good looks like:
- Either reject the entire request with `422` when any item is malformed, or explicitly return invalid items in a separate validation/result bucket.
- Current behavior is ambiguous and weakens operator trust.

2. Tenant-user search/filter query handling does not follow repo conventions and is behaviorally lossy.

Files:
- [FindTenantUsersAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs#L26)
- [UserService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L540)

Why this matters:
- The DTO properties `Q` and `Status` are missing `[FromQuery]`, contrary to the validator conventions guide.
- The query validator adds no rules for either field.
- Invalid `status` values are silently ignored in the service instead of returning `422`.
- OpenAPI therefore exposes uppercase `Q` and `Status` parameters, which is inconsistent with the tenant list endpoint and with URL conventions in the rest of the app.

Impact:
- External API consumers get a surprising contract.
- Invalid filters degrade into “unfiltered success”, which is bad API ergonomics and bad product feedback.

3. Tenant-user mutations do not invalidate the list query, so the table goes stale after success.

File:
- [tenant-users-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx#L437)

Why this matters:
- On success, remove/update mutations only show toast + close UI.
- They do not invalidate `useFindTenantUsers`.
- The removed user stays visible until a manual refresh.
- The changed level stays visible with the previous value until the next refetch.

Impact:
- Staff receive a success toast while the table still shows stale data.
- This produces a “did the action work?” trust problem.

4. The changed user-management service methods are too thin for likely business invariants.

File:
- [UserService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L712)

Why this matters:
- `RemoveUserFromTenantAsync` soft-deletes the account immediately.
- `UpdateUserLevelAsync` updates the level immediately.
- Neither method checks whether the operation would remove/demote the last tenant admin.

I am treating this as a major risk rather than a confirmed bug because the hard invariant is not stated in the changed code. But in a multi-tenant SaaS, allowing a tenant to end up with zero admins is usually unacceptable. At minimum this needs explicit confirmation.

5. The frontend export UX ignores partial-failure details from bulk endpoints.

Files:
- [tenants-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx#L154)
- [staff-tenant.hooks.ts](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts#L252)

Why this matters:
- The backend bulk endpoints return `failedItems`.
- The frontend discards that result and only invalidates the list.
- Operators get no count summary, no failed IDs, and no indication of partial success.

Impact:
- This is operationally weak for bulk admin tools.

### Minor Issues

1. `RemoveUserFromTenantAsStaff.cs` contains two handlers and one validator group in one file.

File:
- [RemoveUserFromTenantAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs)

This does not break runtime behavior, but it works against the repo’s vertical-slice discoverability. `RemoveUser...` and `UpdateUserLevel...` deserve separate files.

2. The tenant-user search implementation uses `ToLower().Contains(...)` rather than the repo’s better PostgreSQL-oriented search patterns.

File:
- [UserService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L530)

This is likely acceptable for small datasets, but it is a weaker implementation than the tenant list search, which explicitly documents index-aware semantics.

3. `common.en.json` and `common.fr.json` now contain duplicate `all-statuses` keys.

Files:
- [common.en.json](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/packages/shared-ts/lib/i18n/json/common.en.json#L537)
- [common.fr.json](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/packages/shared-ts/lib/i18n/json/common.fr.json)

This will usually “work” because the last key wins, but duplicate JSON keys are invalid data and easy to regress further.

4. The comment `Bulk actions (UI placeholder - bulk mutations not implemented yet)` is stale.

File:
- [tenants-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx#L324)

The code does implement mutations. The comment now misleads readers.

## Questions & Clarifications

1. Is “a tenant must always retain at least one admin” a hard business invariant?

Current assumption:
- Yes, or it should be.

Why I’m asking:
- The create-tenant flow clearly treats admin presence as important, but remove/demote flows do not preserve it.

2. Was the product intent for invite-user to:
- send an email immediately, or
- create an invitation and expose a link/token for manual distribution?

Current assumption:
- Immediate email send was intended, because the form copy says “Send invitation” and the handler contains the email TODO.

3. For export, was the intended contract:
- export only the current page, or
- export the full filtered result set?

Current assumption:
- Full filtered result set from the backend, because that is what the workstream description implies.

## Positive Aspects

- The implementation stays mostly within the repo’s domain-first module structure. The new tenant bulk handlers live under the tenant module, and the tenant-user management endpoints live under the user module.
- The API contract was regenerated cleanly: the client and OpenAPI artifacts reflect the handwritten endpoint additions.
- The tenant list cursor-pagination workstream is stronger than the tenant-user one. `FindTenantsAsStaff` includes explicit search/status parsing and proper invalid token handling.
- The bulk endpoints at least return structured partial-failure payloads instead of collapsing everything into a generic “failed”.
- Audit log action names were added for the new tenant/user operations, which is the right direction even though the bulk audit payloads are still thin.

## Specific Observations

### 1. Route Path Consistency

Current implementation:
- [Routes.Tenants.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Routes.Tenants.cs#L25) uses `/bulk-suspend`, `/bulk-reactivate`, `/bulk-delete`.

Comparison point:
- [Routes.Invitations.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Invitations/Routes.Invitations.cs) uses `/bulk` for bulk create.

Assessment:
- I would not block on the current tenant bulk route shape.
- The invitations route is not a strong precedent because it models “bulk collection creation”, not “an action against many existing resources”.
- Between the user’s two proposed shapes, `/bulk/suspend` and `/suspend/bulk`, neither is clearly established by repo precedent.
- The current `/bulk-suspend` style is flat, kebab-case, and internally consistent across all three tenant bulk actions.

Recommendation:
- Keep one convention and document it.
- If the team wants a long-term standard, I would choose one of:
  - flat action routes for collection-wide admin actions: `/bulk-suspend`
  - or explicit action namespace: `/actions/bulk-suspend`

I would not introduce `/delete/bulk` because the repo generally models actions as suffixes on resources, not prefix verbs.

### 2. Query Parameter Handling

The original asymmetry no longer exists in the same way:
- Tenant list query now supports search/status filters.
- Tenant-user query also supports search/status filters.

The real issue is quality, not absence:
- [FindTenantsAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs) normalizes `q`, validates `status`, and maps invalid values to `422`.
- [FindTenantUsersAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs#L26) exposes `Q`/`Status` without `[FromQuery]` attributes or custom validation.
- [UserService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L540) silently ignores invalid statuses.

Recommendation:
- Align the tenant-user query with the tenant-list implementation:
  - `[FromQuery(Name = "q")] public string? Search { get; set; }`
  - `[FromQuery] public string? Status { get; set; }`
  - validator rules for max length + allowed CSV statuses
  - getter methods on the DTO for normalization/parsing

## Detailed File Reviews

### Backend

#### [Routes.Tenants.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Routes.Tenants.cs)
- Good: bulk routes are centralized and consistently named.
- Concern: there is no export route despite A3 being in scope.
- Concern: route naming is internally consistent, but not yet codified anywhere as the project’s bulk-action standard.

#### [TenantAsStaffService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs)
- Good: `FindTenantsAsStaffAsync` is the strongest piece in this change set. Search/status filtering and cursor handling are thoughtfully implemented.
- Good: single-tenant suspend/reactivate/delete methods use `ExecuteUpdateAsync` with state predicates, which is a good race-resistant pattern.
- Concern: bulk methods are sequential wrappers over single-item calls. That is acceptable initially, but it makes latency linear in `tenantIds.Count`.
- Concern: bulk methods do not deduplicate ids, so repeated ids can distort success/failure counts.

#### [BulkSuspendTenantsAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/BulkSuspendTenantsAsStaff.cs)
- Good: returns structured partial-failure data.
- Major issue: body validation is inline and shallow; malformed ids are dropped silently.
- Minor issue: audit target is set to the actor user id, which weakens audit usefulness.

The same review applies to:
- [BulkReactivateTenantsAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/BulkReactivateTenantsAsStaff.cs)
- [BulkDeleteTenantsAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/BulkDeleteTenantsAsStaff.cs)

#### [UserEndpointsForTenantAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs)
- Good: routes and permissions are mapped in the correct scope.
- Good: `UPDATE_FOR_TENANT` is used consistently now.
- Concern: endpoint file is clean, but the underlying handler file grouping is still too coarse.

#### [CreateInvitationForTenantAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs)
- Good: mutual exclusivity checks and pending-invitation checks are present.
- Major issue: no email sending and no alternative distribution flow.
- Major issue: raw token returned to client without a clear product need.
- Minor issue: non-admin invites currently get an empty `profileIds` list with a “can be enhanced later” comment. That is a valid incremental choice only if downstream acceptance flow truly supports post-acceptance profile assignment.

#### [RemoveUserFromTenantAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs)
- Good: route-id parsing follows repo guidance.
- Concern: remove and update-level handlers should be split into separate files.
- Concern: not-found and invalid-account-level are collapsed too aggressively in the service layer.

#### [FindTenantUsersAsStaff.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs)
- Major issue: missing `[FromQuery]` attributes.
- Major issue: empty validator means malformed filter values are accepted.
- Good: handler does map discriminated-union results cleanly once the service returns them.

#### [UserService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs)
- Good: service owns the DB operations; handlers are not reaching into `DbContext`.
- Major issue: tenant-user query filter logic is weaker than tenant-list query logic.
- Major risk: remove/demote operations do not preserve likely admin invariants.
- Minor issue: invalid `accountLevel` returns `NotFound`, which is semantically wrong even if validator usually blocks it.

#### [AuditLog.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs)
- Good: new audit action constants were added.
- Concern: action names are fine, but the implementation currently underuses them by logging only summary-level bulk context.

#### [InvitationService.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Invitations/Services/InvitationService.cs)
- Good: `PendingTenantInvitationExistsAsync` is the right supporting abstraction.
- No major review issue here.

#### [CreateTenantAsStaff.Spec.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs)
- Good: the file exists and basic negative cases are covered.
- Concern: the central happy-path test is commented out, so the new test file does not actually validate successful creation behavior.
- Recommendation: add one seeded happy-path spec and one duplicate-name/conflict spec.

#### [FindTenantsAsStaff.Spec.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs)
- Good: this is the best-tested area in scope.
- Good: covers cursor errors, invalid sort ids, search, and multi-status filtering.
- Concern: no equivalent test depth exists yet for B3/B4/B5/B6.

### Frontend

#### [staff-tenant.hooks.ts](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts)
- Good: hooks are added in the right place and use the existing factory pattern.
- Concern: several new mutations rely on `as never` body casts. That is understandable with Kiota, but it reduces type confidence.
- Concern: the hooks expose bulk result payloads, but the UI currently does not use them.

#### [section-page-with-drawer.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/components/settings/section-page-with-drawer.tsx)
- Critical: the new `ctaOnClick` prop introduced a broken ownership model for drawer state.
- Recommendation: either make the drawer fully controlled (`open`, `onClose`) or keep it fully internal.

#### [invite-user-form.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/details/users/parts/invite-user-form.tsx)
- Good: uses RHF + Zod and form wrappers correctly.
- Concern: success toast says “Invitation sent” even though the backend does not send one.
- Concern: the mutation result is ignored; if the API continues returning a token, the UI should either use it or the API should stop returning it.

#### [tenant-users-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx)
- Critical: invalid default sort id.
- Major: no query invalidation after remove/update.
- Major: copy-link is hard-disabled, which compounds the incomplete invite flow.
- Minor: `Menu` anchoring via `document.activeElement` is brittle.

#### [tenant-details-users-page.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx)
- Critical only because of the wrapper interaction; by itself the page is simple and reasonable.

#### [tenants-table.tsx](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx)
- Good: bulk actions are wired into row selection and invalidate tenant list queries.
- Critical: export implementation is page-local and incomplete.
- Major: bulk result details are ignored.
- Minor: the delete icon in row actions is still inert (`voidFunction`) while bulk delete exists, which feels inconsistent.

### Generated / Contract Artifacts

#### [MainApi.json](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/openapi/MainApi.json)
- Good: generated contract reflects the new endpoints.
- Important observation: it now exposes `Q` and `Status` for tenant-user search, which confirms the missing `[FromQuery]` attribute problem in source.

#### [packages/client-ts/...](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/packages/client-ts/src/models/index.ts)
- Good: client regeneration is consistent with the OpenAPI changes.
- Important observation: generated output mirrors source problems faithfully. It is not the root cause.

#### [ResponseKeys.g.cs](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Generated/ResponseKeys.g.cs)
- Good: new translation keys were generated correctly.

#### [common.en.json](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/packages/shared-ts/lib/i18n/json/common.en.json)
- Minor: duplicate `all-statuses` key.

## Recommendations

### Immediate Actions

1. Fix drawer state ownership before merge.

Recommended direction:

```tsx
type SectionPageWithDrawerProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  // ...
};
```

Then render:

```tsx
<Button onClick={onOpen}>...</Button>
<Drawer open={open} onClose={onClose}>...</Drawer>
```

2. Fix tenant-user sorting before merge.

Recommended direction:

```tsx
const defaultSorting: MRT_SortingState[number] = {
  desc: true,
  id: 'createdat',
};
```

And ideally add a visible/hidden column whose id matches the backend exactly.

3. Make tenant-user query DTO consistent with repo conventions.

Recommended direction:

```csharp
public class FindTenantUsersAsStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery]
	public string? Status { get; set; }

	public string? GetSearchNormalized() => string.IsNullOrWhiteSpace(Search)
		? null
		: Search.Trim();
}

public class FindTenantUsersAsStaffQueryValidator
	: CursorPaginatedQueryValidator<FindTenantUsersAsStaffQuery> {
	private static readonly string[] AllowedStatuses = ["active", "pending", "suspended"];

	public FindTenantUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
		RuleFor(x => x.Status)
			.Must(raw => string.IsNullOrEmpty(raw)
				|| AllowedStatuses.Contains(raw.ToLowerInvariant()))
			.WithMessage("Status must be one of: active,pending,suspended");
	}
}
```

4. Either finish the invite flow or explicitly de-scope it.

Recommended direction:
- If email send is required: implement tenant invitation email sending before merge.
- If manual distribution is required: add invitation-management UI and a deliberate “copy invite link” UX instead of a false “sent” toast.
- Do not keep returning raw tokens to the browser unless the UI intentionally uses them.

5. Rework export as a backend-driven feature.

Recommended direction:
- Add export endpoints that accept the same filter params as `FindTenantsAsStaff`.
- Generate CSV/JSON server-side for the full filtered dataset.
- Keep the current client-side export only as a temporary fallback if it is clearly labeled “export current page”.

6. Invalidate tenant-user queries after remove/update mutations.

Recommended direction:

```tsx
const queryClient = useQueryClient();

onSuccess: () => {
  queryClient.invalidateQueries({
    queryKey: useFindTenantUsers.getKey({ tenantId }),
  });
}
```

7. Tighten bulk validators so bad payloads do not partially succeed silently.

### Future Improvements

1. Add integration tests for:
- invite tenant user happy path
- invite tenant user duplicate/pending invitation
- remove tenant user success/not-found
- update tenant user level success/invalid level/not-found
- tenant-user search and status filtering
- bulk suspend/reactivate/delete partial success and malformed ids

2. Consider richer bulk-audit details:
- requested tenant ids
- succeeded tenant ids
- failed tenant ids and reasons

3. Standardize bulk action route conventions in `docs/guides/api-route-design.md` so future slices do not guess.

## Code Examples

### Example 1: Fix the drawer ownership bug

Current behavior:

```tsx
const handleCtaClick = ctaOnClick || openDrawer.onTrue;
<Drawer open={openDrawer.value} ... />
```

Problem:
- CTA can mutate one state source while the drawer renders from another.

Better:

```tsx
type SectionPageWithDrawerProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  // ...
};

<Button onClick={onOpen}>...</Button>
<Drawer open={open} onClose={onClose}>...</Drawer>
```

### Example 2: Reject malformed bulk ids instead of silently dropping them

Current behavior:

```csharp
foreach (var id in body.TenantIds.EnumerateArray()) {
	if (id.TryGetGuid(out var guid)) {
		validIds.Add(guid);
	}
}
```

Better:

```csharp
RuleFor(x => x.TenantIds)
	.Must(x => x.ValueKind == JsonValueKind.Array)
	.WithMessage("TenantIds must be an array")
	.Must(x => x.EnumerateArray().All(item => item.TryGetGuid(out _)))
	.WithMessage("Every tenantId must be a valid GUID");
```

If partial success is desired, surface malformed ids explicitly in `failedItems` rather than silently discarding them.

### Example 3: Stop overpromising on invitation sending

Current behavior:

```tsx
toast.success(t('invitation-sent-success'));
```

Better if email is not implemented yet:

```tsx
toast.success(t('invitation-created-success'));
```

And pair it with deliberate product behavior:
- show copy-link action, or
- open invitation details immediately, or
- do not ship the feature until sending exists.

## Final Assessment

The strongest parts of this change are:
- tenant list search/filter pagination
- basic endpoint wiring
- regenerated contract artifacts

The weakest parts are:
- invite-user product completion
- tenant-user list/query correctness
- export completeness
- operational UX after bulk/user mutations

This should not merge as-is. Fix the critical issues first, then the major issues. After that, the implementation will be much closer to the standards already visible elsewhere in the repo.
