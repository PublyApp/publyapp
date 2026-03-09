# Deep Review: Tenant Module Completion - Round 2

## Executive Summary

The round-2 revisions improve several concrete problems from the first review:

- the drawer wrapper is now properly controllable
- the tenant-users table no longer defaults to an obviously invalid sort id
- bulk validators now reject malformed GUID payloads
- remove/update tenant-user mutations now invalidate the list query
- last-admin protections were added for remove/demote flows

Those are real improvements. The implementation is still not merge-ready, though, because the new `PATCH /staff/tenants/{tenantId}/users/{userId}` slice is internally inconsistent across backend source, generated OpenAPI, generated Kiota client, and frontend usage.

The most important remaining issue is not a stylistic one: the frontend still sends `accountLevel`, while the new backend handler expects `level`. The generated client and OpenAPI also still describe the route as the old "update level" endpoint and return `ApiResponse`, not the new tenant-user DTO. That means the most important architectural revision in round 2 is not actually wired end to end.

Validation performed during this review:

- `dotnet build apps/api/MainApi.csproj -c Test` passed
- `make tsc-front` passed

I did not run integration tests. The review therefore treats build health and runtime contract health separately.

## Observations & Issues

### Critical Issues

#### 1. The new PATCH contract is broken between frontend, OpenAPI, and backend

Files:

- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- `packages/client-ts/src/staff/tenants/item/users/item/index.ts`
- `apps/api/openapi/MainApi.json`

Why this is critical:

- The backend handler now expects body fields named `firstName`, `lastName`, `avatarUrl`, `level`, and `isSuspended`.
- The frontend mutation hook still sends:

```ts
const body = {
	accountLevel: createUntypedString(variables.accountLevel),
};
```

- The generated Kiota request builder still serializes `UpdateUserLevelAsStaffBody`.
- The generated OpenAPI path still describes the operation as "Update a user's account level in a tenant" and still uses the old schema/response contract.

Practical impact:

- The UI path for changing a tenant user's level is still effectively wired to the old request shape.
- Because the hook uses `as never`, TypeScript does not protect the call site.
- The route may return `400 No fields to update` even though the UI looks correct.
- Even if the backend call succeeds after manual adjustment, the generated client contract is lying to every consumer.

This is the highest priority blocker in the revision set.

#### 2. The generated API contract was not brought into sync with the refactor

Files:

- `apps/api/openapi/MainApi.json`
- `packages/client-ts/src/staff/tenants/item/users/item/index.ts`
- `packages/client-ts/src/models/index.ts`

Why this is separately critical:

- The repo explicitly treats OpenAPI as the source of truth for the client contract.
- The generated client for the patched route still imports `serializeUpdateUserLevelAsStaffBody` and returns `ApiResponse`.
- The handwritten handler returns `Ok<GetTenantUserByIdResult>`.

This is more than stale documentation:

- frontend code generation now codifies the wrong contract
- future consumers will build on a false schema
- the route semantics in Scalar/client code are now different from the server implementation

In this repo, a backend refactor is not complete until `OpenAPI -> Kiota -> frontend` all describe the same shape. That did not happen here.

### Major Issues

#### 1. `UpdateTenantUserAsStaff` does not follow the repo's clearable PATCH-field pattern

Files:

- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Services/UserService.cs`

Why this matters:

- The repo guidance explicitly calls out `PatchField<T>` for clearable nullable PATCH fields.
- `UpdateTenantUserAsStaffBody` uses `JsonElement?` plus helper methods that collapse "omitted" and "explicit null" into the same outcome for string fields.
- `UpdateTenantUserDocument` then uses plain nullable strings:

```csharp
public class UpdateTenantUserDocument {
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public string? Level { get; set; }
	public bool? IsSuspended { get; set; }
}
```

Consequence:

- `avatarUrl` cannot be cleared intentionally.
- The endpoint claims to be a broader update document, but it still behaves like a "set only when non-null" patch.

Compared with `UpdateStaffUser`, this is consistent in style, but it repeats the same limitation instead of using the stronger repo pattern. For the new broader handler, that is a missed architectural improvement.

#### 2. The service method duplicates older level-update logic instead of replacing it cleanly

Files:

- `apps/api/Src/Modules/Users/Services/UserService.cs`

Why this matters:

- `UpdateUserLevelAsync` still exists.
- `UpdateTenantUserAsync` now re-implements overlapping invariants and level parsing logic.
- Both methods handle "last admin" protection separately.

Risks:

- future changes to admin invariants can drift between the legacy level-only method and the broader document method
- error semantics already drift: invalid account level in the legacy path becomes `NotFound`, while the new path relies on validator + `NotFound` fallback

Recommendation:

- either remove the superseded level-only service path entirely and migrate all callers
- or make `UpdateUserLevelAsync` a thin wrapper around `UpdateTenantUserAsync`

The current shape leaves both pathways alive without a clear ownership boundary.

#### 3. The new response DTO is awkwardly named and not aligned to an actual GET slice

Files:

- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`

Why this matters:

- The PATCH handler returns `GetTenantUserByIdResult`.
- There is no mapped `GET /staff/tenants/{tenantId}/users/{userId}` endpoint in this slice.
- The DTO lives inside the PATCH handler file.

That naming creates confusion:

- it looks like a shared read-model but is not actually shared
- it implies a GET endpoint that does not exist in this route group
- it makes OpenAPI/client drift harder to notice because the return type reads like a reused canonical DTO

Recommendation:

- either add the missing GET-by-id slice and intentionally share the DTO
- or rename this to something operation-neutral such as `TenantUserDetailsResult`

#### 4. Test coverage still does not match the risk of the new refactor

Files:

- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
- absence of specs for `UpdateTenantUserAsStaff`
- absence of specs for `RemoveUserFromTenantAsStaff`

Why this matters:

- The review found the round-2 contract mismatch without any failing automated test.
- There are still no integration tests for:
  - update tenant user success
  - invalid body / no fields to update
  - cannot demote last admin
  - cannot suspend last admin
  - remove user success
  - cannot remove last admin

For a multi-tenant admin slice, those are core behavior tests, not nice-to-haves.

#### 5. The frontend abstraction names still reflect the pre-refactor API

Files:

- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

Why this matters:

- The route is now a broader tenant-user patch endpoint.
- The hook is still named `useUpdateTenantUserLevel`.
- The table mutation still calls `updateLevel`.

That is not just naming debt. It is exactly why the wrong request body survived the refactor. The frontend abstraction still assumes the old endpoint.

### Minor Issues

#### 1. `SectionPageWithDrawer` is now correct, but the API is slightly over-flexible

File:

- `apps/front/src/components/settings/section-page-with-drawer.tsx`

The revised ownership model works. That resolves the original blocker.

The remaining minor concern is API shape:

- `open`, `onOpen`, and `onClose` are all optional
- uncontrolled mode still exists
- partially controlled usage is therefore possible

The implementation currently guards this reasonably, but the component contract would be clearer if it either:

- stayed fully uncontrolled, or
- used a discriminated controlled/uncontrolled prop shape

This is not a merge blocker now that the drawer actually works.

#### 2. Bulk toast UX improved, but failure reasons are still discarded

File:

- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

The new success/partial-success counts are better than the previous silent behavior.

Remaining gap:

- `failedItems` still are not surfaced to operators
- bulk admin tools usually need at least a "view failed IDs/reasons" affordance

This is a product-quality improvement, not a correctness blocker.

#### 3. The export code is now honest, but product scope should be clarified

File:

- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

This revision fixed the misleading blank columns from the previous review. That is good.

What remains:

- export is still current-page, client-side only
- the code comments are honest about that limitation

So the implementation is internally consistent now, but if A3 still means "export the filtered dataset", that work is still not done. I would treat this as a product clarification issue, not a new code defect in round 2.

### Questions & Clarifications

#### 1. Was the legacy level-only PATCH schema intentionally kept alive in OpenAPI?

Current assumption:

- No. This looks accidental and unsafe.

Why this matters:

- If intentional, the handwritten backend source and generated contract need to be reconciled in a documented compatibility plan.
- If accidental, this is a must-fix before merge.

#### 2. Should tenant-user PATCH support clearing `avatarUrl`?

Current assumption:

- Yes, or at minimum the code should preserve the repo's `PatchField<T>` option for clearable fields.

Why this matters:

- The current document pattern cannot distinguish omitted from explicit null for clearable string fields.

#### 3. Is a dedicated GET-by-id tenant-user endpoint planned?

Current assumption:

- Not currently mapped.

Why this matters:

- The return type naming strongly implies a shared read model that does not yet exist.

## Positive Aspects

- The drawer state fix is directionally correct and resolves the original "cannot open" defect.
- The tenant-users table now uses `createdat`, which aligns with the service's supported sort ids.
- The query invalidation additions are correct and materially improve operator trust after mutations.
- The bulk validators now reject malformed GUID arrays instead of silently dropping invalid entries.
- The service now enforces two important business invariants:
  - cannot remove the last admin
  - cannot demote the last admin
- The query DTO for tenant-user search is cleaner than before:
  - `[FromQuery(Name = "q")]`
  - search normalization helper
  - explicit validator rule for allowed status values

These are meaningful improvements. The round-2 refactor did not fail because nothing improved; it failed because the contract synchronization work is incomplete.

## Detailed File Reviews

### `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`

What is good:

- The handler follows the expected route-parameter guard style.
- It keeps `DbContext` out of the handler and delegates work to `IUserService`.
- It adds audit logging for successful mutation.
- It introduces a broader document that is architecturally more future-friendly than a one-off "update level" slice.

Issues:

- The body shape is only partially consistent with repo patch conventions. `JsonElement?` plus nullable-string document fields do not support clearable nullable fields well.
- `Level` validation is implemented inline rather than through a shared extension the way `UpdateStaffUserBodyValidator` uses repo validation helpers.
- The "no fields to update" guard is reasonable, but because the frontend still sends `accountLevel`, it becomes the symptom of a contract bug rather than a user-facing validation path.
- `GetTenantUserByIdResult` is misnamed for this slice.

Assessment against `UpdateStaffUser`:

- Structurally similar, but not fully improved.
- If the goal was "broader handler modeled after `UpdateStaffUser`", the code is close.
- If the goal was "broader handler that also follows current repo guidance for clearable PATCH documents", it falls short.

### `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`

What is good:

- The split is cleaner than the previous two-handlers-in-one-file setup.
- Route-id parsing and typed problem responses follow repo conventions.
- Audit logging is straightforward and useful.

Issues:

- No major code issues remain in this file itself.
- The more important gap is missing direct specs for its domain invariants.

### `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`

What is good:

- Endpoint mapping is clean.
- Permission constants are now consistent.
- Body/query validation hooks are registered correctly for the slices present.

Issues:

- The route group still exposes a PATCH route whose generated contract does not match the handwritten implementation.
- There is still no GET-by-id tenant-user endpoint, which makes the PATCH response DTO naming awkward.

### `apps/api/Src/Modules/Users/Services/UserService.cs`

What is good:

- The service correctly owns domain/data mutation logic.
- The new last-admin protections for remove/demote are a strong improvement.
- `UpdateTenantUserAsync` groups user-table and account-table updates in one service method, which is directionally right for this slice.

Issues:

- The new method duplicates old level-update logic instead of subsuming it.
- Invalid `document.Level` still degrades into `NotFound`, which is semantically weak even if the validator normally blocks it.
- The document pattern still cannot express clear-null for fields such as avatar URL.
- There is no explicit result case for "nothing changed" or "invalid document"; the handler owns that guard instead of the service.

On the document-pattern question:

- It resembles `UpdateUserDocument` in shape.
- It is not as strong as it should be for a new document-based handler because it did not adopt `PatchField<T>` where appropriate.

### `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

What is good:

- `TenantUserUpdated` is the right audit action addition for the refactor.

Minor concern:

- `TenantUserLevelUpdated` still exists alongside `TenantUserUpdated`. If the old level-only pathway is being replaced, these actions may need a clearer long-term ownership story to avoid semantically overlapping audit trails.

### `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`

What is good:

- The query DTO is improved from round 1.
- `[FromQuery(Name = "q")]` is correct.
- Search normalization helper improves cleanliness.
- The validator now rejects unsupported status values.

Remaining concern:

- This slice is in better shape than before, but it still lacks matching breadth in spec coverage for search/status behaviors.

### `apps/front/src/components/settings/section-page-with-drawer.tsx`

What is good:

- The controlled-state fix works.
- `tenant-details-users-page.tsx` now uses it correctly with `open/onOpen/onClose`.

Minor concern:

- The prop contract allows partially controlled combinations that are harder to reason about than a stricter API.

### `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

What is good:

- The default sort id is corrected to `createdat`.
- Remove/update mutations now invalidate `useFindTenantUsers`.

Critical issue:

- The table still uses `useUpdateTenantUserLevel`, which sends the old request body shape.
- The route refactor on the backend did not propagate here.

Product concern:

- There is still no UI for broader fields such as `isSuspended`, despite the handler now exposing that capability.
- That is not a defect by itself, but it means the backend broadened faster than the product surface did.

### `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

What is good:

- Partial-success toast messaging is better.
- The export output no longer pretends to contain fields that are not present in row data.

Remaining gaps:

- export remains current-page only
- failure reasons remain hidden

### `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

What is good:

- The query/mutation hooks still follow the repo's factory pattern.

Critical issue:

- The patch hook is still a level-only abstraction and still sends `accountLevel`.
- `as never` hides a contract mismatch that the generated client should have prevented.

This is the file where the round-2 backend refactor most clearly failed to reach the frontend.

### `apps/api/openapi/MainApi.json`

Critical issue:

- The patch path still describes the old endpoint shape and old response type.

This means the codebase is currently violating its own contract-generation workflow.

### `packages/client-ts/src/staff/tenants/item/users/item/index.ts`

Critical issue:

- The request builder still imports and serializes `UpdateUserLevelAsStaffBody`.
- The patch response type is still `ApiResponse`.

This generated file is not "wrong on its own"; it is evidence that the backend contract generation step did not produce the intended result.

### `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`

What is good:

- The query slice has baseline pagination/security coverage.

Remaining gap:

- Round-2 changes were far more centered on remove/update contract correctness than on query behavior.
- There are still no direct specs protecting the most risky refactor.

## Recommendations

### Immediate Actions

1. Fix the PATCH contract end to end before merge.

Required outcomes:

- OpenAPI path for `PATCH /staff/tenants/{tenantId}/users/{userId}` must describe the new body schema and new success DTO.
- Kiota client must regenerate to the new schema.
- frontend hook must send `level`, not `accountLevel`, or adopt the generated request type directly.
- route summary/operation naming should match the broadened behavior.

2. Rename and re-scope the frontend hook to match the new backend.

Recommended direction:

```ts
export const useUpdateTenantUser = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').users.byUserId('').patch,
	mutationFn: async (
		client,
		variables: {
			tenantId: string;
			userId: string;
			level?: 'Admin' | 'User';
			isSuspended?: boolean;
			firstName?: string;
			lastName?: string;
			avatarUrl?: string | null;
		},
	) => {
		const body = {
			level: variables.level
				? createUntypedString(variables.level)
				: undefined,
		};
		return client.staff.tenants
			.byTenantId(variables.tenantId)
			.users.byUserId(variables.userId)
			.patch(body as never);
	},
});
```

Even better: stop using `as never` once the generated client is corrected.

3. Decide whether `avatarUrl` should be clearable and model it explicitly.

If yes, adopt `PatchField<T>`-style semantics in the service document rather than collapsing null and omission.

4. Add integration tests for the new mutation slice before merge.

Minimum set:

- update level success
- update with no fields returns bad request
- cannot demote last admin
- cannot suspend last admin
- remove user success
- cannot remove last admin

5. Clean up the service ownership story.

Choose one:

- make `UpdateTenantUserAsync` the canonical mutation path and delete the obsolete level-only service method
- or make the level-only method delegate to the broader document method

### Future Improvements

1. If the product intends to expose profile-field editing soon, add UI affordances for:

- first name
- last name
- avatar URL
- suspension state

2. If a GET-by-id tenant-user endpoint is planned, add it and intentionally share the response DTO.

3. Consider stricter controlled/uncontrolled props in `SectionPageWithDrawer` to reduce misuse surface.

4. Consider surfacing `failedItems` in a dialog or expandable toast for bulk tenant actions.

## Code Examples

### Example 1: Fix the frontend request shape

Current:

```ts
const body = {
	accountLevel: createUntypedString(variables.accountLevel),
};
```

Problem:

- this still targets the old contract
- the backend handler now expects `level`

Better:

```ts
const body = {
	level: createUntypedString(variables.level),
};
```

Best:

- use the regenerated request model directly once the OpenAPI schema is corrected
- remove `as never`

### Example 2: Use a clearable patch-field document for `avatarUrl`

Current:

```csharp
public class UpdateTenantUserDocument {
	public string? AvatarUrl { get; set; }
}
```

Problem:

- cannot distinguish omitted from explicit null

Better:

```csharp
public class UpdateTenantUserDocument {
	public PatchField<string?> AvatarUrl { get; set; }
}
```

Then the service can apply:

```csharp
if (document.AvatarUrl.IsPresent) {
	user.AvatarUrl = document.AvatarUrl.Value;
}
```

### Example 3: Rename the response DTO to reflect its actual role

Current:

```csharp
public class GetTenantUserByIdResult {
	// ...
}
```

Better if there is no GET slice yet:

```csharp
public class TenantUserDetailsResult {
	// ...
}
```

Better if a GET slice is added:

- move the DTO into a shared query/result location and use it from both GET and PATCH intentionally

## Final Assessment

The round-2 revisions are materially better than the round-1 implementation, but they are still not safe to merge as-is.

The main reason is straightforward: the most important refactor, `UpdateTenantUserAsStaff`, is not synchronized across server implementation, generated contract, generated client, and frontend hook usage. That is a production risk, not a stylistic disagreement.

Merge recommendation:

- `SectionPageWithDrawer`, bulk GUID validation, query invalidation, and last-admin protections are acceptable improvements.
- `UpdateTenantUserAsStaff` should not merge until the request/response contract is corrected end to end and the mutation path is covered by integration tests.

Current answer to "Can this be merged as-is?":

- No.
