using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Seeders;

/// <summary>
/// Seeds User entities in the database.
/// </summary>
public class UserSeeder : IEntitySeeder {
	private static readonly Lazy<string> CachedSeedPassword = new(
		() => PasswordUtils.HashPassword(SeedConstants.SeedPassword),
		LazyThreadSafetyMode.ExecutionAndPublication
	);

	private readonly ILogger<UserSeeder> _logger;

	public UserSeeder(ILogger<UserSeeder>? logger = null) {
		_logger = logger
			?? SeederLoggerUtils.CreateDefault<UserSeeder>();
	}

	public int Order {
		get {
			return 30;
		}
	}

	public bool IsDemo {
		get {
			return true;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		var seedPassword = GetSeedPassword();

		// Seed all users (staff and tenant users)
		var allUsers = new List<(string Email, UserStatus Status, string? FirstName, string? LastName)>();

		allUsers.AddRange(new List<(string Email, UserStatus Status, string? FirstName, string? LastName)> {
			// Staff users
			(SeedConstants.Staff.AdminEmail, UserStatus.Active, "Staff", "Admin"),
			(SeedConstants.Staff.UserEmail, UserStatus.Active, "Staff", "User"),
			// Tenant users
			(SeedConstants.Tenants.AcmeAdminEmail, UserStatus.Active, "Admin", "Acme"),
			(SeedConstants.Tenants.AcmeUserEmail, UserStatus.Active, "User", "Acme"),
			(SeedConstants.Tenants.TechStartAdminEmail, UserStatus.Active, "Admin", "TechStart"),
			(SeedConstants.Tenants.TechStartUserEmail, UserStatus.Active, "User", "TechStart"),
			(SeedConstants.Tenants.GlobalAdminEmail, UserStatus.Active, "Admin", "Global"),
			(SeedConstants.Tenants.GlobalUserEmail, UserStatus.Active, "User", "Global"),
			// Cross-tenant users
			(SeedConstants.CrossTenant.AliceEmail, UserStatus.Active, "Alice", "Example"),
			(SeedConstants.CrossTenant.BobEmail, UserStatus.Active, "Bob", "Example"),
			(SeedConstants.CrossTenant.CharlieEmail, UserStatus.Active, "Charlie", "Example")
		});

		var targetEmails = allUsers.Select(au => au.Email).ToList();
		var existingUserEmailsQuery =
			from u in dbContext.User
			where targetEmails.Contains(u.Email)
			select u.Email;
		var existingUserEmails = await existingUserEmailsQuery.ToListAsync(cancellationToken);

		var newUsers = allUsers
			.Where(au => !existingUserEmails.Contains(au.Email))
			.Select(au => new User {
				Email = au.Email,
				Password = seedPassword,
				Status = au.Status,
				FirstName = au.FirstName,
				LastName = au.LastName,
				IsVerified = true
			})
			.ToList();

		if (newUsers.Count == 0) {
			_logger.LogInformation("User seeding skipped; all users already exist.");
			return;
		}

		// Check if already in a transaction (e.g., during migrations)
		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.User.AddRangeAsync(newUsers, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded {Count} users.", newUsers.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogWarning(ex, "Duplicate users detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			// Already in transaction (likely migration), just save changes
			try {
				await dbContext.User.AddRangeAsync(newUsers, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded {Count} users.", newUsers.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				_logger.LogWarning(ex, "Duplicate users detected during seeding; skipping insert.");
			}
		}
	}

	/// <summary>
	/// Retrieves the cached seed password hash, ensuring the expensive hashing operation runs once.
	/// </summary>
	private static string GetSeedPassword() {
		return CachedSeedPassword.Value;
	}
}
