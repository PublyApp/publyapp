# Issue 218 Service Args Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor internal API services so methods with 3 or more domain parameters use service-local Args records.

**Architecture:** Keep the refactor internal to backend service signatures and handler call sites. Args records live in the service file that owns the input contract; route identity parameters stay separate only for route-identity operations.

**Tech Stack:** .NET 10, C#, xUnit, Minimal API handlers, EF Core services.

---

### Task 1: Add Signature Guard Spec

**Files:**
- Create: `apps/api/Src/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`

- [ ] **Step 1: Write the failing architecture spec**

```csharp
using System.Reflection;

using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Impersonations.Services;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Profiles.Services;
using MainApi.Src.Modules.SystemNotices.Services;

using Xunit;

namespace MainApi.Src.Lib.Architecture;

public sealed class ServiceArgsRecordConventionSpec {
	[Fact]
	public void ItShouldUseArgsRecordsForIssue218ServiceMethods() {
		AssertMethodParameterTypeNames<IAuditLogService>(
			"LogAsync",
			"CreateAuditLogArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IImpersonationService>(
			"CreateImpersonationSessionAsync",
			"CreateImpersonationSessionArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"CreateStaffInvitationAsync",
			"CreateStaffInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"CreateTenantInvitationAsync",
			"CreateTenantInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"FindStaffInvitationsAsync",
			nameof(FindStaffInvitationsArgs),
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"AcceptStaffInvitationAsync",
			"AcceptStaffInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"AcceptTenantInvitationAsync",
			"AcceptTenantInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"BulkCreateStaffInvitationsAsync",
			"BulkCreateStaffInvitationsArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IProfileAsStaffService>(
			"CreateStaffProfileAsync",
			"CreateStaffProfileArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<ISystemNoticeService>(
			"FindAsync",
			"FindSystemNoticesArgs",
			nameof(CancellationToken)
		);
	}

	private static void AssertMethodParameterTypeNames<TService>(
		string methodName,
		params string[] expectedParameterTypeNames
	) {
		var method = typeof(TService)
			.GetMethods()
			.Single(methodInfo => methodInfo.Name == methodName);
		var actualParameterTypeNames = method
			.GetParameters()
			.Select(parameter => parameter.ParameterType.Name)
			.ToArray();

		Assert.Equal(expectedParameterTypeNames, actualParameterTypeNames);
	}
}
```

- [ ] **Step 2: Run the spec and verify red**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --no-restore --filter "FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: FAIL because the new args record types do not exist yet or method signatures
still expose loose parameters.

### Task 2: Refactor Query Service Signatures

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs`
- Modify: `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`
- Modify: `apps/api/Src/Modules/SystemNotices/Handlers/Staff/FindSystemNotices.cs`

- [ ] **Step 1: Add `FindStaffInvitationsArgs`**

```csharp
public record FindStaffInvitationsArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Status
);
```

- [ ] **Step 2: Change `FindStaffInvitationsAsync`**

Use:

```csharp
Task<FindStaffInvitationsResult> FindStaffInvitationsAsync(
	FindStaffInvitationsArgs args,
	CancellationToken cancellationToken = default);
```

At the start of the implementation unpack:

```csharp
var cursor = args.Cursor;
var effectiveLimit = args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
var effectiveSortId = args.SortId ?? "created_at";
var status = args.Status;
```

- [ ] **Step 3: Update `FindStaffInvitations` handler**

Construct:

```csharp
var args = new FindStaffInvitationsArgs(
	Cursor: cursorId,
	Limit: query.GetLimit(),
	SortId: query.GetSortId(),
	SortOrder: query.GetSortOrder(),
	Status: query.GetStatus()
);
```

- [ ] **Step 4: Add and use `FindSystemNoticesArgs`**

```csharp
public record FindSystemNoticesArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder
);
```

Change `ISystemNoticeService.FindAsync` and implementation to accept
`FindSystemNoticesArgs args`. Update `FindSystemNotices` handler to construct the
record inline.

### Task 3: Refactor Invitation Command Signatures

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/BulkCreateStaffInvitations.cs`

- [ ] **Step 1: Add command args records**

```csharp
public record CreateStaffInvitationArgs(
	string Email,
	List<Guid> ProfileIds,
	Guid InvitedByUserId
);

public record CreateTenantInvitationArgs(
	string Email,
	Guid TenantId,
	List<Guid> ProfileIds,
	Guid InvitedByUserId
);

public record AcceptStaffInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);

public record AcceptTenantInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);

public record BulkCreateStaffInvitationsArgs(
	List<BulkStaffInvitationItem> Invitations,
	Guid InvitedByUserId
);
```

- [ ] **Step 2: Change service signatures and implementations**

Each service method accepts its args record plus `CancellationToken`. At the top of each
implementation, unpack args into locals that match existing variable names.

- [ ] **Step 3: Update handler call sites**

Use named record construction at each call site. Example:

```csharp
var createArgs = new CreateStaffInvitationArgs(
	Email: normalizedEmail,
	ProfileIds: profileIds,
	InvitedByUserId: account.UserId
);
var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
	createArgs,
	cancellationToken
);
```

### Task 4: Refactor Profile and Impersonation Command Signatures

**Files:**
- Modify: `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
- Modify: `apps/api/Src/Modules/Profiles/Handlers/Staff/CreateStaffProfile.cs`
- Modify: `apps/api/Src/Modules/Impersonations/Services/ImpersonationService.cs`

- [ ] **Step 1: Use existing `CreateStaffProfileArgs` for staff profile creation**

Extend the existing `CreateStaffProfileArgs` record to include staff-scope creation
fields or create `CreateStaffProfileArgs` if it is not already present with:

```csharp
public sealed record CreateStaffProfileArgs(
	string Name,
	string? Description,
	List<string> Permissions,
	List<string> Emails,
	Guid InvitedByUserId
);
```

Change `CreateStaffProfileAsync` to accept that record and update the handler call site.

- [ ] **Step 2: Add impersonation args**

```csharp
public record CreateImpersonationSessionArgs(
	Guid TenantId,
	Guid StaffUserId,
	string Reason,
	int DurationMinutes
);
```

Update `CreateImpersonationSessionAsync` and its audit logging call.

### Task 5: Refactor Audit Logging Signature

**Files:**
- Modify: `apps/api/Src/Modules/AuditLogs/Services/AuditLogService.cs`
- Modify every production call site returned by `rg -n "auditLogService\\.LogAsync|_auditLogService\\.LogAsync" apps/api/Src/Modules -g "*.cs"`

- [ ] **Step 1: Add audit args record**

```csharp
public record CreateAuditLogArgs(
	Guid UserId,
	string Action,
	Guid? TargetId = null,
	object? Details = null
);
```

- [ ] **Step 2: Change `LogAsync`**

```csharp
Task LogAsync(
	CreateAuditLogArgs args,
	CancellationToken cancellationToken = default);
```

Implementation uses `args.UserId`, `args.Action`, `args.TargetId`, and `args.Details`.

- [ ] **Step 3: Update call sites**

Use:

```csharp
await auditLogService.LogAsync(
	new CreateAuditLogArgs(
		UserId: account.UserId,
		Action: AuditActions.SomeAction,
		TargetId: targetId,
		Details: new { }
	),
	cancellationToken
);
```

Omit `TargetId` and `Details` only when they are currently omitted.

### Task 6: Verify and Commit

**Files:**
- All modified files from Tasks 1-5.

- [ ] **Step 1: Run the architecture spec**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --no-restore --filter "FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: PASS.

- [ ] **Step 2: Run focused affected tests**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --no-restore --filter "FullyQualifiedName~FindStaffInvitations|FullyQualifiedName~FindSystemNotices|FullyQualifiedName~CreateStaffProfile|FullyQualifiedName~AcceptInvitation"
```

Expected: PASS.

- [ ] **Step 3: Run API build**

Run:

```bash
just build-api
```

Expected: Build succeeded with 0 warnings and 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/Src docs/superpowers
git commit -m "refactor(api): adopt args records for service methods"
```
