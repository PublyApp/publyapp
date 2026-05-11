# Issue 391 Session Hard Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove soft-delete state from `sessions` so session rows, including impersonation sessions, are active credential records that delete physically.

**Architecture:** Keep the change local to the auth session entity and EF model behavior. `Session` becomes a non-`BaseAttributes` entity with explicit `Id`, `CreatedAt`, and `UpdatedAt`, while `MainApiDbContext` preserves UUID v7 and timestamp behavior without converting session deletes into soft deletes.

**Tech Stack:** .NET 10, EF Core, PostgreSQL migrations, xUnit integration tests, FluentAssertions.

---

## Scope Check

This plan implements GitHub issue #391 only. It does not add scheduled cleanup for
expired sessions that are never presented again; issue #389 owns that future work.
It does not add impersonation reporting beyond the existing audit log.

## File Structure

- Modify `apps/api/Src/Modules/Auth/Entities/Session.cs`
  - Remove `BaseAttributes` inheritance.
  - Add explicit `Id`, `CreatedAt`, and `UpdatedAt` properties.
  - Keep normal and impersonation session columns unchanged.
- Modify `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
  - Configure `Session.Id` with `uuidv7()`.
  - Stamp `Session.CreatedAt` and `Session.UpdatedAt` on tracked adds and updates.
  - Let `Session` deletes remain physical deletes.
- Modify `apps/api/Src/Modules/Auth/Services/SessionService.cs`
  - Remove `!s.IsDeleted` from session lookup and expired-session hard-delete queries.
- Modify `apps/api/Src/Lib/Architecture/ArchitectureGuard.Spec.cs`
  - Add a model guard proving `Session` has no soft-delete properties.
- Create `apps/api/Src/Modules/Auth/Entities/Session.Spec.cs`
  - Add integration coverage proving `DbContext.Remove(session)` physically deletes the row.
- Generate EF migration files under `apps/api/Migrations/`
  - Drop `sessions.is_deleted`.
  - Drop `sessions.deleted_at`.
  - Update `MainApiDbContextModelSnapshot`.

## Tasks

### Task 1: Add Failing Session Model And Hard-Delete Tests

**Files:**
- Modify: `apps/api/Src/Lib/Architecture/ArchitectureGuard.Spec.cs`
- Create: `apps/api/Src/Modules/Auth/Entities/Session.Spec.cs`

- [ ] **Step 1: Add the `Session` using to `ArchitectureGuard.Spec.cs`**

Add this using with the other module entity imports:

```csharp
using MainApi.Src.Modules.Auth.Entities;
```

- [ ] **Step 2: Add the session model guard to `ArchitectureGuard.Spec.cs`**

Add this test method inside `ArchitectureGuardSpec`:

```csharp
[Fact]
public void
ItShouldKeepSessionCredentialRowsWithoutSoftDeleteColumns() {
	var options = new DbContextOptionsBuilder<MainApiDbContext>()
		.UseNpgsql("Host=localhost;Database=architecture_guard")
		.Options;
	using var dbContext = new MainApiDbContext(options);

	var entityType = dbContext.Model.FindEntityType(typeof(Session));
	entityType.Should().NotBeNull();

	entityType!.FindProperty("Id").Should().NotBeNull();
	entityType.FindProperty("CreatedAt").Should().NotBeNull();
	entityType.FindProperty("UpdatedAt").Should().NotBeNull();
	entityType.FindProperty("IsDeleted").Should().BeNull();
	entityType.FindProperty("DeletedAt").Should().BeNull();

	var idProperty = entityType.FindProperty("Id");
	idProperty!.GetDefaultValueSql().Should().Be("uuidv7()");
}
```

- [ ] **Step 3: Create `Session.Spec.cs` with hard-delete coverage**

Create `apps/api/Src/Modules/Auth/Entities/Session.Spec.cs`:

```csharp
namespace MainApi.Src.Modules.Auth.Entities;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Testing.Fixtures;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class SessionSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SessionSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldPhysicallyDeleteWhenRemovedFromDbContext() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var user = await dbContext.User.FirstAsync(
			u => u.Email == TestConstants.StaffAdminEmail
		);

		var session = new Session {
			UserId = user.GetRequiredId(),
			Token = $"test-session-{Guid.NewGuid():N}",
			ExpiresAt = DateTime.UtcNow.AddMinutes(15)
		};

		await dbContext.Session.AddAsync(session);
		await dbContext.SaveChangesAsync();

		session.Id.Should().NotBeNull();
		var sessionId = session.Id.Value;

		dbContext.Session.Remove(session);
		await dbContext.SaveChangesAsync();

		var remainingCount = await dbContext.Session
			.CountAsync(s => s.Id == sessionId);
		remainingCount.Should().Be(0);
	}
}
```

- [ ] **Step 4: Run the architecture guard and verify it fails**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~ArchitectureGuardSpec.ItShouldKeepSessionCredentialRowsWithoutSoftDeleteColumns"
```

Expected: the test fails because `Session` still has `IsDeleted` and `DeletedAt`.

- [ ] **Step 5: Run the hard-delete spec and verify it fails**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~SessionSpec.ItShouldPhysicallyDeleteWhenRemovedFromDbContext"
```

Expected: the test fails because `DbContext.Remove(session)` soft-deletes the row, so
`remainingCount` is `1` instead of `0`.

### Task 2: Refactor Session To A Non-Soft-Deleted Entity

**Files:**
- Modify: `apps/api/Src/Modules/Auth/Entities/Session.cs`
- Modify: `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- Modify: `apps/api/Src/Modules/Auth/Services/SessionService.cs`
- Test: `apps/api/Src/Lib/Architecture/ArchitectureGuard.Spec.cs`
- Test: `apps/api/Src/Modules/Auth/Entities/Session.Spec.cs`

- [ ] **Step 1: Replace the `Session` entity**

Replace `apps/api/Src/Modules/Auth/Entities/Session.cs` with:

```csharp
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

using Microsoft.EntityFrameworkCore;

using UserEntity = MainApi.Src.Modules.Users.Entities.User;

namespace MainApi.Src.Modules.Auth.Entities;

[Table("sessions")]
[Index(nameof(Token), IsUnique = true)]
[Index(nameof(ExpiresAt))]
public class Session : INoTenantEntity {
	[Key]
	[Column("id")]
	public Guid? Id { get; set; }

	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

	[Column("user_id")]
	public required Guid UserId { get; set; }

	[JsonIgnore]
	public UserEntity User { get; set; } = null!;

	[Column("token")]
	public required string Token { get; set; } = string.Empty;

	[Column("expires_at")]
	public required DateTime ExpiresAt { get; set; }

	[Column("is_impersonation")]
	public bool IsImpersonation { get; set; } = false;

	[Column("impersonating_staff_user_id")]
	public Guid? ImpersonatingStaffUserId { get; set; }

	[JsonIgnore]
	public UserEntity? ImpersonatingStaffUser { get; set; }

	[Column("impersonation_reason")]
	public string? ImpersonationReason { get; set; }

	[Column("impersonation_expires_at")]
	public DateTime? ImpersonationExpiresAt { get; set; }

	public bool IsImpersonationValid() {
		return IsImpersonation
			&& ImpersonationExpiresAt is not null
			&& ImpersonationExpiresAt.Value > DateTime.UtcNow;
	}
}
```

- [ ] **Step 2: Configure UUID v7 for `Session.Id`**

In `MainApiDbContext.OnModelCreating`, add this before the `Session -> User`
relationship configuration:

```csharp
		modelBuilder.Entity<Session>()
			.Property(s => s.Id)
			.HasDefaultValueSql("uuidv7()");
```

The surrounding block should read:

```csharp
		modelBuilder.Entity<Session>()
			.Property(s => s.Id)
			.HasDefaultValueSql("uuidv7()");

		// Explicit relationships for Session -> User (two FKs to same principal)
		modelBuilder.Entity<Session>()
			.HasOne(s => s.User)
			.WithMany(u => u.Sessions)
			.HasForeignKey(s => s.UserId)
			.IsRequired();
```

- [ ] **Step 3: Add explicit session timestamp tracking**

In `MainApiDbContext.UpdateAuditFields()`, make the first entity branch handle
`Session` before the `BaseAttributesNoKey` branch:

```csharp
			if (entry.Entity is Session session) {
				var now = DateTime.UtcNow;

				switch (entry.State) {
					case EntityState.Added:
						session.CreatedAt = now;
						session.UpdatedAt = now;
						break;

					case EntityState.Modified:
						session.UpdatedAt = now;
						break;

					case EntityState.Deleted:
						continue;
				}
			}
			// Handle BaseAttributesNoKey entities
			else if (entry.Entity is BaseAttributesNoKey baseEntity) {
```

This keeps normal session deletes physical while preserving timestamps for active rows.

- [ ] **Step 4: Remove soft-delete predicates from `SessionService`**

In `SessionService.GetSessionByToken()`, replace the lookup predicate:

```csharp
			where s.Token == token && !s.IsDeleted
```

with:

```csharp
			where s.Token == token
```

Then replace the expired-session delete query:

```csharp
				.Where(s => s.Token == token && !s.IsDeleted && s.ExpiresAt <= utcNow)
```

with:

```csharp
				.Where(s => s.Token == token && s.ExpiresAt <= utcNow)
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~ArchitectureGuardSpec.ItShouldKeepSessionCredentialRowsWithoutSoftDeleteColumns"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~SessionSpec.ItShouldPhysicallyDeleteWhenRemovedFromDbContext"
```

Expected: both tests pass.

### Task 3: Generate The EF Migration

**Files:**
- Generate: `apps/api/Migrations/*_RemoveSessionSoftDeleteColumns.cs`
- Generate: `apps/api/Migrations/*_RemoveSessionSoftDeleteColumns.Designer.cs`
- Modify: `apps/api/Migrations/MainApiDbContextModelSnapshot.cs`

- [ ] **Step 1: Generate the migration**

Run:

```bash
just db-add RemoveSessionSoftDeleteColumns
```

Expected: EF creates one migration pair under `apps/api/Migrations/` and updates
`apps/api/Migrations/MainApiDbContextModelSnapshot.cs`.

- [ ] **Step 2: Verify the migration drops only session soft-delete columns**

Open the generated `*_RemoveSessionSoftDeleteColumns.cs` file. Its `Up` method should
drop exactly these columns:

```csharp
migrationBuilder.DropColumn(
	name: "deleted_at",
	table: "sessions");

migrationBuilder.DropColumn(
	name: "is_deleted",
	table: "sessions");
```

Its `Down` method should add the same columns back to `sessions`:

```csharp
migrationBuilder.AddColumn<DateTime>(
	name: "deleted_at",
	table: "sessions",
	type: "timestamp with time zone",
	nullable: true);

migrationBuilder.AddColumn<bool>(
	name: "is_deleted",
	table: "sessions",
	type: "boolean",
	nullable: false,
	defaultValue: false);
```

- [ ] **Step 3: Verify the model snapshot session block**

Run:

```bash
Select-String -Path apps/api/Migrations/MainApiDbContextModelSnapshot.cs -Pattern 'MainApi.Src.Modules.Auth.Entities.Session' -Context 0,70
```

Expected: the `Session` block still contains `Id`, `CreatedAt`, `UpdatedAt`,
`ExpiresAt`, `Token`, `UserId`, and impersonation properties. It must not contain
`IsDeleted` or `DeletedAt`.

- [ ] **Step 4: Run the focused tests again**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~ArchitectureGuardSpec.ItShouldKeepSessionCredentialRowsWithoutSoftDeleteColumns"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~SessionSpec.ItShouldPhysicallyDeleteWhenRemovedFromDbContext"
```

Expected: both tests still pass after the migration and snapshot updates.

### Task 4: Verify Auth, Build, And Commit

**Files:**
- Verify: `apps/api/Src/Modules/Auth/Entities/Session.cs`
- Verify: `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- Verify: `apps/api/Src/Modules/Auth/Services/SessionService.cs`
- Verify: `apps/api/Src/Lib/Architecture/ArchitectureGuard.Spec.cs`
- Verify: `apps/api/Src/Modules/Auth/Entities/Session.Spec.cs`
- Verify: `apps/api/Migrations/`

- [ ] **Step 1: Run auth module tests**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~MainApi.Src.Modules.Auth"
```

Expected: all auth module tests pass, including existing expired-presented-session
coverage in `GetUserAuthDataSpec`.

- [ ] **Step 2: Run architecture guard tests**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~ArchitectureGuardSpec"
```

Expected: all architecture guard tests pass.

- [ ] **Step 3: Run the API build**

Run:

```bash
just build-api
```

Expected: build succeeds with no C# compiler or analyzer errors.

- [ ] **Step 4: Search for removed session soft-delete references**

Run:

```bash
rg "s\\.IsDeleted|Session.*IsDeleted|IsDeleted.*Session|Session.*DeletedAt|DeletedAt.*Session" apps/api/Src apps/api/Migrations -g "*.cs"
```

Expected: no production or snapshot references show `Session` carrying `IsDeleted` or
`DeletedAt`. The generated migration `Down` method may contain `is_deleted` and
`deleted_at` because rollback needs to recreate the dropped columns.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --stat
git diff -- apps/api/Src/Modules/Auth/Entities/Session.cs apps/api/Src/Data/DbContext/MainApiDbContext.cs apps/api/Src/Modules/Auth/Services/SessionService.cs
```

Expected:

- `Session` no longer inherits `BaseAttributes`.
- `Session` has explicit `Id`, `CreatedAt`, and `UpdatedAt`.
- `MainApiDbContext` configures `Session.Id` with `uuidv7()`.
- `MainApiDbContext.UpdateAuditFields()` stamps session timestamps without soft-deleting.
- `SessionService` no longer references `s.IsDeleted`.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
git add apps/api/Src/Modules/Auth/Entities/Session.cs `
	apps/api/Src/Data/DbContext/MainApiDbContext.cs `
	apps/api/Src/Modules/Auth/Services/SessionService.cs `
	apps/api/Src/Lib/Architecture/ArchitectureGuard.Spec.cs `
	apps/api/Src/Modules/Auth/Entities/Session.Spec.cs `
	apps/api/Migrations
git commit -m "fix(auth): hard delete session rows"
```

## Self-Review

- Spec coverage: the plan removes session soft-delete columns, keeps session identity
  and timestamp fields, preserves hard-delete expiry behavior, and keeps
  impersonation history in audit logs.
- Non-goals: the plan does not add background cleanup, frontend changes, or a separate
  impersonation history table.
- Placeholder scan: every task has concrete files, commands, code snippets, and
  expected outcomes.
- Type consistency: all snippets use existing `Session`, `MainApiDbContext`,
  `SessionService`, `ArchitectureGuardSpec`, `ApiFixture`, and `TestConstants`
  symbols.
