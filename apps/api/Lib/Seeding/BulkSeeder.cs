using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Seeding;

/// <summary>
/// Handles bulk seeding of test data with memory-efficient batch processing.
/// Idempotent: existing rows are detected by natural key (Tenant.Code, User.Email,
/// UserAccount membership, Project name-per-tenant) regardless of soft-delete state, so a
/// partially- or fully-seeded database is completed rather than re-inserted or crashed on.
/// </summary>
public class BulkSeeder {
	// SQLSTATE 23505 means "some unique index was violated" — any unique index on the
	// table, not necessarily the one this phase's natural key relies on. Each phase's
	// duplicate-handling catch must only ever absorb a violation of ITS OWN natural-key
	// index; any other index name means an unrelated unique-constraint failure (e.g.
	// schema drift, or a genuinely corrupt/duplicated batch) and must propagate.
	private static readonly HashSet<string> TenantNaturalKeyConstraints = ["ix_tenants_code_active"];
	private static readonly HashSet<string> UserNaturalKeyConstraints = ["ix_users_email_active"];

	// UserAccount's natural-key uniqueness is enforced by one of three constraints
	// depending on Scope (staff/tenant/project); all three are equally "the natural key"
	// for this entity type.
	private static readonly HashSet<string> UserAccountNaturalKeyConstraints = [
		"ux_user_accounts_staff_active",
		"ux_user_accounts_tenant_active",
		"ux_user_accounts_project_active",
	];
	private static readonly HashSet<string> ProjectNaturalKeyConstraints = ["IX_projects_tenant_id_name"];

	private readonly int _batchSize;
	private readonly BulkSeedDataGenerator? _generator;

	public BulkSeeder(int? batchSize = null, BulkSeedDataGenerator? generator = null) {
		_batchSize = batchSize ?? BulkSeedConstants.DefaultBatchSize;
		_generator = generator;
	}

	/// <summary>
	/// True only when <paramref name="ex"/> wraps a Postgres unique-violation (23505) on one
	/// of the exact constraint names this phase expects for its own natural key. A 23505 on
	/// any other constraint is an unrelated unique-index violation and must not be treated as
	/// "this natural key already exists" — see the class-level catch blocks below.
	/// </summary>
	private static bool IsExpectedNaturalKeyViolation(DbUpdateException ex, IReadOnlySet<string> expectedConstraintNames) {
		return ex.InnerException is Npgsql.PostgresException { SqlState: "23505" } pgEx
			&& pgEx.ConstraintName is not null
			&& expectedConstraintNames.Contains(pgEx.ConstraintName);
	}

	/// <summary>
	/// Seeds bulk test data into the database. Safe to run repeatedly: rows that already
	/// exist (matched by natural key) are skipped, and only missing rows are inserted.
	/// </summary>
	public async Task SeedBulkAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		var generator = _generator ?? new BulkSeedDataGenerator();
		generator.GenerateAll();

		Console.WriteLine(
			$"Seeding {generator.Tenants.Count} tenants, {generator.TenantUsers.Count} tenant users, {generator.StaffUsers.Count} staff users, {generator.Projects.Count} projects...");

		// Seed in batches with transaction per batch. Tenants and Users must be resolved
		// (existing rows matched, new rows inserted) before UserAccounts/Projects, because
		// those carry FKs that must point at the REAL persisted id of a tenant/user that
		// already existed, not the fresh id the generator assigned it this run.
		var tenantIdRemap = await SeedTenantsInBatchesAsync(dbContext, generator.Tenants, cancellationToken);
		var userIdRemap = await SeedUsersInBatchesAsync(dbContext, generator.Users, cancellationToken);
		await SeedUserAccountsInBatchesAsync(dbContext, generator.UserAccounts, userIdRemap, tenantIdRemap, cancellationToken);
		await SeedProjectsInBatchesAsync(dbContext, generator.Projects, tenantIdRemap, cancellationToken);

		Console.WriteLine("Bulk seed completed!");
	}

	/// <summary>
	/// Clears all bulk seed data from the database.
	/// </summary>
	public async Task ClearBulkDataAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		Console.WriteLine("Clearing bulk seed data...");

		// Delete in reverse order of dependencies
		await DeleteProjectsAsync(dbContext, cancellationToken);
		await DeleteUserAccountsAsync(dbContext, cancellationToken);
		await DeleteUsersAsync(dbContext, cancellationToken);
		await DeleteTenantsAsync(dbContext, cancellationToken);

		Console.WriteLine("Bulk data cleared!");
	}

	/// <summary>
	/// Seeds tenants not yet present (matched by Code, regardless of soft-delete state —
	/// the unique index on Code is filtered to non-deleted rows, so a naive existence check
	/// would let duplicate soft-deleted tenants accumulate on every run).
	/// Returns a map from the generator's in-memory tenant id to the real persisted id
	/// (itself for newly-inserted tenants, the pre-existing row's id otherwise).
	/// </summary>
	internal async Task<Dictionary<Guid, Guid>> SeedTenantsInBatchesAsync(
		AppDbContext dbContext,
		IReadOnlyList<Tenant> tenants,
		CancellationToken cancellationToken
	) {
		var codes = tenants.Select(t => t.Code).ToList();
		var existingTenants = await dbContext.Tenant
			.AsNoTracking()
			.Where(t => codes.Contains(t.Code))
			.ToListAsync(cancellationToken);
		var existingByCode = existingTenants.ToDictionary(t => t.Code, t => t.GetRequiredId());

		var remap = new Dictionary<Guid, Guid>(tenants.Count);
		var toInsert = new List<Tenant>();
		foreach (var tenant in tenants) {
			var generatedId = tenant.GetRequiredId();
			if (existingByCode.TryGetValue(tenant.Code, out var existingId)) {
				remap[generatedId] = existingId;
			} else {
				remap[generatedId] = generatedId;
				toInsert.Add(tenant);
			}
		}

		var skipped = tenants.Count - toInsert.Count;
		if (toInsert.Count == 0) {
			Console.WriteLine($"Tenants: seeding skipped; all {tenants.Count} tenants already exist.");
			return remap;
		}

		var batches = toInsert.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("Tenants: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Tenant.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rTenants: {count}/{toInsert.Count} inserted, {skipped} already existed ");
			} catch (DbUpdateException ex) when (IsExpectedNaturalKeyViolation(ex, TenantNaturalKeyConstraints)) {
				await transaction.RollbackAsync(cancellationToken);

				// The violated index IS the tenant natural key, but that alone doesn't prove
				// someone else already inserted it — two rows within THIS batch could have
				// collided with each other, in which case rollback leaves neither persisted.
				// Only treat this as a benign "already exists" skip if at least one of the
				// batch's codes is actually present in the database.
				var batchCodes = batch.Select(t => t.Code).ToHashSet();
				var anyPersisted = await dbContext.Tenant
					.AsNoTracking()
					.AnyAsync(t => batchCodes.Contains(t.Code), cancellationToken);
				if (!anyPersisted) {
					throw;
				}

				Console.WriteLine();
				Console.WriteLine("Warning: duplicate tenants detected mid-batch during seeding; skipping batch.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rTenants: {count}/{toInsert.Count} inserted, {skipped} already existed. done");
		return remap;
	}

	/// <summary>
	/// Seeds users not yet present (matched by Email, regardless of soft-delete state —
	/// same filtered-unique-index trap as tenants).
	/// Returns a map from the generator's in-memory user id to the real persisted id.
	/// </summary>
	private async Task<Dictionary<Guid, Guid>> SeedUsersInBatchesAsync(
		AppDbContext dbContext,
		IReadOnlyList<User> users,
		CancellationToken cancellationToken
	) {
		var emails = users.Select(u => u.Email).ToList();
		var existingUsers = await dbContext.User
			.AsNoTracking()
			.Where(u => emails.Contains(u.Email))
			.ToListAsync(cancellationToken);
		var existingByEmail = existingUsers.ToDictionary(u => u.Email, u => u.GetRequiredId());

		var remap = new Dictionary<Guid, Guid>(users.Count);
		var toInsert = new List<User>();
		foreach (var user in users) {
			var generatedId = user.GetRequiredId();
			if (existingByEmail.TryGetValue(user.Email, out var existingId)) {
				remap[generatedId] = existingId;
			} else {
				remap[generatedId] = generatedId;
				toInsert.Add(user);
			}
		}

		var skipped = users.Count - toInsert.Count;
		if (toInsert.Count == 0) {
			Console.WriteLine($"Users: seeding skipped; all {users.Count} users already exist.");
			return remap;
		}

		var batches = toInsert.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("Users: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.User.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rUsers: {count}/{toInsert.Count} inserted, {skipped} already existed ");
			} catch (DbUpdateException ex) when (IsExpectedNaturalKeyViolation(ex, UserNaturalKeyConstraints)) {
				await transaction.RollbackAsync(cancellationToken);

				// Same reasoning as the tenant phase: the constraint name alone doesn't prove
				// this was a benign concurrent duplicate — confirm a matching email actually
				// made it to disk before treating it as one.
				var batchEmails = batch.Select(u => u.Email).ToHashSet();
				var anyPersisted = await dbContext.User
					.AsNoTracking()
					.AnyAsync(u => batchEmails.Contains(u.Email), cancellationToken);
				if (!anyPersisted) {
					throw;
				}

				Console.WriteLine();
				Console.WriteLine("Warning: duplicate users detected mid-batch during seeding; skipping batch.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rUsers: {count}/{toInsert.Count} inserted, {skipped} already existed. done");
		return remap;
	}

	/// <summary>
	/// Seeds user accounts not yet present. Natural key is (UserId, Scope, TenantId,
	/// ProjectId) after remapping the generator's fresh User/Tenant ids to their real
	/// persisted ids — checked regardless of soft-delete state, since every uniqueness
	/// constraint on user_accounts is filtered to non-deleted rows.
	/// </summary>
	private async Task SeedUserAccountsInBatchesAsync(
		AppDbContext dbContext,
		IReadOnlyList<UserAccount> accounts,
		IReadOnlyDictionary<Guid, Guid> userIdRemap,
		IReadOnlyDictionary<Guid, Guid> tenantIdRemap,
		CancellationToken cancellationToken
	) {
		foreach (var account in accounts) {
			account.UserId = userIdRemap[account.UserId];
			if (account.TenantId is Guid generatedTenantId) {
				account.TenantId = tenantIdRemap[generatedTenantId];
			}
		}

		var userIds = accounts.Select(a => a.UserId).Distinct().ToList();
		var existingAccounts = await dbContext.UserAccount
			.AsNoTracking()
			.Where(ua => userIds.Contains(ua.UserId))
			.ToListAsync(cancellationToken);
		var existingKeys = existingAccounts
			.Select(a => (a.UserId, a.Scope, a.TenantId, a.ProjectId))
			.ToHashSet();

		var toInsert = accounts
			.Where(a => !existingKeys.Contains((a.UserId, a.Scope, a.TenantId, a.ProjectId)))
			.ToList();

		var skipped = accounts.Count - toInsert.Count;
		if (toInsert.Count == 0) {
			Console.WriteLine($"UserAccounts: seeding skipped; all {accounts.Count} user accounts already exist.");
			return;
		}

		var batches = toInsert.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("UserAccounts: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.UserAccount.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rUserAccounts: {count}/{toInsert.Count} inserted, {skipped} already existed ");
			} catch (DbUpdateException ex) when (IsExpectedNaturalKeyViolation(ex, UserAccountNaturalKeyConstraints)) {
				await transaction.RollbackAsync(cancellationToken);

				// Same reasoning as the tenant/user phases: confirm at least one of the
				// batch's (UserId, Scope, TenantId, ProjectId) natural keys is actually
				// persisted before treating this as a benign concurrent duplicate.
				var batchKeys = batch.Select(a => (a.UserId, a.Scope, a.TenantId, a.ProjectId)).ToHashSet();
				var batchUserIds = batch.Select(a => a.UserId).Distinct().ToList();
				var persistedAccounts = await dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => batchUserIds.Contains(ua.UserId))
					.Select(ua => new { ua.UserId, ua.Scope, ua.TenantId, ua.ProjectId })
					.ToListAsync(cancellationToken);
				var anyPersisted = persistedAccounts.Any(p => batchKeys.Contains((p.UserId, p.Scope, p.TenantId, p.ProjectId)));
				if (!anyPersisted) {
					throw;
				}

				Console.WriteLine();
				Console.WriteLine("Warning: duplicate user accounts detected mid-batch during seeding; skipping batch.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rUserAccounts: {count}/{toInsert.Count} inserted, {skipped} already existed. done");
	}

	/// <summary>
	/// Seeds projects not yet present. Natural key is (TenantId, Name) after remapping the
	/// generator's fresh Tenant ids to their real persisted ids. The (TenantId, Name) index
	/// is a plain unique index (not filtered to non-deleted rows), so the database itself
	/// would already reject a re-insert here — this check exists to skip cleanly instead of
	/// throwing, not to guard against silent duplicate accumulation.
	/// </summary>
	private async Task SeedProjectsInBatchesAsync(
		AppDbContext dbContext,
		IReadOnlyList<Project> projects,
		IReadOnlyDictionary<Guid, Guid> tenantIdRemap,
		CancellationToken cancellationToken
	) {
		foreach (var project in projects) {
			project.TenantId = tenantIdRemap[project.TenantId];
		}

		var tenantIds = projects.Select(p => p.TenantId).Distinct().ToList();
		var existingProjects = await dbContext.Project
			.AsNoTracking()
			.Where(p => tenantIds.Contains(p.TenantId))
			.ToListAsync(cancellationToken);
		var existingKeys = existingProjects
			.Select(p => (p.TenantId, p.Name))
			.ToHashSet();

		var toInsert = projects
			.Where(p => !existingKeys.Contains((p.TenantId, p.Name)))
			.ToList();

		var skipped = projects.Count - toInsert.Count;
		if (toInsert.Count == 0) {
			Console.WriteLine($"Projects: seeding skipped; all {projects.Count} projects already exist.");
			return;
		}

		var batches = toInsert.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("Projects: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Project.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rProjects: {count}/{toInsert.Count} inserted, {skipped} already existed ");
			} catch (DbUpdateException ex) when (IsExpectedNaturalKeyViolation(ex, ProjectNaturalKeyConstraints)) {
				await transaction.RollbackAsync(cancellationToken);

				// Same reasoning as the other phases — this is the exact blocker the
				// adversarial review reproduced: an unrelated unique index on this table
				// (schema drift) also raises 23505, and swallowing it here silently drops
				// the whole batch. Only skip if a batch natural key is actually persisted.
				var batchKeys = batch.Select(p => (p.TenantId, p.Name)).ToHashSet();
				var batchTenantIds = batch.Select(p => p.TenantId).Distinct().ToList();
				var persistedProjects = await dbContext.Project
					.AsNoTracking()
					.Where(p => batchTenantIds.Contains(p.TenantId))
					.Select(p => new { p.TenantId, p.Name })
					.ToListAsync(cancellationToken);
				var anyPersisted = persistedProjects.Any(p => batchKeys.Contains((p.TenantId, p.Name)));
				if (!anyPersisted) {
					throw;
				}

				Console.WriteLine();
				Console.WriteLine("Warning: duplicate projects detected mid-batch during seeding; skipping batch.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rProjects: {count}/{toInsert.Count} inserted, {skipped} already existed. done");
	}

	private static async Task DeleteTenantsAsync(AppDbContext dbContext, CancellationToken cancellationToken) {
		var tenantCodes = await dbContext.Tenant
			.Where(t => t.Code.StartsWith(BulkSeedConstants.TenantCodePrefix))
			.Select(t => t.Code)
			.ToListAsync(cancellationToken);

		if (tenantCodes.Count == 0) {
			return;
		}

		Console.Write($"Deleting {tenantCodes.Count} tenants... ");

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			var prefix = BulkSeedConstants.TenantCodePrefix + "%";
			await dbContext.Database.ExecuteSqlInterpolatedAsync(
				$"DELETE FROM \"tenants\" WHERE \"code\" LIKE {prefix}",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			Console.WriteLine("done");
		} catch (Exception) {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	private static async Task DeleteUsersAsync(AppDbContext dbContext, CancellationToken cancellationToken) {
		var domain = BulkSeedConstants.UserEmailDomain;
		var userCount = await dbContext.User
			.Where(u => u.Email.EndsWith($"@{domain}"))
			.CountAsync(cancellationToken);

		if (userCount == 0) {
			return;
		}

		Console.Write($"Deleting {userCount} users... ");

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			var pattern = $"%@{domain}";
			await dbContext.Database.ExecuteSqlInterpolatedAsync(
				$"DELETE FROM \"users\" WHERE \"email\" LIKE {pattern}",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			Console.WriteLine("done");
		} catch (Exception) {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	private static async Task DeleteUserAccountsAsync(AppDbContext dbContext, CancellationToken cancellationToken) {
		var domain = BulkSeedConstants.UserEmailDomain;

		Console.Write("Deleting user accounts... ");

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			var pattern = $"%@{domain}";
			await dbContext.Database.ExecuteSqlInterpolatedAsync(
				$"DELETE FROM \"user_accounts\" WHERE \"user_id\" IN (SELECT \"id\" FROM \"users\" WHERE \"email\" LIKE {pattern})",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			Console.WriteLine("done");
		} catch (Exception) {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	private static async Task DeleteProjectsAsync(AppDbContext dbContext, CancellationToken cancellationToken) {
		var prefix = BulkSeedConstants.ProjectNamePrefix;

		Console.Write("Deleting projects... ");

		await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
		try {
			var pattern = prefix + "%";
			await dbContext.Database.ExecuteSqlInterpolatedAsync(
				$"DELETE FROM \"projects\" WHERE \"name\" LIKE {pattern}",
				cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			Console.WriteLine("done");
		} catch (Exception) {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}
}
