# Audit Logs Filters Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the staff audit-logs page's two date pickers and single-select action filter with two reusable shared components (DateRangeFilter, MultiSelectChipFilter), add multi-action filtering to the API, and move filter state to nuqs URL params.

**Architecture:** Backend gains an `Actions` (collection) query parameter on FindAuditLogs/ExportAuditLogs, validated against a new `AuditActionsRegistry`. Frontend introduces two shared MUI-themed components in `apps/front/src/components/` and a page-local nuqs hook. The MRT toolbar slots stay; only the two filter widgets and the local useState are replaced.

**Tech Stack:** .NET 10, EF Core, FluentValidation; React 19, MUI v7, `@mui/x-date-pickers` (MIT — `DateCalendar` only), nuqs, TanStack Query, React Hook Form (not needed here), Day.js, Kiota-generated TS client.

**Spec:** `docs/superpowers/specs/2026-05-12-audit-logs-filters-upgrade-design.md`

---

## Task 1: Extract AuditActionsRegistry

**Why:** The validator (Tasks 2 & 3) needs a `IsKnown(string)` check without depending on `AuditLogQueryService`. The reflection cache currently lives inline in the service; extracting it gives the validator a clean dependency and keeps the cache in one place.

**Files:**
- Create: `apps/api/Src/Modules/AuditLogs/Entities/AuditActionsRegistry.cs`
- Create: `apps/api/Src/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs` (remove `CachedActions`, use registry)

- [ ] **Step 1: Write the failing spec**

Create `apps/api/Src/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs`:

```csharp
namespace MainApi.Src.Modules.AuditLogs.Entities;

using FluentAssertions;
using Xunit;

public sealed class AuditActionsRegistrySpec {
	[Fact]
	public void ItShouldExposeAllAuditActionConstantsSortedAlphabetically() {
		var all = AuditActionsRegistry.All;

		all.Should().Contain(AuditActions.LoginSucceeded);
		all.Should().Contain(AuditActions.LoginFailed);
		all.Should().Contain(AuditActions.InvitationCreated);
		all.Should().BeInAscendingOrder();
		all.Should().OnlyHaveUniqueItems();
	}

	[Theory]
	[InlineData("auth.login.succeeded")]
	[InlineData("invitation.created")]
	public void ItShouldReturnTrueWhenActionIsKnown(string action) {
		AuditActionsRegistry.IsKnown(action).Should().BeTrue();
	}

	[Theory]
	[InlineData("totally.fake")]
	[InlineData("")]
	[InlineData("AUTH.LOGIN.SUCCEEDED")] // case-sensitive
	public void ItShouldReturnFalseWhenActionIsUnknown(string action) {
		AuditActionsRegistry.IsKnown(action).Should().BeFalse();
	}
}
```

- [ ] **Step 2: Verify the spec fails to compile**

Run: `cd apps/api && dotnet build Tests/MainApi.Tests.csproj -c Test`
Expected: build fails — `AuditActionsRegistry` does not exist.

- [ ] **Step 3: Create the registry**

Create `apps/api/Src/Modules/AuditLogs/Entities/AuditActionsRegistry.cs`:

```csharp
namespace MainApi.Src.Modules.AuditLogs.Entities;

using System.Collections.Immutable;
using System.Reflection;

public static class AuditActionsRegistry {
	private static readonly ImmutableArray<string> _all =
		[.. typeof(AuditActions)
			.GetFields(
				BindingFlags.Public
				| BindingFlags.Static
				| BindingFlags.FlattenHierarchy
			)
			.Where(f =>
				f.IsLiteral
				&& !f.IsInitOnly
				&& f.FieldType == typeof(string))
			.Select(f => (string)f.GetRawConstantValue()!)
			.Distinct()
			.Order()];

	private static readonly ImmutableHashSet<string> _knownSet =
		[.. _all];

	public static IReadOnlyList<string> All => _all;

	public static bool IsKnown(string action) {
		return _knownSet.Contains(action);
	}
}
```

- [ ] **Step 4: Verify the spec passes**

Run: `cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~AuditActionsRegistrySpec"`
Expected: 5 tests pass.

- [ ] **Step 5: Switch AuditLogQueryService to use the registry**

In `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`, delete the inline `CachedActions` field and update `GetDistinctActionsAsync`:

```csharp
// Delete lines that declare CachedActions (~109-124).

public Task<IReadOnlyList<string>>
	GetDistinctActionsAsync(
	CancellationToken cancellationToken = default
) {
	return Task.FromResult(AuditActionsRegistry.All);
}
```

Also remove `using System.Collections.Immutable;` and `using System.Reflection;` if no longer used in the file.

- [ ] **Step 6: Verify existing audit-log specs still pass**

Run: `cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~AuditLog"`
Expected: all existing audit-log specs pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/Src/Modules/AuditLogs/Entities/AuditActionsRegistry.cs \
        apps/api/Src/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs \
        apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs
git commit -m "refactor(audit-logs): extract AuditActionsRegistry from query service

Move the reflection-based cache of audit action constants into a
dedicated static registry alongside AuditActions, with public All and
IsKnown surfaces. AuditLogQueryService consumes the registry.

Prepares the registry for use by the FindAuditLogs/ExportAuditLogs
validators when they gain a multi-action filter."
```

---

## Task 2: Multi-action filter on FindAuditLogs

**Files:**
- Modify: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs` (args + ApplyFilters)
- Modify: `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs` (`GetFindUrl` signature)
- Modify: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs` (adapt + add specs)

- [ ] **Step 1: Update FindAuditLogsArgs (service-side contract)**

In `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`:

```csharp
public record FindAuditLogsArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	Guid? UserId,
	IReadOnlyList<string>? Actions,  // was: string? Action
	Guid? TargetId,
	DateTime? StartDate,
	DateTime? EndDate
);
```

Update `ApplyFilters` in the same file:

```csharp
private static IQueryable<AuditLog> ApplyFilters(
	IQueryable<AuditLog> query,
	Guid? userId,
	IReadOnlyList<string>? actions, // was: string? action
	Guid? targetId,
	DateTime? startDate,
	DateTime? endDate
) {
	if (userId.HasValue) {
		query = query.Where(a =>
			a.UserId == userId.Value);
	}
	if (actions is { Count: > 0 }) {
		query = query.Where(a =>
			actions.Contains(a.Action));
	}
	if (targetId.HasValue) {
		query = query.Where(a =>
			a.TargetId == targetId.Value);
	}
	if (startDate.HasValue) {
		query = query.Where(a =>
			a.CreatedAt >= startDate.Value);
	}
	if (endDate.HasValue) {
		query = query.Where(a =>
			a.CreatedAt <= endDate.Value);
	}
	return query;
}
```

Update the two call sites inside `FindAsync` and `ExportExceedsLimitAsync`/`ExportAsync` to pass `args.Actions` instead of `args.Action`. (The `ExportAuditLogsArgs.Action` field still exists at this point; the export call sites will be fixed in Task 3 — but `ExportAuditLogsArgs` does still need to compile here, so leave its `Action` field alone for now and pass `args.Action is null ? null : new[] { args.Action }` from the export call sites as a temporary bridge.)

Concretely in `FindAsync`:

```csharp
query = ApplyFilters(
	query,
	args.UserId,
	args.Actions,           // was: args.Action
	args.TargetId,
	args.StartDate,
	args.EndDate
);
```

In `ExportExceedsLimitAsync` and `ExportAsync`:

```csharp
query = ApplyFilters(
	query,
	args.UserId,
	args.Action is null ? null : new[] { args.Action }, // temporary bridge — fixed in Task 3
	args.TargetId,
	args.StartDate,
	args.EndDate
);
```

- [ ] **Step 2: Update FindAuditLogsQuery DTO and validator**

In `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`, replace `Action` with `Actions`:

```csharp
public class FindAuditLogsQuery : CursorPaginatedQuery {
	[FromQuery] public string? UserId { get; set; }
	[FromQuery] public List<string>? Actions { get; set; }  // was: string? Action
	[FromQuery] public string? TargetId { get; set; }
	[FromQuery] public string? StartDate { get; set; }
	[FromQuery] public string? EndDate { get; set; }
	// ... existing Get* helpers unchanged
}
```

Update the validator (same file):

```csharp
public FindAuditLogsQueryValidator() {
	RuleFor(x => x.UserId)
		.Must(QueryPredicates.BeValidNullableGuid)
		.WithMessage("UserId must be a valid GUID");

	RuleFor(x => x.Actions)
		.Must(actions => actions == null || actions.Count <= 50)
		.WithMessage(
			"At most 50 actions can be filtered at once."
		);

	RuleForEach(x => x.Actions)
		.NotEmpty()
		.WithMessage("Action values must not be empty.")
		.Must(AuditActionsRegistry.IsKnown)
		.WithMessage(a => $"'{a}' is not a valid audit action.");

	RuleFor(x => x.TargetId)
		.Must(QueryPredicates.BeValidNullableGuid)
		.WithMessage("TargetId must be a valid GUID");

	// existing StartDate / EndDate / range rules unchanged
}
```

Add `using MainApi.Src.Modules.AuditLogs.Entities;` to the file's usings if not already present.

Update the handler call inside `HandleFindAuditLogs`:

```csharp
var serviceResult =
	await auditLogQueryService.FindAsync(
	new FindAuditLogsArgs(
		Cursor: cursorGuid,
		Limit: limit,
		SortId: sortId,
		SortOrder: sortOrder,
		UserId: query.GetUserId(),
		Actions: query.Actions,        // was: Action: query.Action
		TargetId: query.GetTargetId(),
		StartDate: query.GetStartDate(),
		EndDate: query.GetEndDate()
	),
	cancellationToken
);
```

- [ ] **Step 3: Update AuditLogTestHelper.GetFindUrl**

In `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs`, change the `action` parameter to `actions`:

```csharp
public static string GetFindUrl(
	string? cursor = null,
	int? limit = null,
	string? sortId = null,
	string? sortOrder = null,
	string? userId = null,
	IReadOnlyList<string>? actions = null,  // was: string? action
	string? targetId = null,
	string? startDate = null,
	string? endDate = null
) {
	var queryParams = new List<string>();

	if (cursor is not null) {
		queryParams.Add($"cursor={cursor}");
	}
	if (limit.HasValue) {
		queryParams.Add($"limit={limit.Value}");
	}
	if (sortId is not null) {
		queryParams.Add($"sort_id={sortId}");
	}
	if (sortOrder is not null) {
		queryParams.Add($"sort_order={sortOrder}");
	}
	if (userId is not null) {
		queryParams.Add($"userId={userId}");
	}
	if (actions is not null) {
		foreach (var action in actions) {
			queryParams.Add(
				$"actions={Uri.EscapeDataString(action)}"
			);
		}
	}
	if (targetId is not null) {
		queryParams.Add($"targetId={targetId}");
	}
	if (startDate is not null) {
		queryParams.Add($"startDate={startDate}");
	}
	if (endDate is not null) {
		queryParams.Add($"endDate={endDate}");
	}

	if (queryParams.Count == 0) {
		return FindUrl;
	}
	return FindUrl + "?" + string.Join("&", queryParams);
}
```

- [ ] **Step 4: Adapt existing FindAuditLogs specs**

In `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs`, find every call to `GetFindUrl(... action: "...")` and replace with `GetFindUrl(... actions: new[] { "..." })`.

There are 5–10 such call sites. Use grep within the file (`grep -n 'action:' Spec.cs`) and update each one.

- [ ] **Step 5: Add new multi-action specs**

Append to `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs`:

```csharp
[Fact]
public async Task
ItShouldFilterByMultipleActionsWhenActionsProvided() {
	var token =
		await _authClient.LoginAsStaffAdminAsync();
	var userId =
		await AuditLogTestHelper
			.GetUserIdByEmailAsync(
				_fixture.Factory,
				TestConstants.StaffAdminEmail
			);

	var logA = await AuditLogTestHelper
		.SeedAuditLogAsync(
			_fixture.Factory, userId,
			AuditActions.LoginSucceeded
		);
	var logB = await AuditLogTestHelper
		.SeedAuditLogAsync(
			_fixture.Factory, userId,
			AuditActions.LoginFailed
		);
	var logC = await AuditLogTestHelper
		.SeedAuditLogAsync(
			_fixture.Factory, userId,
			AuditActions.InvitationCreated
		);

	var url = AuditLogTestHelper.GetFindUrl(
		actions: new[] {
			AuditActions.LoginSucceeded,
			AuditActions.LoginFailed
		}
	);
	var request = new HttpRequestMessage(
		HttpMethod.Get, url
	).WithSessionToken(token);

	using var response =
		await _http.SendAsync(request);

	response.StatusCode.Should()
		.Be(HttpStatusCode.OK);

	var result = await response.Content
		.ReadFromJsonAsync<FindResponse>();
	result!.Data.Should().Contain(a => a.Id == logA);
	result.Data.Should().Contain(a => a.Id == logB);
	result.Data.Should()
		.NotContain(a => a.Id == logC);
}

[Fact]
public async Task
ItShouldReturn422WhenAnyActionIsUnknown() {
	var token =
		await _authClient.LoginAsStaffAdminAsync();

	var url = AuditLogTestHelper.GetFindUrl(
		actions: new[] {
			AuditActions.LoginSucceeded,
			"totally.fake"
		}
	);
	var request = new HttpRequestMessage(
		HttpMethod.Get, url
	).WithSessionToken(token);

	using var response =
		await _http.SendAsync(request);

	response.StatusCode.Should()
		.Be(HttpStatusCode.UnprocessableEntity);
}

[Fact]
public async Task
ItShouldReturn422WhenMoreThanFiftyActionsProvided() {
	var token =
		await _authClient.LoginAsStaffAdminAsync();

	// 51 copies of a valid action exceed the cap
	var actions = Enumerable
		.Repeat(AuditActions.LoginSucceeded, 51)
		.ToArray();

	var url = AuditLogTestHelper.GetFindUrl(
		actions: actions
	);
	var request = new HttpRequestMessage(
		HttpMethod.Get, url
	).WithSessionToken(token);

	using var response =
		await _http.SendAsync(request);

	response.StatusCode.Should()
		.Be(HttpStatusCode.UnprocessableEntity);
}
```

- [ ] **Step 6: Run all FindAuditLogs specs**

```bash
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindAuditLogsSpec"
```

Expected: all existing specs pass + the three new specs pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs \
        apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs \
        apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs \
        apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs
git commit -m "feat(audit-logs): support multi-action filter on FindAuditLogs

Replace the singular Action query parameter with Actions (repeated
query param), validated against AuditActionsRegistry with a 50-item
cap. ApplyFilters now uses Contains for SQL IN translation.

Includes the temporary single-action bridge for ExportAuditLogs;
that handler is migrated in the next commit."
```

---

## Task 3: Multi-action filter on ExportAuditLogs

**Files:**
- Modify: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs` (`ExportAuditLogsArgs`, remove bridge)
- Modify: `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs` (`GetExportUrl` signature)
- Modify: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`

- [ ] **Step 1: Update ExportAuditLogsArgs and remove the bridge**

In `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`:

```csharp
public record ExportAuditLogsArgs(
	Guid? UserId,
	IReadOnlyList<string>? Actions,  // was: string? Action
	Guid? TargetId,
	DateTime? StartDate,
	DateTime? EndDate
);
```

In the same file, replace the temporary bridge in `ExportExceedsLimitAsync` and `ExportAsync` with a direct pass-through:

```csharp
query = ApplyFilters(
	query,
	args.UserId,
	args.Actions,           // was: bridge expression from Task 2
	args.TargetId,
	args.StartDate,
	args.EndDate
);
```

- [ ] **Step 2: Update ExportAuditLogsQuery DTO and validator**

In `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`:

```csharp
public class ExportAuditLogsQuery {
	[FromQuery] public string? Format { get; set; }
	[FromQuery] public string? UserId { get; set; }
	[FromQuery] public List<string>? Actions { get; set; } // was: string? Action
	[FromQuery] public string? TargetId { get; set; }
	[FromQuery] public string? StartDate { get; set; }
	[FromQuery] public string? EndDate { get; set; }
	// existing Get* helpers unchanged
}
```

Update the validator block to add the same Actions rules:

```csharp
RuleFor(x => x.Actions)
	.Must(actions => actions == null || actions.Count <= 50)
	.WithMessage(
		"At most 50 actions can be filtered at once."
	);

RuleForEach(x => x.Actions)
	.NotEmpty()
	.WithMessage("Action values must not be empty.")
	.Must(AuditActionsRegistry.IsKnown)
	.WithMessage(a => $"'{a}' is not a valid audit action.");
```

Add `using MainApi.Src.Modules.AuditLogs.Entities;` if not already present.

Update `HandleExportAuditLogs` (in the same file):

```csharp
var exportArgs = new ExportAuditLogsArgs(
	UserId: query.GetUserId(),
	Actions: query.Actions,         // was: Action: query.Action
	TargetId: query.GetTargetId(),
	StartDate: query.GetStartDate(),
	EndDate: query.GetEndDate()
);
```

- [ ] **Step 3: Update AuditLogTestHelper.GetExportUrl**

In `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs`:

```csharp
public static string GetExportUrl(
	string format,
	string? userId = null,
	IReadOnlyList<string>? actions = null,  // was: string? action
	string? targetId = null,
	string? startDate = null,
	string? endDate = null
) {
	var queryParams = new List<string> {
		$"format={format}"
	};

	if (userId is not null) {
		queryParams.Add($"userId={userId}");
	}
	if (actions is not null) {
		foreach (var action in actions) {
			queryParams.Add(
				$"actions={Uri.EscapeDataString(action)}"
			);
		}
	}
	if (targetId is not null) {
		queryParams.Add($"targetId={targetId}");
	}
	if (startDate is not null) {
		queryParams.Add($"startDate={startDate}");
	}
	if (endDate is not null) {
		queryParams.Add($"endDate={endDate}");
	}

	return ExportUrl + "?" + string.Join("&", queryParams);
}
```

- [ ] **Step 4: Adapt existing ExportAuditLogs specs**

Find every call to `GetExportUrl(... action: "...")` in `ExportAuditLogs.Spec.cs` and replace with `GetExportUrl(... actions: new[] { "..." })`.

- [ ] **Step 5: Add new multi-action specs for export**

Append to `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`:

```csharp
[Fact]
public async Task
ItShouldExportRowsForMultipleActionsWhenActionsProvided() {
	var token =
		await _authClient.LoginAsStaffAdminAsync();
	var userId =
		await AuditLogTestHelper
			.GetUserIdByEmailAsync(
				_fixture.Factory,
				TestConstants.StaffAdminEmail
			);

	await AuditLogTestHelper.SeedAuditLogAsync(
		_fixture.Factory, userId,
		AuditActions.LoginSucceeded
	);
	await AuditLogTestHelper.SeedAuditLogAsync(
		_fixture.Factory, userId,
		AuditActions.LoginFailed
	);
	await AuditLogTestHelper.SeedAuditLogAsync(
		_fixture.Factory, userId,
		AuditActions.InvitationCreated
	);

	var url = AuditLogTestHelper.GetExportUrl(
		format: "csv",
		actions: new[] {
			AuditActions.LoginSucceeded,
			AuditActions.LoginFailed
		}
	);
	var request = new HttpRequestMessage(
		HttpMethod.Get, url
	).WithSessionToken(token);

	using var response =
		await _http.SendAsync(request);

	response.StatusCode.Should()
		.Be(HttpStatusCode.OK);

	var body = await response.Content
		.ReadAsStringAsync();
	body.Should().Contain(AuditActions.LoginSucceeded);
	body.Should().Contain(AuditActions.LoginFailed);
	body.Should()
		.NotContain(AuditActions.InvitationCreated);
}

[Fact]
public async Task
ItShouldReturn422WhenExportActionsContainsUnknown() {
	var token =
		await _authClient.LoginAsStaffAdminAsync();

	var url = AuditLogTestHelper.GetExportUrl(
		format: "csv",
		actions: new[] { "totally.fake" }
	);
	var request = new HttpRequestMessage(
		HttpMethod.Get, url
	).WithSessionToken(token);

	using var response =
		await _http.SendAsync(request);

	response.StatusCode.Should()
		.Be(HttpStatusCode.UnprocessableEntity);
}
```

- [ ] **Step 6: Run all audit-log specs**

```bash
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~AuditLog"
```

Expected: all specs pass — including the new ones and all existing FindAuditLogs/ExportAuditLogs/AuditActionsRegistry specs.

- [ ] **Step 7: Commit**

```bash
git add apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs \
        apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs \
        apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs \
        apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs
git commit -m "feat(audit-logs): support multi-action filter on ExportAuditLogs

Mirrors the FindAuditLogs change: Actions repeated query param,
validated against AuditActionsRegistry with the same 50-item cap.
Removes the temporary single-action bridge introduced in the
previous commit."
```

---

## Task 4: Regenerate TS client and adapt existing call sites

**Why:** Tasks 2 & 3 changed the API contract; the frontend will not compile until we regenerate. To keep the page working (single-select UX preserved) while the new components are built, we wrap the existing single string into an array.

**Files:**
- Modify (regenerated): `packages/client-ts/**` (do not edit by hand)
- Modify: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx`
- Modify: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-logs-export-button.tsx`

- [ ] **Step 1: Build the API and regenerate the client**

Run:

```bash
just build-api && just generate-client
```

Expected: succeeds; `packages/client-ts/` files are updated. Do not edit them by hand.

- [ ] **Step 2: Confirm the new client signature**

Run:

```bash
grep -rn 'actions' packages/client-ts/src/staff/auditLogs/ | head -20
```

Expected: see `actions?: string[]` (or kiota-equivalent) on the find/export query parameter types.

- [ ] **Step 3: Update the find query call in `staff-audit-logs-table.tsx`**

In `apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx`, change the `useFindStaffAuditLogs` variables block:

```ts
const auditLogsQuery = useFindStaffAuditLogs({
	variables: {
		cursor: apiVariables.cursor || undefined,
		limit: apiVariables.limit,
		sort: apiVariables.sort,
		actions: actionFilter ? [actionFilter] : undefined, // was: action: actionFilter || undefined
		startDate: startDateIso,
		endDate: endDateIso,
	},
});
```

Update the `renderExportActions` block to pass `actions` instead of `actionFilter`:

```ts
const renderExportActions = () => {
	return (
		<AuditLogsExportButton
			actions={actionFilter ? [actionFilter] : undefined} // was: actionFilter={actionFilter}
			startDate={startDateIso}
			endDate={endDateIso}
		/>
	);
};
```

- [ ] **Step 4: Update `audit-logs-export-button.tsx` to take an array**

In `apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-logs-export-button.tsx`:

```ts
type AuditLogsExportButtonProps = {
	actions?: string[];     // was: actionFilter?: string
	startDate?: string;
	endDate?: string;
};

export const AuditLogsExportButton = ({
	actions,
	startDate,
	endDate,
}: AuditLogsExportButtonProps) => {
	// ... unchanged top half
};
```

Inside `handleExport`, replace the `action` field:

```ts
queryParameters: {
	format,
	actions: actions && actions.length > 0 ? actions : undefined, // was: action: actionFilter || undefined
	startDate: startDate || undefined,
	endDate: endDate || undefined,
},
```

- [ ] **Step 5: Type-check and lint**

```bash
just tsc-front && just check-write
```

Expected: clean. If `check-write` reports formatting changes, accept them.

- [ ] **Step 6: Manual sanity in browser**

Start the dev servers (if not already):

```bash
just dev-api &
just dev-front &
just dev-db &
```

Open `http://localhost:5050/staff/audit-logs`, select a single action from the existing `<Select>`, and confirm the table filters correctly and the request URL contains `?actions=<value>` in DevTools → Network.

- [ ] **Step 7: Commit**

```bash
git add packages/client-ts \
        apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx \
        apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-logs-export-button.tsx
git commit -m "chore(client): regenerate TS client for multi-action audit log filters

Bridges the existing single-select Action UI through the new array
parameter shape (actionFilter ? [actionFilter] : undefined). Keeps
the page working while the new multi-select UI is built in
subsequent commits."
```

---

## Task 5: Add new i18n keys

**Files:**
- Modify: `apps/front/public/tx/common.en.json`

- [ ] **Step 1: Add the new keys**

Open `apps/front/public/tx/common.en.json` and add the following keys in alphabetical position. Each key goes on its own line; preserve the surrounding format (tab indentation, trailing commas).

```json
"apply": "Apply",
"cancel": "Cancel",
"clear": "Clear",
"clear-all": "Clear all",
"custom": "Custom",
"last-n-days": "Last {{count}} days",
"no-results-found": "No results found",
"selected-count": "{{count}} selected",
"today": "Today",
"yesterday": "Yesterday"
```

Do not delete or rename existing keys.

- [ ] **Step 2: Verify the file is valid JSON**

```bash
node -e "require('./apps/front/public/tx/common.en.json')"
```

Expected: no output (silent success).

- [ ] **Step 3: Commit**

```bash
git add apps/front/public/tx/common.en.json
git commit -m "feat(i18n): add keys for date-range and multi-select filters

apply, cancel, clear, clear-all, custom, last-n-days,
no-results-found, selected-count, today, yesterday"
```

---

## Task 6: Build DateRangeFilter component

**Why:** Reusable date-range picker built on the MIT `<DateCalendar>` (we already have `@mui/x-date-pickers`). Drives both this page and future list pages.

**Files:**
- Create: `apps/front/src/components/date-range-filter/date-range-filter.types.ts`
- Create: `apps/front/src/components/date-range-filter/date-range-filter-presets.tsx`
- Create: `apps/front/src/components/date-range-filter/date-range-filter-calendar.tsx`
- Create: `apps/front/src/components/date-range-filter/date-range-filter.tsx`
- Create: `apps/front/src/components/date-range-filter/index.ts`

- [ ] **Step 1: Create the types module**

`apps/front/src/components/date-range-filter/date-range-filter.types.ts`:

```ts
import type { Dayjs } from '#app/utils/format-time.ts';

export type DateRange = {
	from: Dayjs | null;
	to: Dayjs | null;
};

export type DateRangePreset =
	| 'today'
	| 'yesterday'
	| 'last-7-days'
	| 'last-30-days'
	| 'last-90-days'
	| 'custom';

export type DateRangeFilterProps = {
	label?: string;
	value: DateRange;
	onChange: (value: DateRange) => void;
	minDate?: Dayjs;
	maxDate?: Dayjs;
	defaultPreset?: DateRangePreset;
};
```

- [ ] **Step 2: Create the presets module**

`apps/front/src/components/date-range-filter/date-range-filter-presets.tsx`:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import map from 'lodash/map';

import { useTranslate } from '#app/hooks/use-translate.ts';
import { dayjs, type Dayjs } from '#app/utils/format-time.ts';

import type { DateRange, DateRangePreset } from './date-range-filter.types';

type PresetEntry = {
	id: DateRangePreset;
	getLabel: (t: (k: string, p?: Record<string, unknown>) => string) => string;
	compute: () => DateRange;
};

const startOf = (d: Dayjs) => d.startOf('day');
const endOf = (d: Dayjs) => d.endOf('day');

export const DATE_RANGE_PRESETS: PresetEntry[] = [
	{
		id: 'today',
		getLabel: (t) => t('today'),
		compute: () => ({
			from: startOf(dayjs()),
			to: endOf(dayjs()),
		}),
	},
	{
		id: 'yesterday',
		getLabel: (t) => t('yesterday'),
		compute: () => ({
			from: startOf(dayjs().subtract(1, 'day')),
			to: endOf(dayjs().subtract(1, 'day')),
		}),
	},
	{
		id: 'last-7-days',
		getLabel: (t) => t('last-n-days', { count: 7 }),
		compute: () => ({
			from: startOf(dayjs().subtract(6, 'day')),
			to: endOf(dayjs()),
		}),
	},
	{
		id: 'last-30-days',
		getLabel: (t) => t('last-n-days', { count: 30 }),
		compute: () => ({
			from: startOf(dayjs().subtract(29, 'day')),
			to: endOf(dayjs()),
		}),
	},
	{
		id: 'last-90-days',
		getLabel: (t) => t('last-n-days', { count: 90 }),
		compute: () => ({
			from: startOf(dayjs().subtract(89, 'day')),
			to: endOf(dayjs()),
		}),
	},
];

export const rangesEqual = (a: DateRange, b: DateRange): boolean => {
	const sameFrom =
		(a.from === null && b.from === null) ||
		(a.from != null && b.from != null && a.from.isSame(b.from, 'day'));
	const sameTo =
		(a.to === null && b.to === null) ||
		(a.to != null && b.to != null && a.to.isSame(b.to, 'day'));
	return sameFrom && sameTo;
};

export const activePresetFor = (value: DateRange): DateRangePreset => {
	if (value.from === null && value.to === null) {
		return 'custom';
	}
	const match = DATE_RANGE_PRESETS.find((p) =>
		rangesEqual(p.compute(), value),
	);
	return match?.id ?? 'custom';
};

type DateRangeFilterPresetsProps = {
	active: DateRangePreset;
	onSelectPreset: (next: DateRange) => void;
	onSelectCustom: () => void;
};

export const DateRangeFilterPresets = ({
	active,
	onSelectPreset,
	onSelectCustom,
}: DateRangeFilterPresetsProps) => {
	const { t } = useTranslate();

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				gap: 0.5,
				p: 1,
				borderRight: '1px solid',
				borderColor: 'divider',
				minWidth: 160,
			}}
		>
			{map(DATE_RANGE_PRESETS, (preset) => (
				<Button
					key={preset.id}
					size="small"
					variant={active === preset.id ? 'contained' : 'text'}
					color={active === preset.id ? 'primary' : 'inherit'}
					sx={{ justifyContent: 'flex-start' }}
					onClick={() => onSelectPreset(preset.compute())}
				>
					{preset.getLabel(t as never)}
				</Button>
			))}
			<Button
				size="small"
				variant={active === 'custom' ? 'contained' : 'text'}
				color={active === 'custom' ? 'primary' : 'inherit'}
				sx={{ justifyContent: 'flex-start' }}
				onClick={onSelectCustom}
			>
				{t('custom')}
			</Button>
		</Box>
	);
};
```

- [ ] **Step 3: Create the calendar module**

`apps/front/src/components/date-range-filter/date-range-filter-calendar.tsx`:

```tsx
import Box from '@mui/material/Box';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay, type PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { useState } from 'react';

import { type Dayjs } from '#app/utils/format-time.ts';

import type { DateRange } from './date-range-filter.types';

type DateRangeFilterCalendarProps = {
	value: DateRange;
	onChange: (next: DateRange) => void;
	minDate?: Dayjs;
	maxDate?: Dayjs;
};

const isInRange = (
	day: Dayjs,
	from: Dayjs | null,
	to: Dayjs | null,
): boolean => {
	if (from === null || to === null) return false;
	return (
		(day.isAfter(from, 'day') || day.isSame(from, 'day')) &&
		(day.isBefore(to, 'day') || day.isSame(to, 'day'))
	);
};

export const DateRangeFilterCalendar = ({
	value,
	onChange,
	minDate,
	maxDate,
}: DateRangeFilterCalendarProps) => {
	// While the user is picking, we hold the "first click" locally so the
	// in-range highlight follows the hovered cell. After the second click,
	// we commit through onChange.
	const [pendingFrom, setPendingFrom] = useState<Dayjs | null>(value.from);

	const handlePick = (day: Dayjs | null) => {
		if (day === null) return;
		// First click (or restart after a committed range): set pendingFrom
		if (pendingFrom === null || (value.from !== null && value.to !== null)) {
			setPendingFrom(day);
			onChange({ from: day.startOf('day'), to: null });
			return;
		}
		// Second click: commit. Swap order if user clicked earlier than first.
		const [from, to] = day.isBefore(pendingFrom, 'day')
			? [day, pendingFrom]
			: [pendingFrom, day];
		setPendingFrom(null);
		onChange({ from: from.startOf('day'), to: to.endOf('day') });
	};

	const renderDay = (props: PickersDayProps) => {
		const inRange = isInRange(
			props.day,
			value.from,
			value.to ?? pendingFrom,
		);
		return (
			<PickersDay
				{...props}
				sx={{
					...(inRange && {
						bgcolor: 'action.selected',
					}),
				}}
			/>
		);
	};

	return (
		<Box sx={{ p: 1 }}>
			<DateCalendar
				value={value.from}
				onChange={handlePick}
				minDate={minDate}
				maxDate={maxDate}
				slots={{ day: renderDay }}
			/>
		</Box>
	);
};
```

(Single-month calendar to keep this task small. If the user later wants two months side by side, we render two `<DateCalendar>` instances and pass a `referenceDate` to the second.)

- [ ] **Step 4: Create the main filter module**

`apps/front/src/components/date-range-filter/date-range-filter.tsx`:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { fDate } from '#app/utils/format-time.ts';

import { DateRangeFilterCalendar } from './date-range-filter-calendar';
import {
	activePresetFor,
	DateRangeFilterPresets,
} from './date-range-filter-presets';
import type {
	DateRangeFilterProps,
	DateRangePreset,
} from './date-range-filter.types';

const formatRange = (
	value: { from: ReturnType<typeof fDate>; to: ReturnType<typeof fDate> },
): string => {
	if (!value.from && !value.to) return '';
	if (value.from && value.to) return `${value.from} – ${value.to}`;
	return value.from || value.to || '';
};

export const DateRangeFilter = ({
	label,
	value,
	onChange,
	minDate,
	maxDate,
}: DateRangeFilterProps) => {
	const { t } = useTranslate();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [mode, setMode] = useState<'presets' | 'custom'>('presets');
	const [draft, setDraft] = useState(value);
	const open = Boolean(anchorEl);

	const effectiveLabel = label ?? t('date');

	const triggerText = (() => {
		const range = formatRange({
			from: value.from ? fDate(value.from) : '',
			to: value.to ? fDate(value.to) : '',
		});
		return range
			? `${effectiveLabel} · ${range}`
			: effectiveLabel;
	})();

	const active: DateRangePreset = activePresetFor(value);

	const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
		setMode(active === 'custom' && (value.from || value.to) ? 'custom' : 'presets');
		setDraft(value);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleSelectPreset = (next: { from: typeof value.from; to: typeof value.to }) => {
		onChange(next);
		handleClose();
	};

	const handleApplyCustom = () => {
		onChange(draft);
		handleClose();
	};

	const handleCancelCustom = () => {
		setDraft(value);
		setMode('presets');
	};

	const handleClear = () => {
		onChange({ from: null, to: null });
		handleClose();
	};

	const isActive = value.from !== null || value.to !== null;

	return (
		<>
			<Button
				size="small"
				variant="outlined"
				color="inherit"
				onClick={handleOpen}
				endIcon={
					<Iconify
						icon="solar:alt-arrow-down-linear"
						width={16}
					/>
				}
				sx={{ borderRadius: 999, textTransform: 'none' }}
			>
				{triggerText}
			</Button>
			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={handleClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			>
				<Box sx={{ display: 'flex' }}>
					<DateRangeFilterPresets
						active={active}
						onSelectPreset={handleSelectPreset}
						onSelectCustom={() => setMode('custom')}
					/>
					{mode === 'custom' && (
						<Box>
							<DateRangeFilterCalendar
								value={draft}
								onChange={setDraft}
								minDate={minDate}
								maxDate={maxDate}
							/>
							<Stack
								direction="row"
								spacing={1}
								sx={{ p: 1, justifyContent: 'flex-end' }}
							>
								<Button
									size="small"
									color="inherit"
									onClick={handleCancelCustom}
								>
									{t('cancel')}
								</Button>
								<Button
									size="small"
									variant="contained"
									onClick={handleApplyCustom}
								>
									{t('apply')}
								</Button>
							</Stack>
						</Box>
					)}
				</Box>
				{isActive && (
					<Box
						sx={{
							p: 1,
							borderTop: '1px solid',
							borderColor: 'divider',
							display: 'flex',
							justifyContent: 'flex-end',
						}}
					>
						<Button size="small" color="inherit" onClick={handleClear}>
							{t('clear')}
						</Button>
					</Box>
				)}
			</Popover>
		</>
	);
};
```

- [ ] **Step 5: Create the index barrel**

`apps/front/src/components/date-range-filter/index.ts`:

```ts
export { DateRangeFilter } from './date-range-filter';
export type {
	DateRange,
	DateRangeFilterProps,
	DateRangePreset,
} from './date-range-filter.types';
```

- [ ] **Step 6: Type-check and lint**

```bash
just tsc-front && just check-write
```

Expected: clean. If `format-time.ts` doesn't export `dayjs`, fix the import in the presets file (use `dayjs` from the locale-aware utility). Confirm with:

```bash
grep -n 'export.*dayjs' apps/front/src/utils/format-time.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/front/src/components/date-range-filter
git commit -m "feat(components): add DateRangeFilter shared component

Chip-button trigger + popover with preset rail (Today, Yesterday,
Last 7/30/90 days, Custom) and a MUI DateCalendar-based range picker
for custom mode. Controlled, themed with our MUI tokens. First
consumer will be the staff audit-logs page."
```

---

## Task 7: Build MultiSelectChipFilter component

**Files:**
- Create: `apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter.types.ts`
- Create: `apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter-list.tsx`
- Create: `apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter-selected.tsx`
- Create: `apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter.tsx`
- Create: `apps/front/src/components/multi-select-chip-filter/index.ts`

- [ ] **Step 1: Create the types module**

`apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter.types.ts`:

```ts
export type MultiSelectChipFilterOption = {
	value: string;
	label: string;
	group?: string;
};

export type MultiSelectChipFilterProps = {
	label: string;
	options: MultiSelectChipFilterOption[];
	value: string[];
	onChange: (next: string[]) => void;
	loading?: boolean;
	searchPlaceholder?: string;
	emptyLabel?: string;
	groupOrder?: string[];
};
```

- [ ] **Step 2: Create the list (left pane) module**

`apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter-list.tsx`:

```tsx
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import filter from 'lodash/filter';
import map from 'lodash/map';
import { useMemo, useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { MultiSelectChipFilterOption } from './multi-select-chip-filter.types';

type Props = {
	options: MultiSelectChipFilterOption[];
	selected: string[];
	onToggle: (value: string) => void;
	loading?: boolean;
	searchPlaceholder?: string;
	emptyLabel?: string;
	groupOrder?: string[];
};

const groupOptions = (
	options: MultiSelectChipFilterOption[],
	explicitOrder?: string[],
): Array<{ group: string | null; items: MultiSelectChipFilterOption[] }> => {
	const hasGroups = options.some((o) => o.group);
	if (!hasGroups) {
		return [{ group: null, items: options }];
	}
	const byGroup = new Map<string, MultiSelectChipFilterOption[]>();
	for (const opt of options) {
		const key = opt.group ?? '';
		const list = byGroup.get(key) ?? [];
		list.push(opt);
		byGroup.set(key, list);
	}
	const sortedKeys = explicitOrder
		? [...explicitOrder.filter((k) => byGroup.has(k)),
		   ...[...byGroup.keys()]
				.filter((k) => !explicitOrder.includes(k))
				.sort()]
		: [...byGroup.keys()].sort();
	return sortedKeys.map((key) => ({
		group: key,
		items: byGroup.get(key) ?? [],
	}));
};

export const MultiSelectChipFilterList = ({
	options,
	selected,
	onToggle,
	loading,
	searchPlaceholder,
	emptyLabel,
	groupOrder,
}: Props) => {
	const { t } = useTranslate();
	const [search, setSearch] = useState('');

	const filtered = useMemo(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return options;
		return filter(options, (o) =>
			o.label.toLowerCase().includes(needle),
		);
	}, [options, search]);

	const grouped = useMemo(
		() => groupOptions(filtered, groupOrder),
		[filtered, groupOrder],
	);

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				width: 280,
				maxHeight: 360,
			}}
		>
			<Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
				<TextField
					size="small"
					fullWidth
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={searchPlaceholder ?? t('search')}
					InputProps={{
						startAdornment: (
							<InputAdornment position="start">
								<Iconify icon="solar:magnifer-linear" width={16} />
							</InputAdornment>
						),
					}}
				/>
			</Box>
			<Box sx={{ overflowY: 'auto', flexGrow: 1 }}>
				{loading ? (
					map([0, 1, 2, 3, 4], (i) => (
						<Box key={i} sx={{ px: 1.5, py: 0.5 }}>
							<Skeleton variant="text" />
						</Box>
					))
				) : filtered.length === 0 ? (
					<Box sx={{ p: 2, textAlign: 'center' }}>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							{emptyLabel ?? t('no-results-found')}
						</Typography>
					</Box>
				) : (
					map(grouped, (section) => (
						<Box key={section.group ?? '_'} sx={{ py: 0.5 }}>
							{section.group && (
								<Typography
									variant="overline"
									sx={{
										display: 'block',
										px: 1.5,
										color: 'text.secondary',
									}}
								>
									{section.group}
								</Typography>
							)}
							{map(section.items, (opt) => (
								<FormControlLabel
									key={opt.value}
									sx={{ display: 'flex', mx: 0, px: 1.5, py: 0.25 }}
									control={
										<Checkbox
											size="small"
											checked={selected.includes(opt.value)}
											onChange={() => onToggle(opt.value)}
										/>
									}
									label={
										<Typography
											variant="body2"
											sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
										>
											{opt.label}
										</Typography>
									}
								/>
							))}
						</Box>
					))
				)}
			</Box>
		</Box>
	);
};
```

- [ ] **Step 3: Create the selected (right pane) module**

`apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter-selected.tsx`:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import map from 'lodash/map';

import { useTranslate } from '#app/hooks/use-translate.ts';

import type { MultiSelectChipFilterOption } from './multi-select-chip-filter.types';

type Props = {
	options: MultiSelectChipFilterOption[];
	selected: string[];
	onRemove: (value: string) => void;
	onClearAll: () => void;
};

export const MultiSelectChipFilterSelected = ({
	options,
	selected,
	onRemove,
	onClearAll,
}: Props) => {
	const { t } = useTranslate();
	const byValue = new Map(options.map((o) => [o.value, o]));

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				width: 280,
				maxHeight: 360,
				borderLeft: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Box
				sx={{
					flexGrow: 1,
					overflowY: 'auto',
					p: 1.5,
					display: 'flex',
					flexWrap: 'wrap',
					gap: 0.5,
					alignContent: 'flex-start',
				}}
			>
				{selected.length === 0 ? (
					<Typography
						variant="body2"
						sx={{ color: 'text.disabled' }}
					>
						{t('selected-count', { count: 0 })}
					</Typography>
				) : (
					map(selected, (val) => {
						const opt = byValue.get(val);
						return (
							<Chip
								key={val}
								size="small"
								label={opt?.label ?? val}
								onDelete={() => onRemove(val)}
								sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
							/>
						);
					})
				)}
			</Box>
			<Box
				sx={{
					p: 1,
					borderTop: '1px solid',
					borderColor: 'divider',
					display: 'flex',
					justifyContent: 'flex-end',
				}}
			>
				<Button
					size="small"
					color="inherit"
					onClick={onClearAll}
					disabled={selected.length === 0}
				>
					{t('clear-all')}
				</Button>
			</Box>
		</Box>
	);
};
```

- [ ] **Step 4: Create the main filter module**

`apps/front/src/components/multi-select-chip-filter/multi-select-chip-filter.tsx`:

```tsx
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import filter from 'lodash/filter';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';

import { MultiSelectChipFilterList } from './multi-select-chip-filter-list';
import { MultiSelectChipFilterSelected } from './multi-select-chip-filter-selected';
import type { MultiSelectChipFilterProps } from './multi-select-chip-filter.types';

export const MultiSelectChipFilter = ({
	label,
	options,
	value,
	onChange,
	loading,
	searchPlaceholder,
	emptyLabel,
	groupOrder,
}: MultiSelectChipFilterProps) => {
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const open = Boolean(anchorEl);

	const handleToggle = (val: string) => {
		if (value.includes(val)) {
			onChange(filter(value, (v) => v !== val));
		} else {
			onChange([...value, val]);
		}
	};

	const handleRemove = (val: string) => {
		onChange(filter(value, (v) => v !== val));
	};

	const handleClearAll = () => {
		onChange([]);
	};

	return (
		<>
			<Button
				size="small"
				variant="outlined"
				color="inherit"
				onClick={(e) => setAnchorEl(e.currentTarget)}
				endIcon={
					<Iconify icon="solar:alt-arrow-down-linear" width={16} />
				}
				sx={{ borderRadius: 999, textTransform: 'none' }}
			>
				{label}
				{value.length > 0 && (
					<Badge
						color="primary"
						badgeContent={value.length}
						sx={{ ml: 1.5 }}
					/>
				)}
			</Button>
			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			>
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column-reverse', sm: 'row' },
					}}
				>
					<MultiSelectChipFilterList
						options={options}
						selected={value}
						onToggle={handleToggle}
						loading={loading}
						searchPlaceholder={searchPlaceholder}
						emptyLabel={emptyLabel}
						groupOrder={groupOrder}
					/>
					<MultiSelectChipFilterSelected
						options={options}
						selected={value}
						onRemove={handleRemove}
						onClearAll={handleClearAll}
					/>
				</Box>
			</Popover>
		</>
	);
};
```

- [ ] **Step 5: Create the index barrel**

`apps/front/src/components/multi-select-chip-filter/index.ts`:

```ts
export { MultiSelectChipFilter } from './multi-select-chip-filter';
export type {
	MultiSelectChipFilterOption,
	MultiSelectChipFilterProps,
} from './multi-select-chip-filter.types';
```

- [ ] **Step 6: Type-check and lint**

```bash
just tsc-front && just check-write
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/front/src/components/multi-select-chip-filter
git commit -m "feat(components): add MultiSelectChipFilter shared component

Chip-button trigger with count badge + split-pane popover. Left pane:
search input + checkbox list with optional grouping. Right pane:
chips of currently selected values with X to remove, plus a 'Clear
all' footer. First consumer will be the staff audit-logs page."
```

---

## Task 8: useStaffAuditLogsFilters nuqs hook

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/use-staff-audit-logs-filters.ts`

- [ ] **Step 1: Create the hook**

`apps/front/src/routes/authed/staff/audit-logs/list/_parts/use-staff-audit-logs-filters.ts`:

```ts
import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';

import { dayjs } from '#app/utils/format-time.ts';

import type { DateRange } from '#app/components/date-range-filter';

const parsers = {
	actions: parseAsArrayOf(parseAsString).withDefault([]),
	from: parseAsString,
	to: parseAsString,
};

export const useStaffAuditLogsFilters = (onChange?: () => void) => {
	const [q, setQ] = useQueryStates(parsers);

	const setActions = (next: string[]) => {
		onChange?.();
		setQ({ actions: next });
	};

	const setDateRange = (next: DateRange) => {
		onChange?.();
		setQ({
			from: next.from ? next.from.format('YYYY-MM-DD') : null,
			to: next.to ? next.to.format('YYYY-MM-DD') : null,
		});
	};

	const dateRange: DateRange = {
		from: q.from ? dayjs(q.from) : null,
		to: q.to ? dayjs(q.to) : null,
	};

	return {
		actions: q.actions,
		dateRange,
		setActions,
		setDateRange,
		resetAll: () => setQ({ actions: [], from: null, to: null }),
	};
};
```

If `format-time.ts` does not export `dayjs` directly, use whatever wrapper it exposes (check `grep -n 'export' apps/front/src/utils/format-time.ts | head -20`) and adjust the import. Most likely export name: `dayjs` or `dayJsLocalized`.

- [ ] **Step 2: Type-check**

```bash
just tsc-front
```

Expected: clean (the hook is not yet imported anywhere; just verifies the file itself compiles).

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/list/_parts/use-staff-audit-logs-filters.ts
git commit -m "feat(audit-logs): add nuqs-backed filter hook

URL schema: ?actions=a,b&from=YYYY-MM-DD&to=YYYY-MM-DD. Each setter
calls an optional onChange (the page wires this to cursor reset),
matching the existing local-state behavior."
```

---

## Task 9: Wire new filters into the audit-logs page

**Files:**
- Modify: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx`

- [ ] **Step 1: Replace local state, DatePickers, and Select with the new components**

Rewrite `staff-audit-logs-table.tsx` so its top half looks like:

```tsx
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import capitalize from 'lodash/capitalize';
import map from 'lodash/map';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useCallback, useMemo } from 'react';

import type { AuditLogListItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';

import { DateRangeFilter } from '#app/components/date-range-filter';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { MultiSelectChipFilter } from '#app/components/multi-select-chip-filter';
import { RouterLink } from '#app/components/router-link.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindStaffAuditLogs,
	useGetStaffAuditLogActions,
} from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';
import { fDateTime, fToNow } from '#app/utils/format-time.ts';

import { AuditLogsExportButton } from './audit-logs-export-button';
import { useStaffAuditLogsFilters } from './use-staff-audit-logs-filters';

// ... existing AuditLogRowData, AuditLogRowDataMapper, columnHelper, defaultSorting unchanged ...

const StaffAuditLogsTable = () => {
	const { t } = useTranslate();

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

	const { actions, dateRange, setActions, setDateRange } =
		useStaffAuditLogsFilters(resetCursorPagination);

	const startDateIso = dateRange.from?.startOf('day').toISOString();
	const endDateIso = dateRange.to?.endOf('day').toISOString();

	const auditLogsQuery = useFindStaffAuditLogs({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			actions: actions.length > 0 ? actions : undefined,
			startDate: startDateIso,
			endDate: endDateIso,
		},
	});

	const actionsQuery = useGetStaffAuditLogActions({});

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: auditLogsQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', {
					item: t('audit-logs'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('audit-logs'),
					ns: 'response-message',
				}),
			),
		},
	});

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(auditLogsQuery.data?.nextCursor);
				handlePaginationChange(updater);
			},
			[handlePaginationChange, auditLogsQuery.data?.nextCursor, setNextCursor],
		);
	const hasNextPage = auditLogsQuery.data?.nextCursor != null;

	const dataTable = useMemo(() => {
		return map(auditLogsQuery.data?.data, AuditLogRowDataMapper);
	}, [auditLogsQuery.data]);

	const columns = useMemo(() => {
		// ... unchanged column definitions ...
	}, [t]);

	const actionOptions = useMemo(() => {
		return map(actionsQuery.data?.actions ?? [], (a) => ({
			value: a,
			label: a,
			group: a.split('.')[0] ?? '',
		}));
	}, [actionsQuery.data]);

	const renderToolbarFilters = () => {
		return (
			<>
				<DateRangeFilter
					label={t('date')}
					value={dateRange}
					onChange={setDateRange}
				/>
				<MultiSelectChipFilter
					label={t('action')}
					options={actionOptions}
					value={actions}
					onChange={setActions}
					loading={actionsQuery.isPending}
				/>
			</>
		);
	};

	const renderExportActions = () => {
		return (
			<AuditLogsExportButton
				actions={actions.length > 0 ? actions : undefined}
				startDate={startDateIso}
				endDate={endDateIso}
			/>
		);
	};

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		enableRowSelection: false,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			...queryState,
			density: 'compact',
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		renderEmptyRowsFallback,
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: auditLogsQuery.isPending,
			renderToolbarFilters,
			renderExportActions,
		},
	});

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
		</Box>
	);
};

export default StaffAuditLogsTable;

// ... existing UserCell / ActionCell / TargetIdCell / IpAddressCell / DateCell / ActionsCell unchanged ...
```

Delete the following old imports (no longer used): `FormControl`, `InputLabel`, `MenuItem`, `Select`, `DatePicker`, `useState`, `Dayjs`, `formatPatterns`.

Delete the local state declarations for `actionFilter`, `startDate`, `endDate` and the corresponding `startDateIso`/`endDateIso` computations (replaced by the hook).

Delete the old `<DatePicker>` and `<FormControl><Select>...</Select></FormControl>` blocks inside the previous `renderToolbarFilters`.

- [ ] **Step 2: Type-check and lint**

```bash
just tsc-front && just check-write
```

Expected: clean.

- [ ] **Step 3: Manual verification in browser**

Start dev (if not already): `just dev-api`, `just dev-front`, `just dev-db`.

Visit `http://localhost:5050/staff/audit-logs` and verify, in this order:

1. **Empty state** — both filter chips show just their label (`Date ▾`, `Action ▾`). Table loads normally.
2. **Date presets** — open `Date ▾`, click each preset in turn (Today / Yesterday / Last 7 / Last 30 / Last 90). For each:
   - Trigger chip updates to `Date · <range>`.
   - URL updates with `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
   - Table refetches and shows filtered results.
3. **Date custom** — open `Date ▾` → Custom. Pick a start day, then an end day. Apply. Confirm chip and URL reflect the picked range. Cancel discards.
4. **Date clear** — when a range is active, the popover footer shows `Clear`; clicking it empties both URL params and chip.
5. **Action select & multi** — open `Action ▾`. Search filters the left list. Tick two actions; confirm chip shows `Action [2]` badge and right pane shows the two chips. Click an X on a right-pane chip; confirm it unticks in the left pane. Click `Clear all`; confirm all unselected and chip badge gone.
6. **Action grouping** — confirm the left pane shows section headers per first segment (auth, staff, tenant, system, invitation, impersonation).
7. **URL persistence** — refresh the page; confirm filters are restored.
8. **Browser back/forward** — change a filter, then click browser back; confirm the previous filter state is restored.
9. **Shared URL** — copy a URL like `/staff/audit-logs?actions=auth.login.failed,auth.login.succeeded&from=2026-05-01&to=2026-05-12`, paste into a new tab; confirm filters land correctly.
10. **Cursor reset** — paginate forward, then change a filter; confirm you return to page 1 (no cursor in URL).
11. **Export** — with multiple actions selected, click Export → CSV. Open the downloaded file and confirm only the selected actions are present.
12. **Regression** — clear all filters; confirm the unfiltered list and export still work.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx
git commit -m "feat(audit-logs): replace inline filters with shared chip components

Use DateRangeFilter and MultiSelectChipFilter in the MRT toolbar.
Filter state lives in URL params via useStaffAuditLogsFilters; local
useState for actionFilter/startDate/endDate is removed.

The action multi-select groups options by domain prefix (auth.*,
staff.*, tenant.*, etc.). The date range supports presets and
custom calendar selection."
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build gates**

```bash
just build-api && just generate-client && just tsc-front && just check-write
```

Expected: all clean. If `generate-client` re-emits files, commit them separately (`chore(client): regenerate after final build verification`).

- [ ] **Step 2: Backend test suite**

```bash
just test-api
```

Expected: all tests pass (Docker required for Testcontainers).

- [ ] **Step 3: Knip check**

```bash
just knip
```

Expected: no new unused-export warnings traceable to this branch. If knip reports unused exports from the new shared components, double-check that the audit-logs page imports them via the barrel.

- [ ] **Step 4: Final spot-check in browser**

Re-run the section-3 verification list from Task 9 quickly. Confirm:

- No console errors.
- No flicker when changing filters (cursor reset happens before refetch).
- Export downloads correctly for multi-action + date-range + both.

- [ ] **Step 5: Push the branch**

```bash
git push
```

Confirm CI passes on the existing PR (#401). If the PR was already in review, leave a short comment noting the filter UX upgrade is in the latest push so the reviewer can refresh.

---

## Self-review notes

**Spec coverage:**
- Section 4.1 DateRangeFilter — Task 6.
- Section 4.2 MultiSelectChipFilter — Task 7.
- Section 4.3 page-local files (filter hook, table edits, export button update) — Tasks 8, 9, plus the export-button change in Task 4.
- Section 5 backend DTOs/args/ApplyFilters/validator — Tasks 2 (Find) and 3 (Export).
- Section 5.4 AuditActionsRegistry — Task 1.
- Section 6 page wiring (nuqs hook + table edits) — Tasks 8 and 9.
- Section 7 i18n keys — Task 5.
- Section 8 cursor reset — wired through the hook in Task 8 and consumed in Task 9.
- Section 9 testing — backend specs in Tasks 1/2/3, frontend manual verification in Task 9, build gates in Task 10.

**Known simplifications vs spec:**
- The calendar is single-month (not two-month). Listed in Task 6 as a deliberate scope-keeper; can be a follow-up.
- No `defaultPreset` auto-application — only used to influence the highlighted preset, matching the spec text.

**Placeholder scan:** No TODO/TBD strings. Every code step shows complete code. File paths are absolute. Commands are exact.
