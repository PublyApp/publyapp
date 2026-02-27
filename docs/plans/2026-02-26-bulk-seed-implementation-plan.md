# Bulk Seed Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a bulk seed system to generate ~500 tenants, ~8,000 users, and ~5,000 projects for testing pagination, search, and UI performance.

**Architecture:** Dedicated bulk seeding with CLI commands (`seed-bulk` and `seed-bulk-reset`), using Bogus for data generation and batch inserts to manage memory.

**Tech Stack:** .NET 9, Bogus (NuGet), EF Core

---

## Task 1: Add Bogus NuGet Package

**File:**
- Modify: `apps/api/MainApi.csproj`

**Step 1: Add Bogus package reference**

Add after line 43 (after the last PackageReference):

```xml
<PackageReference Include="Bogus" />
```

**Step 2: Commit**

```bash
git add apps/api/MainApi.csproj && git commit -m "feat(seeding): add Bogus package for bulk data generation"
```

---

## Task 2: Create BulkSeedConstants

**Files:**
- Create: `apps/api/Src/Lib/Seeding/BulkSeedConstants.cs`

**Step 1: Create the file**

```csharp
namespace MainApi.Src.Lib.Seeding;

/// <summary>
/// Configuration constants for bulk seed operations.
/// </summary>
public static class BulkSeedConstants {
	// Bulk data identification prefixes
	public const string TenantCodePrefix = "bulk-tenant-";
	public const string UserEmailDomain = "bulk.example.com";
	public const string ProjectNamePrefix = "Bulk Project ";

	// Default counts (can be overridden via env vars)
	public const int DefaultTenantCount = 500;
	public const int DefaultPowerUserCount = 200;
	public const int DefaultCrossTenantUserCount = 1400;
	public const int DefaultSingleTenantUserCount = 6400;
	public const int DefaultProjectsPerTenant = 10;
	public const int DefaultInvitationsPerTenant = 2;
	public const int DefaultBatchSize = 500;

	// Status distribution
	public const double ActiveTenantRatio = 0.90;
	public const double ActiveUserRatio = 0.85;
	public const double DeletedTenantRatio = 0.10;
	public const double DeletedUserRatio = 0.15;
	public const double DeletedProjectRatio = 0.05;

	// User distribution
	public const int MinTenantMembershipsForPowerUser = 10;
	public const int MaxTenantMembershipsForPowerUser = 50;
	public const int MinTenantMembershipsForCrossTenant = 2;
	public const int MaxTenantMembershipsForCrossTenant = 5;
}
```

**Step 2: Commit**

```bash
git add apps/api/Src/Lib/Seeding/BulkSeedConstants.cs && git commit -m "feat(seeding): add bulk seed constants"
```

---

## Task 3: Create BulkSeedDataGenerator

**Files:**
- Create: `apps/api/Src/Lib/Seeding/BulkSeedDataGenerator.cs`

**Step 1: Create the generator**

```csharp
using Bogus;
using MainApi.Src.Modules.Projects.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

namespace MainApi.Src.Lib.Seeding;

/// <summary>
/// Generates bulk seed data using Bogus.
/// </summary>
public class BulkSeedDataGenerator {
	private readonly int _tenantCount;
	private readonly int _powerUserCount;
	private readonly int _crossTenantUserCount;
	private readonly int _singleTenantUserCount;
	private readonly int _projectsPerTenant;
	private readonly int _invitationsPerTenant;

	private readonly Faker _faker;
	private readonly Random _random;

	private List<Tenant> _tenants = [];
	private List<User> _users = [];
	private List<UserAccount> _userAccounts = [];
	private List<Project> _projects = [];
	private List<Invitation> _invitations = [];

	public BulkSeedDataGenerator(
		int? tenantCount = null,
		int? powerUserCount = null,
		int? crossTenantUserCount = null,
		int? singleTenantUserCount = null,
		int? projectsPerTenant = null,
		int? invitationsPerTenant = null
	) {
		_tenantCount = tenantCount ?? BulkSeedConstants.DefaultTenantCount;
		_powerUserCount = powerUserCount ?? BulkSeedConstants.DefaultPowerUserCount;
		_crossTenantUserCount = crossTenantUserCount ?? BulkSeedConstants.DefaultCrossTenantUserCount;
		_singleTenantUserCount = singleTenantUserCount ?? BulkSeedConstants.DefaultSingleTenantUserCount;
		_projectsPerTenant = projectsPerTenant ?? BulkSeedConstants.DefaultProjectsPerTenant;
		_invitationsPerTenant = invitationsPerTenant ?? BulkSeedConstants.DefaultInvitationsPerTenant;

		_random = new Random(12345); // Fixed seed for reproducibility
		_faker = new Faker { Random = new Randomizer(_random) };
	}

	public IReadOnlyList<Tenant> Tenants => _tenants;
	public IReadOnlyList<User> Users => _users;
	public IReadOnlyList<UserAccount> UserAccounts => _userAccounts;
	public IReadOnlyList<Project> Projects => _projects;
	public IReadOnlyList<Invitation> Invitations => _invitations;

	/// <summary>
	/// Generates all bulk seed data in the correct order (dependencies first).
	/// </summary>
	public void GenerateAll() {
		GenerateTenants();
		GenerateUsers();
		GenerateUserAccounts();
		GenerateProjects();
		GenerateInvitations();
	}

	/// <summary>
	/// Generates bulk tenants.
	/// </summary>
	private void GenerateTenants() {
		_tenants = new List<Tenant>(_tenantCount);

		for (int i = 1; i <= _tenantCount; i++) {
			var isActive = _faker.Random.Double() < BulkSeedConstants.ActiveTenantRatio;
			var isDeleted = !isActive && _faker.Random.Double() < BulkSeedConstants.DeletedTenantRatio;

			var tenant = new Tenant {
				Code = $"{BulkSeedConstants.TenantCodePrefix}{i:D3}",
				Name = _faker.Company.CompanyName(),
				Status = isActive ? TenantStatus.Active : TenantStatus.Suspended,
				IsSuspended = !isActive,
				MaxUsers = 100
			};

			if (isDeleted) {
				tenant.IsDeleted = true;
				tenant.DeletedAt = _faker.Date.Past();
			}

			_tenants.Add(tenant);
		}
	}

	/// <summary>
	/// Generates bulk users.
	/// </summary>
	private void GenerateUsers() {
		var totalUsers = _powerUserCount + _crossTenantUserCount + _singleTenantUserCount;
		_users = new List<User>(totalUsers);

		// Generate power users (will have many tenant memberships)
		for (int i = 1; i <= _powerUserCount; i++) {
			_users.Add(GenerateUser(i, "power"));
		}

		// Generate cross-tenant users
		for (int i = 1; i <= _crossTenantUserCount; i++) {
			_users.Add(GenerateUser(i + _powerUserCount, "cross"));
		}

		// Generate single-tenant users
		for (int i = 1; i <= _singleTenantUserCount; i++) {
			_users.Add(GenerateUser(i + _powerUserCount + _crossTenantUserCount, "single"));
		}
	}

	private User GenerateUser(int index, string type) {
		var isActive = _faker.Random.Double() < BulkSeedConstants.ActiveUserRatio;
		var isDeleted = isActive && _faker.Random.Double() < BulkSeedConstants.DeletedUserRatio;

		var user = new User {
			Email = $"bulk.user{index:D5}@{BulkSeedConstants.UserEmailDomain}",
			Password = UserSeeder.CachedSeedPassword.Value,
			Status = isActive ? UserStatus.Active : UserStatus.Suspended,
			IsVerified = true,
			FirstName = _faker.Name.FirstName(),
			LastName = _faker.Name.LastName()
		};

		if (isDeleted) {
			user.IsDeleted = true;
			user.DeletedAt = _faker.Date.Past();
		}

		return user;
	}

	/// <summary>
	/// Generates user accounts linking users to tenants.
	/// </summary>
	private void GenerateUserAccounts() {
		_userAccounts = new List<UserAccount>();

		var activeTenants = _tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();
		var tenantIds = activeTenants.Select(t => t.GetRequiredId()).ToList();

		// Power users: 10-50 tenant memberships each
		var powerUsers = _users.Take(_powerUserCount).ToList();
		var usedPowerUserIndices = new HashSet<int>();
		var powerUserTenantAssignments = GenerateTenantMemberships(powerUsers.Count, tenantIds,
			BulkSeedConstants.MinTenantMembershipsForPowerUser,
			BulkSeedConstants.MaxTenantMembershipsForPowerUser);

		for (int i = 0; i < powerUsers.Count; i++) {
			var user = powerUsers[i];
			var assignedTenants = powerUserTenantAssignments[i];
			usedPowerUserIndices.UnionWith(assignedTenants);

			foreach (var tenantIndex in assignedTenants) {
				var tenantId = tenantIds[tenantIndex];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				_userAccounts.Add(account);
			}
		}

		// Cross-tenant users: 2-5 tenant memberships each
		var crossTenantUsers = _users.Skip(_powerUserCount).Take(_crossTenantUserCount).ToList();
		var availableTenantIds = tenantIds.Where((_, idx) => !usedPowerUserIndices.Contains(idx)).ToList();
		var crossTenantAssignments = GenerateTenantMemberships(crossTenantUsers.Count, availableTenantIds,
			BulkSeedConstants.MinTenantMembershipsForCrossTenant,
			BulkSeedConstants.MaxTenantMembershipsForCrossTenant);

		for (int i = 0; i < crossTenantUsers.Count; i++) {
			var user = crossTenantUsers[i];
			var assignedTenants = crossTenantAssignments[i];

			foreach (var tenantIdx in assignedTenants) {
				var tenantId = availableTenantIds[tenantIdx];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				_userAccounts.Add(account);
			}
		}

		// Single-tenant users: 1 tenant each
		var singleTenantUsers = _users.Skip(_powerUserCount + _crossTenantUserCount).ToList();
		var remainingTenantIds = availableTenantIds
			.Where((_, idx) => !crossTenantAssignments.SelectMany(x => x).Contains(idx))
			.ToList();

		var userPerTenant = (int)Math.Ceiling((double)singleTenantUsers.Count / remainingTenantIds.Count);
		var tenantUserCount = 0;

		for (int i = 0; i < singleTenantUsers.Count; i++) {
			var user = singleTenantUsers[i];
			var tenantIndex = i / userPerTenant;

			if (tenantIndex >= remainingTenantIds.Count) {
				tenantIndex = _random.Next(remainingTenantIds.Count);
			}

			var tenantId = remainingTenantIds[tenantIndex];
			var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
			account.ValidateAccountType();
			_userAccounts.Add(account);
		}
	}

	/// <summary>
	/// Generates random tenant membership assignments.
	/// </summary>
	private List<List<int>> GenerateTenantMemberships(int userCount, List<Guid> tenantIds, int minTenants, int maxTenants) {
		var assignments = new List<List<int>>();

		for (int i = 0; i < userCount; i++) {
			var tenantCount = _faker.Random.Int(minTenants, maxTenants);
			tenantCount = Math.Min(tenantCount, tenantIds.Count);

			var indices = Enumerable.Range(0, tenantIds.Count)
				.OrderBy(_ => _random.Next())
				.Take(tenantCount)
				.ToList();

			assignments.Add(indices);
		}

		return assignments;
	}

	/// <summary>
	/// Generates projects for each tenant.
	/// </summary>
	private void GenerateProjects() {
		_projects = new List<Project>();

		var activeTenants = _tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();

		foreach (var tenant in activeTenants) {
			var projectCount = _faker.Random.Int(3, _projectsPerTenant);

			for (int i = 1; i <= projectCount; i++) {
				var isDeleted = _faker.Random.Double() < BulkSeedConstants.DeletedProjectRatio;

				var project = new Project {
					TenantId = tenant.GetRequiredId(),
					Name = $"{BulkSeedConstants.ProjectNamePrefix}{tenant.Code}-{i}",
					Description = _faker.Lorem.Sentence()
				};

				if (isDeleted) {
					project.IsDeleted = true;
					project.DeletedAt = _faker.Date.Past();
				}

				_projects.Add(project);
			}
		}
	}

	/// <summary>
	/// Generates invitations for some tenants.
	/// </summary>
	private void GenerateInvitations() {
		_invitations = new List<Invitation>();

		var activeTenants = _tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();

		foreach (var tenant in activeTenants) {
			var inviteCount = _faker.Random.Int(0, _invitationsPerTenant);

			for (int i = 0; i < inviteCount; i++) {
				var invitation = new Invitation {
					TenantId = tenant.GetRequiredId(),
					Email = _faker.Internet.Email(),
					Scope = InvitationScope.Tenant,
					Status = InvitationStatus.Pending,
					ExpiresAt = DateTime.UtcNow.AddDays(7)
				};

				_invitations.Add(invitation);
			}
		}
	}
}
```

**Step 2: Commit**

```bash
git add apps/api/Src/Lib/Seeding/BulkSeedDataGenerator.cs && git commit -m "feat(seeding): add bulk data generator with Bogus"
```

---

## Task 4: Create BulkSeeder

**Files:**
- Create: `apps/api/Src/Lib/Seeding/BulkSeeder.cs`

**Step 1: Create the seeder**

```csharp
using System.Data;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Projects.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Lib.Seeding;

/// <summary>
/// Handles bulk seeding of test data with memory-efficient batch processing.
/// </summary>
public class BulkSeeder {
	private readonly ILogger<BulkSeeder> _logger;
	private readonly int _batchSize;

	public BulkSeeder(ILogger<BulkSeeder>? logger = null, int? batchSize = null) {
		_logger = logger ?? SeederLoggerUtils.CreateDefault<BulkSeeder>();
		_batchSize = batchSize ?? BulkSeedConstants.DefaultBatchSize;
	}

	/// <summary>
	/// Seeds bulk test data into the database.
	/// </summary>
	public async Task SeedBulkAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		var generator = new BulkSeedDataGenerator();
		generator.GenerateAll();

		_logger.LogInformation("Starting bulk seed: {TenantCount} tenants, {UserCount} users, {ProjectCount} projects",
			generator.Tenants.Count, generator.Users.Count, generator.Projects.Count);

		// Seed in batches with transaction per batch
		await SeedTenantsInBatchesAsync(dbContext, generator.Tenants, cancellationToken);
		await SeedUsersInBatchesAsync(dbContext, generator.Users, cancellationToken);
		await SeedUserAccountsInBatchesAsync(dbContext, generator.UserAccounts, cancellationToken);
		await SeedProjectsInBatchesAsync(dbContext, generator.Projects, cancellationToken);
		await SeedInvitationsInBatchesAsync(dbContext, generator.Invitations, cancellationToken);

		_logger.LogInformation("Bulk seed completed successfully.");
	}

	/// <summary>
	/// Clears all bulk seed data from the database.
	/// </summary>
	public async Task ClearBulkDataAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		_logger.LogInformation("Starting bulk data cleanup...");

		// Delete in reverse order of dependencies
		await DeleteInvitationsAsync(dbContext, cancellationToken);
		await DeleteProjectsAsync(dbContext, cancellationToken);
		await DeleteUserAccountsAsync(dbContext, cancellationToken);
		await DeleteUsersAsync(dbContext, cancellationToken);
		await DeleteTenantsAsync(dbContext, cancellationToken);

		_logger.LogInformation("Bulk data cleanup completed.");
	}

	private async Task SeedTenantsInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<Tenant> tenants, CancellationToken cancellationToken) {
		var batches = tenants.Chunk(_batchSize).ToList();
		var count = 0;

		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Tenant.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				_logger.LogInformation("Seeded {Count}/{Total} tenants", count, tenants.Count);
			} catch (Exception ex) {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogError(ex, "Error seeding tenant batch");
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
	}

	private async Task SeedUsersInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<User> users, CancellationToken cancellationToken) {
		var batches = users.Chunk(_batchSize).ToList();
		var count = 0;

		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.User.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				_logger.LogInformation("Seeded {Count}/{Total} users", count, users.Count);
			} catch (Exception ex) {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogError(ex, "Error seeding user batch");
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
	}

	private async Task SeedUserAccountsInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<UserAccount> accounts, CancellationToken cancellationToken) {
		var batches = accounts.Chunk(_batchSize).ToList();
		var count = 0;

		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.UserAccount.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				_logger.LogInformation("Seeded {Count}/{Total} user accounts", count, accounts.Count);
			} catch (Exception ex) {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogError(ex, "Error seeding user account batch");
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
	}

	private async Task SeedProjectsInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<Project> projects, CancellationToken cancellationToken) {
		var batches = projects.Chunk(_batchSize).ToList();
		var count = 0;

		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Project.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				_logger.LogInformation("Seeded {Count}/{Total} projects", count, projects.Count);
			} catch (Exception ex) {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogError(ex, "Error seeding project batch");
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
	}

	private async Task SeedInvitationsInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<Invitation> invitations, CancellationToken cancellationToken) {
		if (invitations.Count == 0) {
			return;
		}

		var batches = invitations.Chunk(_batchSize).ToList();
		var count = 0;

		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Invitation.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				_logger.LogInformation("Seeded {Count}/{Total} invitations", count, invitations.Count);
			} catch (Exception ex) {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogError(ex, "Error seeding invitation batch");
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
	}

	private async Task DeleteTenantsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
		var tenantCodes = await dbContext.Tenant
			.Where(t => t.Code.StartsWith(BulkSeedConstants.TenantCodePrefix))
			.Select(t => t.Code)
			.ToListAsync(cancellationToken);

		if (tenantCodes.Count == 0) {
			return;
		}

		_logger.LogInformation("Deleting {Count} bulk tenants...", tenantCodes.Count);

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			// Hard delete tenants (need to remove related data first due to FK constraints)
			await dbContext.Database.ExecuteSqlRawAsync($@"
				DELETE FROM ""tenants"" WHERE ""code"" LIKE '{BulkSeedConstants.TenantCodePrefix}%'",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			_logger.LogInformation("Deleted {Count} bulk tenants", tenantCodes.Count);
		} catch (Exception ex) {
			await transaction.RollbackAsync(cancellationToken);
			_logger.LogError(ex, "Error deleting bulk tenants");
			throw;
		}
	}

	private async Task DeleteUsersAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
		var domain = BulkSeedConstants.UserEmailDomain;
		var userCount = await dbContext.User
			.Where(u => u.Email.EndsWith($"@{domain}"))
			.CountAsync(cancellationToken);

		if (userCount == 0) {
			return;
		}

		_logger.LogInformation("Deleting {Count} bulk users...", userCount);

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			await dbContext.Database.ExecuteSqlRawAsync($@"
				DELETE FROM ""users"" WHERE ""email"" LIKE '%@{domain}'",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			_logger.LogInformation("Deleted {Count} bulk users", userCount);
		} catch (Exception ex) {
			await transaction.RollbackAsync(cancellationToken);
			_logger.LogError(ex, "Error deleting bulk users");
			throw;
		}
	}

	private async Task DeleteUserAccountsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
		var domain = BulkSeedConstants.UserEmailDomain;

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			// Delete user accounts linked to bulk users
			await dbContext.Database.ExecuteSqlRawAsync($@"
				DELETE FROM ""user_accounts""
				WHERE ""user_id"" IN (SELECT ""id"" FROM ""users"" WHERE ""email"" LIKE '%@{domain}')",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			_logger.LogInformation("Deleted bulk user accounts");
		} catch (Exception ex) {
			await transaction.RollbackAsync(cancellationToken);
			_logger.LogError(ex, "Error deleting bulk user accounts");
			throw;
		}
	}

	private async Task DeleteProjectsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
		var prefix = BulkSeedConstants.ProjectNamePrefix;

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			await dbContext.Database.ExecuteSqlRawAsync($@"
				DELETE FROM ""projects"" WHERE ""name"" LIKE '{prefix}%'",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			_logger.LogInformation("Deleted bulk projects");
		} catch (Exception ex) {
			await transaction.RollbackAsync(cancellationToken);
			_logger.LogError(ex, "Error deleting bulk projects");
			throw;
		}
	}

	private async Task DeleteInvitationsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
		// Invitations are tied to tenants, so they're deleted when tenants are deleted
		_logger.LogInformation("Skipping bulk invitation deletion (handled by tenant cascade)");
	}
}
```

**Step 2: Commit**

```bash
git add apps/api/Src/Lib/Seeding/BulkSeeder.cs && git commit -m "feat(seeding): add bulk seeder with batch processing"
```

---

## Task 5: Add CLI Commands

**File:**
- Modify: `apps/api/Program.cs`

**Step 1: Read the Program.cs to understand current structure**

```bash
head -50 apps/api/Program.cs
```

**Step 2: Add CLI command handling**

Add at the top of Program.cs (after the using statements):

```csharp
// CLI command handling for bulk seeding
if (args.Length > 0 && args[0] == "seed-bulk") {
	var builder = WebApplication.CreateBuilder(args);
	builder.Services.AddDbContext<MainApiDbContext>(options => {
		var env = AppEnvironment.Instance;
		options.UseNpgsql(env.DATABASE_URL);
	});

	var app = builder.Build();
	using var scope = app.Services.CreateScope();
	var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();
	var seeder = new BulkSeeder();

	Console.WriteLine("Starting bulk seed operation...");
	await seeder.SeedBulkAsync(dbContext);
	Console.WriteLine("Bulk seed completed!");
	return;
}

if (args.Length > 0 && args[0] == "seed-bulk-reset") {
	var builder = WebApplication.CreateBuilder(args);
	builder.Services.AddDbContext<MainApiDbContext>(options => {
		var env = AppEnvironment.Instance;
		options.UseNpgsql(env.DATABASE_URL);
	});

	var app = builder.Build();
	using var scope = app.Services.CreateScope();
	var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();
	var seeder = new BulkSeeder();

	Console.WriteLine("Starting bulk data cleanup...");
	await seeder.ClearBulkDataAsync(dbContext);
	Console.WriteLine("Bulk data cleanup completed!");
	return;
}
```

**Step 3: Commit**

```bash
git add apps/api/Program.cs && git commit -m "feat(seeding): add CLI commands for bulk seed operations"
```

---

## Task 6: Test the Implementation

**Step 1: Run the bulk seed command**

```bash
cd apps/api && dotnet run -- seed-bulk
```

Expected output: Logs showing tenant, user, project, and invitation seeding progress.

**Step 2: Verify data in database**

```bash
# Connect to database and check counts
psql -h localhost -U postgres -d publyapp -c "SELECT COUNT(*) FROM tenants WHERE code LIKE 'bulk-tenant-%';"
psql -h localhost -U postgres -d publyapp -c "SELECT COUNT(*) FROM users WHERE email LIKE '%@bulk.example.com';"
psql -h localhost -U postgres -d publyapp -c "SELECT COUNT(*) FROM projects WHERE name LIKE 'Bulk Project%';"
```

**Step 3: Test reset command**

```bash
cd apps/api && dotnet run -- seed-bulk-reset
```

Expected output: Logs showing cleanup of bulk data.

**Step 4: Verify cleanup**

```bash
psql -h localhost -U postgres -d publyapp -c "SELECT COUNT(*) FROM tenants WHERE code LIKE 'bulk-tenant-%';"
```

Expected: 0

**Step 5: Commit**

```bash
git commit -m "test: verify bulk seed and reset commands work correctly" --allow-empty
```

---

## Task 7: Add Make Commands

**File:**
- Modify: `Makefile`

**Step 1: Add make commands**

Add to Makefile:

```makefile
# Bulk seeding for testing
.PHONY: seed-bulk seed-bulk-reset

seed-bulk:
	cd apps/api && dotnet run -- seed-bulk

seed-bulk-reset:
	cd apps/api && dotnet run -- seed-bulk-reset
```

**Step 2: Commit**

```bash
git add Makefile && git commit -m "feat: add make commands for bulk seed operations"
```
