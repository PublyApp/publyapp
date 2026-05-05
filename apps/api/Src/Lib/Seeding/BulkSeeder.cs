using System.Data;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Modules.Projects.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Lib.Seeding;

/// <summary>
/// Handles bulk seeding of test data with memory-efficient batch processing.
/// </summary>
public class BulkSeeder {
	private readonly int _batchSize;

	public BulkSeeder(int? batchSize = null) {
		_batchSize = batchSize ?? BulkSeedConstants.DefaultBatchSize;
	}

	/// <summary>
	/// Seeds bulk test data into the database.
	/// </summary>
	public async Task SeedBulkAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		var generator = new BulkSeedDataGenerator();
		generator.GenerateAll();

		Console.WriteLine(
			$"Seeding {generator.Tenants.Count} tenants, {generator.TenantUsers.Count} tenant users, {generator.StaffUsers.Count} staff users, {generator.Projects.Count} projects...");

		// Seed in batches with transaction per batch
		await SeedTenantsInBatchesAsync(dbContext, generator.Tenants, cancellationToken);
		await SeedUsersInBatchesAsync(dbContext, generator.Users, cancellationToken);
		await SeedUserAccountsInBatchesAsync(dbContext, generator.UserAccounts, cancellationToken);
		await SeedProjectsInBatchesAsync(dbContext, generator.Projects, cancellationToken);

		Console.WriteLine("Bulk seed completed!");
	}

	/// <summary>
	/// Clears all bulk seed data from the database.
	/// </summary>
	public async Task ClearBulkDataAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		Console.WriteLine("Clearing bulk seed data...");

		// Delete in reverse order of dependencies
		await DeleteProjectsAsync(dbContext, cancellationToken);
		await DeleteUserAccountsAsync(dbContext, cancellationToken);
		await DeleteUsersAsync(dbContext, cancellationToken);
		await DeleteTenantsAsync(dbContext, cancellationToken);

		Console.WriteLine("Bulk data cleared!");
	}

	private async Task SeedTenantsInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<Tenant> tenants, CancellationToken cancellationToken) {
		var batches = tenants.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("Tenants: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Tenant.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rTenants: {count}/{tenants.Count} ");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rTenants: {count}/{tenants.Count} done");
	}

	private async Task SeedUsersInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<User> users, CancellationToken cancellationToken) {
		var batches = users.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("Users: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.User.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rUsers: {count}/{users.Count} ");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rUsers: {count}/{users.Count} done");
	}

	private async Task SeedUserAccountsInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<UserAccount> accounts, CancellationToken cancellationToken) {
		var batches = accounts.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("UserAccounts: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.UserAccount.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rUserAccounts: {count}/{accounts.Count} ");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rUserAccounts: {count}/{accounts.Count} done");
	}

	private async Task SeedProjectsInBatchesAsync(MainApiDbContext dbContext, IReadOnlyList<Project> projects, CancellationToken cancellationToken) {
		var batches = projects.Chunk(_batchSize).ToList();
		var count = 0;

		Console.Write("Projects: ");
		foreach (var batch in batches) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Project.AddRangeAsync(batch, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				count += batch.Length;
				Console.Write($"\rProjects: {count}/{projects.Count} ");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
			dbContext.ChangeTracker.Clear();
		}
		Console.WriteLine($"\rProjects: {count}/{projects.Count} done");
	}

	private async Task DeleteTenantsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
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

	private async Task DeleteUsersAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
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

	private async Task DeleteUserAccountsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
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

	private async Task DeleteProjectsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
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
