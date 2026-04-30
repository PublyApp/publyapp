# Staff Users Table Full Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver issue `#280` for `staff-users-table` end-to-end: add the missing staff-user lifecycle APIs, regenerate the contract, and upgrade the list to the shared actionable-table UX with selection mode, export, and status filtering.

**Architecture:** The backend keeps `Users` as the single owner of staff lifecycle rules by extending `FindStaffUsers` with a server-side `status` filter, adding a transactional single-delete flow, and introducing bounded bulk lifecycle endpoints with summary audit events. The frontend then splits the current monolithic table into a small controller plus focused toolbar/export/selection/action components that plug into the shared MRT toolbar slots, export only the currently loaded rows or selected rows, and invalidate the staff-users query family exactly once per completed mutation batch.

**Tech Stack:** .NET 10 minimal APIs, EF Core + PostgreSQL, FluentValidation, React 19, TanStack Query, Material UI v6, Material React Table, nuqs, Kiota-generated TypeScript client.

---

## File Map

### Backend API

- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/DeleteStaffUser.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/DeleteStaffUser.Spec.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.Spec.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.Spec.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/StaffUserDangerZonePermissions.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Routes.Users.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`
- Modify: `apps/api/Src/Lib/Validation/JsonElementRules.cs`

### Backend Translations / Generated Keys

- Modify: `packages/shared-ts/lib/i18n/json/response-message.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/response-message.fr.json`
- Modify/generated: `apps/api/Generated/ResponseKeys.g.cs`

### Generated Client Contract

- Modify/generated: `packages/client-ts/src/models/index.ts`
- Modify/generated: `packages/client-ts/src/staff/users/index.ts`
- Modify/generated: `packages/client-ts/src/staff/users/**`

### Frontend Shared Hooks / Translations

- Modify: `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`

### Frontend Staff Users List

- Modify: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/use-staff-users-table-controller.ts`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/use-staff-users-bulk-actions.ts`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-toolbar-filters.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-selection-actions.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-export-dialog-controller.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-bulk-action-dialogs.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-user-row-actions.tsx`

---

### Task 1: Add Server-Side `status` Filtering To `FindStaffUsers`

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs`

- [ ] **Step 1: Add failing list tests for the new `status` filter and invalid filter values**

Update `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs` with status-focused coverage and extend `GetFindUrl(...)` with an optional `status` query argument.

```csharp
[Fact]
public async Task ItShouldFilterStaffUsersByStatusQuery() {
	var token = await _authClient.LoginAsStaffAdminAsync();
	var activeId = await CreateStaffUserAsync(token, $"active-{Guid.NewGuid():N}@example.com");
	var suspendedId = await CreateStaffUserAsync(token, $"suspended-{Guid.NewGuid():N}@example.com");

	await SetStaffUserStatusAsync(activeId, UserStatus.Active);
	await SetStaffUserStatusAsync(suspendedId, UserStatus.Suspended);

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetFindUrl(limit: 50, status: "suspended")
	).WithSessionToken(token);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.OK);

	var result = await response.Content.ReadFromJsonAsync<FindResponse>();
	result.Should().NotBeNull();
	result!.Data.Should().ContainSingle(user => user.Id == suspendedId);
	result.Data.Should().NotContain(user => user.Id == activeId);
}

[Fact]
public async Task ItShouldReturnValidationProblemForUnknownStatusFilter() {
	var token = await _authClient.LoginAsStaffAdminAsync();

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetFindUrl(status: "banned")
	).WithSessionToken(token);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

	var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
	problem.Should().NotBeNull();
	problem!.Errors.Should().ContainKey("Status");
}
```

- [ ] **Step 2: Run the targeted spec and verify it fails**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec"
```

Expected:

```text
FAIL - FindStaffUsersQuery does not accept `status` yet
```

- [ ] **Step 3: Extend the query DTO and validator in `FindStaffUser.cs`**

Keep the handler-local query contract aligned with the repo’s CSV enum-filter convention.

```csharp
public class FindStaffUsersQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery]
	public string? Status { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public IReadOnlySet<UserStatus>? GetStatusesOrNull() {
		if (string.IsNullOrWhiteSpace(Status)) {
			return null;
		}

		var parts = Status.Split(
			',',
			StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
		);
		if (parts.Length == 0) {
			return null;
		}

		var statuses = new HashSet<UserStatus>();
		foreach (var part in parts) {
			var parsed = User.ParseStatus(part);
			if (parsed is { } status) {
				statuses.Add(status);
			}
		}

		return statuses.Count > 0 ? statuses : null;
	}
}

public class FindStaffUsersQueryValidator
	: CursorPaginatedQueryValidator<FindStaffUsersQuery> {
	private static readonly HashSet<string> AllowedStatuses =
		new(["active", "pending", "suspended", "inactive"], StringComparer.OrdinalIgnoreCase);

	public FindStaffUsersQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				var parts = raw.Split(
					',',
					StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
				);
				return parts.All(AllowedStatuses.Contains);
			})
			.WithMessage("Status must be comma-separated: active,pending,suspended,inactive");
	}
}
```

- [ ] **Step 4: Thread `status` through `UserService.FindStaffUsersAsync`**

Expand the filter record and keep filtering inside SQL rather than in-memory.

```csharp
public sealed record FindStaffUsersFilters(
	string? Search,
	IReadOnlySet<UserStatus>? Status
);

// inside HandleFindStaffUsers(...)
Filters: new FindStaffUsersFilters(
	Search: search,
	Status: findStaffUsersQuery.GetStatusesOrNull()
)
```

```csharp
if (args.Filters?.Status is { Count: > 0 } statuses) {
	query = query.Where(ua => statuses.Contains(ua.User.Status));
}
```

- [ ] **Step 5: Re-run the list spec**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec"
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit the list-filter contract change**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs
git commit -m "feat(api): add status filters to staff users list"
```

### Task 2: Add Single Staff-User Delete With Transactional Soft Delete

**Files:**
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/DeleteStaffUser.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/DeleteStaffUser.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/StaffUserDangerZonePermissions.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`
- Modify: `packages/shared-ts/lib/i18n/json/response-message.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/response-message.fr.json`

- [ ] **Step 1: Write the failing delete integration tests**

Create `apps/api/Src/Modules/Users/Handlers/Staff/DeleteStaffUser.Spec.cs` and extend `StaffUserDangerZonePermissions.Spec.cs` with delete-permission coverage.

```csharp
[Fact]
public async Task ItShouldSoftDeleteSuspendedStaffUserAndHideThemFromAllStaffSurfaces() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var email = $"delete-{Guid.NewGuid():N}@example.com";
	var userId = await CreateStaffUserAsync(staffToken, email);
	var profileId = await CreateStaffProfileAsync(staffToken);

	await AssignProfileAsync(staffToken, userId, profileId);
	await SuspendStaffUserAsync(staffToken, userId);

	using var response = await DeleteStaffUserAsync(staffToken, userId);

	response.StatusCode.Should().Be(HttpStatusCode.OK);
	(await response.Content.ReadFromJsonAsync<ApiResponse>())!.Key
		.Should().Be("staff-user-deleted-success");

	await AssertFindStaffUsersDoesNotContainAsync(staffToken, userId);
	await AssertGetStaffUserReturnsNotFoundAsync(staffToken, userId);
	await AssertGetStaffUserProfilesReturnsNotFoundAsync(staffToken, userId);
}

[Fact]
public async Task ItShouldReturnBadRequestWhenDeletingANonSuspendedStaffUser() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var userId = await CreateStaffUserAsync(
		staffToken,
		$"not-suspended-{Guid.NewGuid():N}@example.com"
	);

	using var response = await DeleteStaffUserAsync(staffToken, userId);

	response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	(await response.Content.ReadFromJsonAsync<AppProblemDetails>())!.TranslationKey
		.Should().Be("staff-user-not-suspended-cannot-delete");
}
```

```csharp
[Fact]
public async Task ItShouldReturnForbiddenForStaffWithoutDeletePermission() {
	var token = await CreateUnprivilegedStaffUserTokenAsync();
	var adminToken = await _authClient.LoginAsStaffAdminAsync();
	var existingUserId = await GetStaffUserIdByEmailAsync(
		_http,
		adminToken,
		TestConstants.StaffAdminEmail
	);

	using var request = new HttpRequestMessage(
		HttpMethod.Delete,
		GetDeleteUrl(existingUserId)
	).WithSessionToken(token);

	using var response = await _http.SendAsync(request);
	response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
}
```

- [ ] **Step 2: Run the targeted delete specs and verify failure**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~DeleteStaffUserSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserDangerZonePermissionsSpec"
```

Expected:

```text
FAIL - no delete handler/endpoint exists for staff users yet
```

- [ ] **Step 3: Map the existing delete route in `UserEndpointsForStaff.cs`**

`Routes.Users.ForStaff.Delete` already exists; only the endpoint registration is missing.

```csharp
group.MapDelete(
		Routes.Users.ForStaff.Delete,
		DeleteStaffUser.HandleDeleteStaffUser
	)
	.WithName("DeleteStaffUser")
	.WithSummary("Soft-delete a suspended staff user")
	.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_STAFF]);
```

- [ ] **Step 4: Add the service result + transactional soft-delete implementation**

Keep delete centralized in `UserService` and make the soft-delete set-based for `User`, `UserAccount`, and `UserAccountProfile`.

```csharp
public abstract record DeleteStaffUserResult {
	public sealed record Success(StaffUserData UserData, Guid UserAccountId) : DeleteStaffUserResult;
	public sealed record NotFound() : DeleteStaffUserResult;
	public sealed record NotSuspended() : DeleteStaffUserResult;
}

Task<DeleteStaffUserResult> DeleteStaffUserAsync(
	Guid userId,
	CancellationToken cancellationToken = default
);
```

```csharp
public async Task<DeleteStaffUserResult> DeleteStaffUserAsync(
	Guid userId,
	CancellationToken cancellationToken = default
) {
	var target = await (
		from ua in _dbContext.UserAccount
		where ua.UserId == userId
			&& ua.Scope == AccountScope.Staff
			&& !ua.IsDeleted
			&& !ua.User.IsDeleted
		select new {
			UserAccountId = ua.GetRequiredId(),
			User = ua.User,
			Level = ua.Level,
		}
	).FirstOrDefaultAsync(cancellationToken);

	if (target is null) {
		return new DeleteStaffUserResult.NotFound();
	}

	if (!target.User.IsSuspended()) {
		return new DeleteStaffUserResult.NotSuspended();
	}

	var now = DateTime.UtcNow;
	await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

	await _dbContext.UserAccountProfile
		.Where(x => x.UserAccountId == target.UserAccountId && !x.IsDeleted)
		.ExecuteUpdateAsync(setters => setters
			.SetProperty(x => x.IsDeleted, true)
			.SetProperty(x => x.DeletedAt, now)
			.SetProperty(x => x.UpdatedAt, now),
			cancellationToken);

	await _dbContext.UserAccount
		.Where(x => x.Id == target.UserAccountId && !x.IsDeleted)
		.ExecuteUpdateAsync(setters => setters
			.SetProperty(x => x.IsDeleted, true)
			.SetProperty(x => x.DeletedAt, now)
			.SetProperty(x => x.UpdatedAt, now),
			cancellationToken);

	await _dbContext.User
		.Where(x => x.Id == userId && !x.IsDeleted)
		.ExecuteUpdateAsync(setters => setters
			.SetProperty(x => x.IsDeleted, true)
			.SetProperty(x => x.DeletedAt, now)
			.SetProperty(x => x.UpdatedAt, now),
			cancellationToken);

	await transaction.CommitAsync(cancellationToken);

	return new DeleteStaffUserResult.Success(
		new StaffUserData {
			User = target.User,
			AccountLevel = target.Level,
		},
		target.UserAccountId
	);
}
```

- [ ] **Step 5: Create the handler, audit action, and response-message keys**

`DeleteStaffUser.cs` should follow the tenant-delete shape: malformed id `400`, missing user `404`, not suspended `400`, success `200`.

```csharp
public class DeleteStaffUser {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleDeleteStaffUser(
		[FromRoute] string userId,
		[FromServices] IUserService userService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest("Invalid user ID", ResponseKeys.MalformedId);
		}

		var result = await userService.DeleteStaffUserAsync(userIdGuid, cancellationToken);

		if (result is DeleteStaffUserResult.NotFound) {
			return TypedProblems.NotFound("Staff user not found", ResponseKeys.UserNotFound);
		}

		if (result is DeleteStaffUserResult.NotSuspended) {
			return TypedProblems.BadRequest(
				"Only suspended staff users can be deleted",
				ResponseKeys.StaffUserNotSuspendedCannotDelete
			);
		}

		var account = authContext.AccountStaff
			?? throw new InvalidOperationException("Staff account missing from auth context.");
		var success = (DeleteStaffUserResult.Success)result;

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.StaffUserDeleted,
			userIdGuid,
			new { UserEmail = success.UserData.User.Email },
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Staff member deleted successfully",
				ResponseKeys.StaffUserDeletedSuccess
			)
		);
	}
}
```

```csharp
public static class AuditActions {
	public const string StaffUserDeleted = "staff.user.deleted";
}
```

```json
{
	"staff-user-deleted-success": "Staff member deleted successfully",
	"staff-user-not-suspended-cannot-delete": "Only suspended staff users can be deleted"
}
```

- [ ] **Step 6: Re-run the delete and permission specs**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~DeleteStaffUserSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserDangerZonePermissionsSpec"
```

Expected:

```text
PASS
```

- [ ] **Step 7: Commit the single-delete slice**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/DeleteStaffUser.cs apps/api/Src/Modules/Users/Handlers/Staff/DeleteStaffUser.Spec.cs apps/api/Src/Modules/Users/Handlers/Staff/StaffUserDangerZonePermissions.Spec.cs apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs packages/shared-ts/lib/i18n/json/response-message.en.json packages/shared-ts/lib/i18n/json/response-message.fr.json
git commit -m "feat(api): add staff user delete lifecycle"
```

### Task 3: Add Shared GUID-Array Validation And Bulk Suspend / Reactivate Endpoints

**Files:**
- Modify: `apps/api/Src/Lib/Validation/JsonElementRules.cs`
- Modify: `apps/api/Src/Modules/Users/Routes.Users.cs`
- Modify: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.Spec.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/StaffUserDangerZonePermissions.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

- [ ] **Step 1: Add failing bulk suspend/reactivate specs**

Create dedicated specs for validation, success, and partial success. Add 403 coverage for the two new routes in `StaffUserDangerZonePermissions.Spec.cs`.

```csharp
[Fact]
public async Task ItShouldReturnValidationProblemForMalformedBulkSuspendBody() {
	var token = await _authClient.LoginAsStaffAdminAsync();

	using var request = new HttpRequestMessage(
		HttpMethod.Post,
		GetBulkSuspendUrl()
	).WithSessionToken(token);

	request.Content = JsonContent.Create(new {
		userIds = new[] { "not-a-guid" },
	});

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
}

[Fact]
public async Task ItShouldReturnPartialSuccessWhenBulkSuspendMixesValidAndInvalidTargets() {
	var token = await _authClient.LoginAsStaffAdminAsync();
	var activeUserId = await CreateStaffUserAsync(token, $"bulk-active-{Guid.NewGuid():N}@example.com");
	var suspendedUserId = await CreateStaffUserAsync(token, $"bulk-suspended-{Guid.NewGuid():N}@example.com");

	await SuspendStaffUserAsync(token, suspendedUserId);

	using var response = await BulkSuspendAsync(token, [
		activeUserId,
		suspendedUserId,
		Guid.NewGuid()
	]);

	response.StatusCode.Should().Be(HttpStatusCode.OK);

	var result = await response.Content.ReadFromJsonAsync<BulkResponse>();
	result.Should().NotBeNull();
	result!.SucceededCount.Should().Be(1);
	result.FailedCount.Should().Be(2);
}
```

```csharp
[Fact]
public async Task ItShouldReturnPartialSuccessWhenBulkReactivateMixesSuspendedAndInvalidTargets() {
	var token = await _authClient.LoginAsStaffAdminAsync();
	var suspendedUserId = await CreateStaffUserAsync(token, $"bulk-reactivate-{Guid.NewGuid():N}@example.com");
	var activeUserId = await CreateStaffUserAsync(token, $"already-active-{Guid.NewGuid():N}@example.com");

	await SuspendStaffUserAsync(token, suspendedUserId);

	using var response = await BulkReactivateAsync(token, [
		suspendedUserId,
		activeUserId,
		Guid.NewGuid()
	]);

	response.StatusCode.Should().Be(HttpStatusCode.OK);

	var result = await response.Content.ReadFromJsonAsync<BulkResponse>();
	result.Should().NotBeNull();
	result!.SucceededCount.Should().Be(1);
	result.FailedCount.Should().Be(2);
}
```

- [ ] **Step 2: Run the new bulk specs and verify failure**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkSuspendStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkReactivateStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserDangerZonePermissionsSpec"
```

Expected:

```text
FAIL - bulk suspend/reactivate staff endpoints do not exist yet
```

- [ ] **Step 3: Add a reusable `JsonElement` GUID-array validator**

Do not duplicate the inline `JsonElement` array checks three times. Add one shared extension and use it from both new handlers and the later bulk-delete handler.

```csharp
public static IRuleBuilderOptions<T, JsonElement> MustBeRequiredGuidArray<T>(
	this IRuleBuilder<T, JsonElement> ruleBuilder,
	string fieldName,
	string itemName,
	int maxCount
) {
	return ruleBuilder
		.NotEmpty()
		.WithMessage($"{fieldName} is required")
		.Must(x => x.ValueKind == JsonValueKind.Array)
		.WithMessage($"{fieldName} must be an array")
		.Must(x => x.EnumerateArray().Any())
		.WithMessage($"At least one {itemName} is required")
		.Must(x => x.EnumerateArray().Count() <= maxCount)
		.WithMessage($"Maximum {maxCount} {fieldName} allowed")
		.Must(x => x.EnumerateArray().All(item => item.TryGetGuid(out _)))
		.WithMessage($"Every {itemName} must be a valid GUID");
}
```

- [ ] **Step 4: Add routes, endpoint mappings, handlers, and audit actions for bulk suspend/reactivate**

Add route constants first.

```csharp
public static class ForStaff {
	public const string BulkSuspend = "/bulk-suspend";
	public const string BulkReactivate = "/bulk-reactivate";
	public const string BulkDelete = "/bulk-delete";
}
```

Map the new endpoints in `UserEndpointsForStaff.cs`.

```csharp
group.MapPost(
		Routes.Users.ForStaff.BulkSuspend,
		BulkSuspendStaffUsers.HandleBulkSuspendStaffUsers
	)
	.WithName("BulkSuspendStaffUsers")
	.WithSummary("Bulk suspend staff users")
	.WithReqBodyValidation<BulkSuspendStaffUsersBody>()
	.WithPermission([AppPermissions.Staff.Users.SUSPEND_FOR_STAFF]);

group.MapPost(
		Routes.Users.ForStaff.BulkReactivate,
		BulkReactivateStaffUsers.HandleBulkReactivateStaffUsers
	)
	.WithName("BulkReactivateStaffUsers")
	.WithSummary("Bulk reactivate staff users")
	.WithReqBodyValidation<BulkReactivateStaffUsersBody>()
	.WithPermission([AppPermissions.Staff.Users.REACTIVATE_FOR_STAFF]);
```

Keep the response shape shared between the two handlers.

```csharp
public sealed record BulkStaffUserFailedItem(Guid UserId, string Error);

public sealed record BulkStaffUserActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffUserFailedItem> FailedItems
);
```

Use a bounded prefetch in `UserService` so bulk suspend/reactivate does not do 100 independent lookups.

```csharp
public async Task<BulkStaffUserActionResult> BulkSuspendStaffUsersAsync(
	IReadOnlyCollection<Guid> userIds,
	CancellationToken cancellationToken = default
) {
	var requestedIds = userIds.Distinct().ToList();
	var targets = await (
		from ua in _dbContext.UserAccount
		join u in _dbContext.User on ua.UserId equals u.Id
		where requestedIds.Contains(ua.UserId)
			&& ua.Scope == AccountScope.Staff
			&& !ua.IsDeleted
			&& !u.IsDeleted
		select new {
			ua.UserId,
			User = u,
		}
	).ToListAsync(cancellationToken);

	var targetMap = targets.ToDictionary(x => x.UserId);
	var failedItems = new List<BulkStaffUserFailedItem>();
	var succeededCount = 0;

	foreach (var userId in requestedIds) {
		if (!targetMap.TryGetValue(userId, out var target)) {
			failedItems.Add(new BulkStaffUserFailedItem(userId, "User not found"));
			continue;
		}

		if (target.User.IsSuspended()) {
			failedItems.Add(new BulkStaffUserFailedItem(userId, "User already suspended"));
			continue;
		}

		target.User.Status = UserStatus.Suspended;
		succeededCount++;
	}

	await _dbContext.SaveChangesAsync(cancellationToken);

	return new BulkStaffUserActionResult(
		succeededCount,
		failedItems.Count,
		failedItems
	);
}
```

Add summary audits:

```csharp
public static class AuditActions {
	public const string StaffUserBulkSuspended = "staff.user.bulk.suspended";
	public const string StaffUserBulkReactivated = "staff.user.bulk.reactivated";
}
```

- [ ] **Step 5: Re-run the new bulk specs**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkSuspendStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkReactivateStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserDangerZonePermissionsSpec"
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit bulk suspend/reactivate**

```bash
git add apps/api/Src/Lib/Validation/JsonElementRules.cs apps/api/Src/Modules/Users/Routes.Users.cs apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.cs apps/api/Src/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.Spec.cs apps/api/Src/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.cs apps/api/Src/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.Spec.cs apps/api/Src/Modules/Users/Handlers/Staff/StaffUserDangerZonePermissions.Spec.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs
git commit -m "feat(api): add bulk suspend and reactivate for staff users"
```

### Task 4: Add Bulk Delete For Staff Users

**Files:**
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/StaffUserDangerZonePermissions.Spec.cs`

- [ ] **Step 1: Add failing bulk-delete tests**

Create a dedicated spec for validation, success, and partial success; add the missing 403 coverage in `StaffUserDangerZonePermissions.Spec.cs`.

```csharp
[Fact]
public async Task ItShouldReturnPartialSuccessWhenBulkDeleteIncludesUnsuspendedOrMissingUsers() {
	var token = await _authClient.LoginAsStaffAdminAsync();
	var deletableUserId = await CreateStaffUserAsync(token, $"bulk-delete-{Guid.NewGuid():N}@example.com");
	var activeUserId = await CreateStaffUserAsync(token, $"bulk-active-delete-{Guid.NewGuid():N}@example.com");

	await SuspendStaffUserAsync(token, deletableUserId);

	using var response = await BulkDeleteAsync(token, [
		deletableUserId,
		activeUserId,
		Guid.NewGuid()
	]);

	response.StatusCode.Should().Be(HttpStatusCode.OK);

	var result = await response.Content.ReadFromJsonAsync<BulkResponse>();
	result.Should().NotBeNull();
	result!.SucceededCount.Should().Be(1);
	result.FailedCount.Should().Be(2);

	await AssertFindStaffUsersDoesNotContainAsync(token, deletableUserId);
}

[Fact]
public async Task ItShouldReturnValidationProblemForMalformedBulkDeleteBody() {
	var token = await _authClient.LoginAsStaffAdminAsync();

	using var request = new HttpRequestMessage(
		HttpMethod.Post,
		GetBulkDeleteUrl()
	).WithSessionToken(token);

	request.Content = JsonContent.Create(new {
		userIds = Array.Empty<string>(),
	});

	using var response = await _http.SendAsync(request);
	response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
}
```

- [ ] **Step 2: Run the new bulk-delete spec and verify failure**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkDeleteStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserDangerZonePermissionsSpec"
```

Expected:

```text
FAIL - bulk delete staff endpoint does not exist yet
```

- [ ] **Step 3: Add the bulk-delete endpoint and service method**

Reuse the shared `MustBeRequiredGuidArray(...)` validator from Task 3, and keep bulk delete routed through the single-delete rule so the “must already be suspended” invariant stays in one place.

```csharp
group.MapPost(
		Routes.Users.ForStaff.BulkDelete,
		BulkDeleteStaffUsers.HandleBulkDeleteStaffUsers
	)
	.WithName("BulkDeleteStaffUsers")
	.WithSummary("Bulk delete staff users")
	.WithReqBodyValidation<BulkDeleteStaffUsersBody>()
	.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_STAFF]);
```

```csharp
public async Task<BulkStaffUserActionResult> BulkDeleteStaffUsersAsync(
	IReadOnlyCollection<Guid> userIds,
	CancellationToken cancellationToken = default
) {
	var failedItems = new List<BulkStaffUserFailedItem>();
	var succeededCount = 0;

	foreach (var userId in userIds.Distinct()) {
		var result = await DeleteStaffUserAsync(userId, cancellationToken);

		switch (result) {
			case DeleteStaffUserResult.Success:
				succeededCount++;
				break;
			case DeleteStaffUserResult.NotFound:
				failedItems.Add(new BulkStaffUserFailedItem(userId, "User not found"));
				break;
			case DeleteStaffUserResult.NotSuspended:
				failedItems.Add(new BulkStaffUserFailedItem(userId, "User must be suspended before deletion"));
				break;
		}
	}

	return new BulkStaffUserActionResult(
		succeededCount,
		failedItems.Count,
		failedItems
	);
}
```

- [ ] **Step 4: Add the handler and audit action**

`BulkDeleteStaffUsers.cs` should match the tenant bulk-delete response contract and emit one summary audit entry.

```csharp
public class BulkDeleteStaffUsers {
	public static async Task<Results<
		Ok<BulkDeleteStaffUsersResult>,
		AppBadRequestHttpResult
	>> HandleBulkDeleteStaffUsers(
		[FromBody] BulkDeleteStaffUsersBody body,
		[FromServices] IUserService userService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		var userIds = body.UserIds.EnumerateArray()
			.Select(item => item.GetGuid())
			.ToList();

		var result = await userService.BulkDeleteStaffUsersAsync(userIds, cancellationToken);
		var account = authContext.AccountStaff
			?? throw new InvalidOperationException("Staff account missing from auth context.");

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.StaffUserBulkDeleted,
			account.UserId,
			new {
				Count = result.SucceededCount,
				FailedCount = result.FailedCount,
			},
			cancellationToken
		);

		return TypedResults.Ok(new BulkDeleteStaffUsersResult {
			SucceededCount = result.SucceededCount,
			FailedCount = result.FailedCount,
			FailedItems = result.FailedItems
				.Select(item => new BulkDeleteStaffUserFailedItem {
					UserId = item.UserId,
					Error = item.Error,
				})
				.ToList(),
		});
	}
}
```

```csharp
public static class AuditActions {
	public const string StaffUserBulkDeleted = "staff.user.bulk.deleted";
}
```

- [ ] **Step 5: Re-run bulk-delete and permission coverage**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkDeleteStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserDangerZonePermissionsSpec"
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit bulk delete**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.cs apps/api/Src/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.Spec.cs apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs apps/api/Src/Modules/Users/Handlers/Staff/StaffUserDangerZonePermissions.Spec.cs
git commit -m "feat(api): add bulk delete for staff users"
```

### Task 5: Regenerate The Contract, Extend Hooks, And Add UI Translation Keys

**Files:**
- Modify/generated: `apps/api/Generated/ResponseKeys.g.cs`
- Modify/generated: `packages/client-ts/src/models/index.ts`
- Modify/generated: `packages/client-ts/src/staff/users/index.ts`
- Modify/generated: `packages/client-ts/src/staff/users/**`
- Modify: `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`

- [ ] **Step 1: Rebuild the API and regenerate the TypeScript client**

Run:

```bash
just build-api
just generate-client
```

Expected:

```text
Build succeeded
client generation completed
```

- [ ] **Step 2: Extend `staff-user.hooks.ts` for the new query/filter/mutation surface**

Keep the hook names parallel to the tenant hooks.

```ts
type FindStaffUsersQuery = {
	cursor?: string | null;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	q?: string;
	status?: string;
};

export const useFindStaffUser = createStaffQuery({
	queryKeyFn: (client) => client.staff.users.get,
	fetcher: async (client, params: FindStaffUsersQuery) => {
		const result = await client.staff.users.get({
			queryParameters: {
				cursor: params.cursor ?? undefined,
				limit: params.limit ? params.limit.toString() : undefined,
				q: params.q,
				status: params.status,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});
		if (isNil(result)) {
			throw new Error('useFindStaffUser: result is nil');
		}
		return result;
	},
});

export const useDeleteStaffUser = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.byUserId('').delete,
	mutationFn: async (client, data: { userId: string }) => {
		const result = await client.staff.users.byUserId(data.userId).delete();
		if (isNil(result)) {
			throw new Error('useDeleteStaffUser: result is nil');
		}
		return result;
	},
});

export const useBulkSuspendStaffUsers = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.bulkSuspend.post,
	mutationFn: async (client, data: { userIds: string[] }) => {
		const body = {
			userIds: createUntypedArray(
				data.userIds.map((id) => createUntypedString(id)),
			),
		};
		const result = await client.staff.users.bulkSuspend.post(body as never);
		if (isNil(result)) {
			throw new Error('useBulkSuspendStaffUsers: result is nil');
		}
		return result;
	},
});
```

- [ ] **Step 3: Add the new frontend copy in `common.en.json` and `common.fr.json`**

Do not rely on `defaultValue` for the new staff-user flows; add real translations now.

```json
{
	"delete-staff-user-disabled-until-suspended": "Suspend this staff member before deleting it.",
	"bulk-suspend-staff-users-confirm": "Are you sure you want to suspend {{count}} staff member(s)?",
	"bulk-reactivate-staff-users-confirm": "Are you sure you want to reactivate {{count}} staff member(s)?",
	"bulk-delete-staff-users-confirm": "Are you sure you want to delete {{count}} staff member(s)? This action cannot be easily undone.",
	"staff-user-bulk-suspend-success": "Successfully suspended {{count}} staff member(s).",
	"staff-user-bulk-suspend-partial-success": "Suspended {{succeeded}} staff member(s), {{failed}} failed.",
	"staff-user-bulk-suspend-failure": "Failed to suspend selected staff members.",
	"staff-user-bulk-reactivate-success": "Successfully reactivated {{count}} staff member(s).",
	"staff-user-bulk-reactivate-partial-success": "Reactivated {{succeeded}} staff member(s), {{failed}} failed.",
	"staff-user-bulk-reactivate-failure": "Failed to reactivate selected staff members.",
	"staff-user-bulk-delete-success": "Successfully deleted {{count}} staff member(s).",
	"staff-user-bulk-delete-partial-success": "Deleted {{succeeded}} staff member(s), {{failed}} failed.",
	"staff-user-bulk-delete-failure": "Failed to delete selected staff members.",
	"export-staff-users": "Export staff members",
	"export-selected-staff-users": "Export selected staff members"
}
```

- [ ] **Step 4: Run the frontend typecheck and expect the list page to fail until the new table components land**

Run:

```bash
just tsc-front
```

Expected:

```text
FAIL - staff-users-table still uses the old query/action contract
```

- [ ] **Step 5: Commit the generated contract and hook/translation changes**

```bash
git add apps/api/Generated/ResponseKeys.g.cs packages/client-ts apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts packages/shared-ts/lib/i18n/json/common.en.json packages/shared-ts/lib/i18n/json/common.fr.json
git commit -m "refactor(front): align staff user hooks with full lifecycle contract"
```

### Task 6: Upgrade `staff-users-table` To The Shared Actionable-Table Pattern

**Files:**
- Modify: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/use-staff-users-table-controller.ts`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/use-staff-users-bulk-actions.ts`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-toolbar-filters.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-selection-actions.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-export-dialog-controller.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-bulk-action-dialogs.tsx`
- Create: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-user-row-actions.tsx`

- [ ] **Step 1: Add a dedicated bulk-actions hook for toasts, invalidation, and selection reset**

Keep the mutation/toast logic out of the table component so the table file stays readable.

```ts
export const useStaffUsersBulkActions = ({
	rowSelection,
	onSuccess,
}: {
	rowSelection: Record<string, boolean>;
	onSuccess: (type: 'suspend' | 'reactivate' | 'delete') => void;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const selectedUserIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

	const invalidateStaffUsers = () => {
		queryClient.invalidateQueries({
			queryKey: useFindStaffUser.getKey(),
		});
	};

	const { mutate: bulkSuspend, isPending: isBulkSuspending } =
		useBulkSuspendStaffUsers({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('staff-user-bulk-suspend-partial-success', { succeeded, failed }),
					);
				} else {
					toast.success(t('staff-user-bulk-suspend-success', { count: succeeded }));
				}
				onSuccess('suspend');
				invalidateStaffUsers();
			},
			onError: (error: unknown) => {
				toast.error(
					getFailureMessage(toApiFailure(error), {
						fallback: t('staff-user-bulk-suspend-failure'),
					}),
				);
			},
		});

	const { mutate: bulkReactivate, isPending: isBulkReactivating } =
		useBulkReactivateStaffUsers({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('staff-user-bulk-reactivate-partial-success', { succeeded, failed }),
					);
				} else {
					toast.success(
						t('staff-user-bulk-reactivate-success', { count: succeeded }),
					);
				}
				onSuccess('reactivate');
				invalidateStaffUsers();
			},
			onError: (error: unknown) => {
				toast.error(
					getFailureMessage(toApiFailure(error), {
						fallback: t('staff-user-bulk-reactivate-failure'),
					}),
				);
			},
		});

	const { mutate: bulkDelete, isPending: isBulkDeleting } =
		useBulkDeleteStaffUsers({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('staff-user-bulk-delete-partial-success', { succeeded, failed }),
					);
				} else {
					toast.success(t('staff-user-bulk-delete-success', { count: succeeded }));
				}
				onSuccess('delete');
				invalidateStaffUsers();
			},
			onError: (error: unknown) => {
				toast.error(
					getFailureMessage(toApiFailure(error), {
						fallback: t('staff-user-bulk-delete-failure'),
					}),
				);
			},
		});

	const handleBulkSuspend = () => bulkSuspend({ userIds: selectedUserIds });
	const handleBulkReactivate = () => bulkReactivate({ userIds: selectedUserIds });
	const handleBulkDelete = () => bulkDelete({ userIds: selectedUserIds });

	return {
		selectedUserIds,
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
	};
};
```

- [ ] **Step 2: Add the controller that owns cursor pagination, URL filters, selection state, and MRT meta**

This file should look like the tenants-table controller, but use only the actual staff-user-supported status tokens: `active`, `pending`, `suspended`, `inactive`.

```ts
const parseStatusFilter = (value: string) => {
	if (!value) {
		return [];
	}

	return value.split(',').filter(Boolean);
};

export const useStaffUsersTableController = () => {
	const { t } = useTranslate();
	const exportDialogRef = useRef<StaffUsersExportDialogControllerRef | null>(null);
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
		status: parseAsString.withDefault(''),
	});
	const [globalFilter, setGlobalFilter] = useState(filterStates.q);
	const [statusFilter, setStatusFilter] = useState<string[]>(() =>
		parseStatusFilter(filterStates.status),
	);

	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasPreviousPage,
		resetCursorPagination,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	const staffUsersQuery = useFindStaffUser({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
			status: filterStates.status || undefined,
		},
	});

	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const [bulkActionDialog, setBulkActionDialog] = useState<{
		type: 'suspend' | 'reactivate' | 'delete';
		open: boolean;
	}>({
		type: 'suspend',
		open: false,
	});

	const rows = useMemo(() => {
		return map(staffUsersQuery.data?.data, StaffUserRowDataMapper);
	}, [staffUsersQuery.data]);

	const selectedRows = useMemo(() => {
		return rows.filter((row) => rowSelection[row.id]);
	}, [rows, rowSelection]);

	const selectedCount = Object.keys(rowSelection).length;
	const isSelectionMode = selectedCount > 0;

	const {
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
	} = useStaffUsersBulkActions({
		rowSelection,
		onSuccess: (type) => {
			setBulkActionDialog({ type, open: false });
			setRowSelection({});
		},
	});

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: rows,
		enableRowSelection: true,
		getRowId: (row) => row.id,
		manualSorting: true,
		onRowSelectionChange: (updater) => {
			setRowSelection((prev) => {
				return typeof updater === 'function' ? updater(prev) : updater;
			});
		},
		onSortingChange: (updater) => {
			if (isSelectionMode) {
				return;
			}

			handleSortingChange(updater);
		},
		state: {
			...tableState,
			isLoading: staffUsersQuery.isPending,
			density: 'compact',
			rowSelection,
		},
		meta: {
			handlePaginationChange,
			hasNextPage: staffUsersQuery.data?.nextCursor != null,
			hasPreviousPage,
			isPending: staffUsersQuery.isPending,
		},
	});

	return {
		table,
		exportDialogRef,
		rows,
		selectedRows,
		selectedCount,
		isSelectionMode,
		bulkActionDialog,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
		closeBulkActionDialog: (type: 'suspend' | 'reactivate' | 'delete') => {
			setBulkActionDialog({ type, open: false });
		},
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
	};
};
```

- [ ] **Step 3: Create the focused toolbar, selection, and export components**

`staff-users-toolbar-filters.tsx` should reuse the same search + multi-select status UX as `tenants-table`, including selection-mode tooltips. `staff-users-export-dialog-controller.tsx` should reuse `buildCsv(...)` instead of building CSV rows manually.

```tsx
<Tooltip
	title={isSelectionMode ? disabledReason : ''}
	arrow
	disableHoverListener={!isSelectionMode}
>
	<Box component="span">
		<TextField
			size="small"
			label={t('search')}
			placeholder={t('search-by-email-or-name')}
			value={globalFilter}
			onChange={onSearchChange}
			disabled={isSelectionMode}
			slotProps={{
				input: {
					startAdornment: (
						<InputAdornment position="start">
							<Iconify icon="eva:search-fill" />
						</InputAdornment>
					),
				},
			}}
		/>
	</Box>
</Tooltip>
```

```ts
const csv = buildCsv([
	['Name', 'Email', 'Status', 'Level'],
	...map(rowsToExport, (row) => [
		getUserFullName({ firstName: row.firstName, lastName: row.lastName }),
		row.email,
		row.status,
		row.level,
	]),
]);
```

- [ ] **Step 4: Create row-actions and bulk-dialog components with real lifecycle flows**

`staff-user-row-actions.tsx` should move the current reminder/details actions out of the table file and add real suspend/reactivate/delete mutations. Delete stays disabled until the row is already suspended.

```tsx
const canDelete = user.status === USER_STATUS_ENUM.SUSPENDED;

const { mutate: deleteStaffUser, isPending: isDeleting } = useDeleteStaffUser({
	meta: { successMessage: 'staff-user-deleted-success', ns: 'response-message' },
	onSuccess: () => {
		queryClient.invalidateQueries({
			queryKey: useFindStaffUser.getKey(),
		});
		setDeleteDialogOpen(false);
	},
});

<Tooltip
	title={
		canDelete ? t('delete') : t('delete-staff-user-disabled-until-suspended')
	}
	placement="top"
	arrow
>
	<Box component="span">
		<IconButton
			color="default"
			onClick={() => setDeleteDialogOpen(true)}
			disabled={!canDelete}
			sx={{ color: canDelete ? 'error.main' : 'text.disabled' }}
		>
			<Iconify icon="solar:trash-bin-trash-bold" />
		</IconButton>
	</Box>
</Tooltip>
```

`staff-users-bulk-action-dialogs.tsx` should match the tenants-table pattern, but use the staff-user-specific copy keys added in Task 5.

```tsx
<ConfirmDialog
	open={dialogState.type === 'delete' && dialogState.open}
	onClose={() => onClose('delete')}
	title={t('bulk-delete')}
	content={t('bulk-delete-staff-users-confirm', { count: selectedCount })}
	action={
		<Button
			variant="contained"
			color="error"
			onClick={onBulkDelete}
			disabled={isBulkDeleting}
		>
			{t('delete')}
		</Button>
	}
/>
```

- [ ] **Step 5: Replace the old `staff-users-table.tsx` with a thin composition layer**

Keep the table file responsible only for row mapping, columns, and composing the controller-owned dialogs/actions.

```tsx
const StaffUsersTable = () => {
	const {
		table,
		exportDialogRef,
		isSelectionMode,
		selectedCount,
		rows,
		selectedRows,
		bulkActionDialog,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
		closeBulkActionDialog,
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
	} = useStaffUsersTableController();

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
			}}
		>
			<MaterialReactTable table={table} />

			<StaffUsersExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={rows}
				selectedRows={selectedRows}
			/>

			<StaffUsersBulkActionDialogs
				dialogState={bulkActionDialog}
				selectedCount={selectedCount}
				isBulkSuspending={isBulkSuspending}
				isBulkReactivating={isBulkReactivating}
				isBulkDeleting={isBulkDeleting}
				onClose={closeBulkActionDialog}
				onBulkSuspend={handleBulkSuspend}
				onBulkReactivate={handleBulkReactivate}
				onBulkDelete={handleBulkDelete}
			/>
		</Box>
	);
};
```

Also add the selection-mode locks exactly once:

```ts
meta: {
	handlePaginationChange: handleCursorPaginationChange,
	hasNextPage,
	hasPreviousPage,
	isPending: staffUsersQuery.isPending,
	disablePaginationControls: isSelectionMode,
	renderToolbarFilters,
	renderSelectionActions,
	renderExportActions,
},
```

- [ ] **Step 6: Run the frontend verification commands**

Run:

```bash
just tsc-front
just build-front
```

Expected:

```text
PASS
```

- [ ] **Step 7: Commit the frontend table upgrade**

```bash
git add apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx apps/front/src/routes/authed/staff/staff-users/list/parts/use-staff-users-table-controller.ts apps/front/src/routes/authed/staff/staff-users/list/parts/use-staff-users-bulk-actions.ts apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-toolbar-filters.tsx apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-selection-actions.tsx apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-export-dialog-controller.tsx apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-bulk-action-dialogs.tsx apps/front/src/routes/authed/staff/staff-users/list/parts/staff-user-row-actions.tsx
git commit -m "feat(front): upgrade staff users table to actionable workflow"
```

### Task 7: Run Final Verification And Smoke The Staff Users List

**Files:**
- Verify only

- [ ] **Step 1: Run the targeted API specs for the changed staff-user slice**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~DeleteStaffUserSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkSuspendStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkReactivateStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~BulkDeleteStaffUsersSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserDangerZonePermissionsSpec"
```

Expected:

```text
PASS - all targeted staff-user specs green
```

- [ ] **Step 2: Run the repo-level contract and regression commands**

Run:

```bash
just build-api
just generate-client
just tsc-front
just build-front
just test-api
```

Expected:

```text
all commands pass
```

- [ ] **Step 3: Manually smoke-test `/staff/staff-users`**

Verify:

```text
- search updates `q` in the URL and resets the cursor
- status filter updates `status` in the URL and resets the cursor
- selection mode disables search, status filter, sorting, and pagination until cleared
- export works for current loaded rows and selected rows in both CSV and JSON
- XLSX stays disabled with the existing "coming soon" affordance
- row suspend/reactivate works and refreshes the list
- row delete stays disabled until the row is suspended, then succeeds
- bulk suspend/reactivate/delete show success or partial-success toasts, clear selection, and refresh the list once
```

---

## Self-Review

- Spec coverage checked:
  - backend `status` filter for the shared toolbar: Task 1
  - single delete endpoint + suspended-only rule + transactional soft delete: Task 2
  - bulk suspend/reactivate endpoints with bounded validation and summary audits: Task 3
  - bulk delete endpoint with suspended-only delete rule: Task 4
  - regenerated client + new React Query hooks + translation keys: Task 5
  - actionable-table UX, export dialog, selection mode, bulk menu, row actions, query locks: Task 6
  - verification and smoke coverage: Task 7
- Placeholder scan checked:
  - no placeholder markers remain in the plan body
- Type consistency checked:
  - `status` is consistently treated as a lowercase CSV filter in the API/query string
  - response payloads consistently use `succeededCount`, `failedCount`, and `failedItems`
  - frontend hook names consistently follow `useDeleteStaffUser`, `useBulkSuspendStaffUsers`, `useBulkReactivateStaffUsers`, and `useBulkDeleteStaffUsers`
