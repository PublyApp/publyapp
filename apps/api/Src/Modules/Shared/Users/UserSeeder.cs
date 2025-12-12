using System.Data;

using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Modules.Shared.Auth;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Shared.Users;

/// <summary>
/// Seeds User entities in the database.
/// </summary>
public class UserSeeder : IEntitySeeder {
	private static readonly Lazy<string> CachedSeedPassword = new(
		() => PasswordUtils.HashPassword("ChangeMe123!@3#lol"),
		LazyThreadSafetyMode.ExecutionAndPublication
	);

	private readonly ILogger<UserSeeder> _logger;

	public UserSeeder(ILogger<UserSeeder>? logger = null) {
		_logger = logger ?? CreateDefaultLogger();
	}

	private static ILogger<UserSeeder> CreateDefaultLogger() {
		using var loggerFactory = LoggerFactory.Create(builder => {
			builder.AddConsole();
		});
		return loggerFactory.CreateLogger<UserSeeder>();
	}

	public int Order => 30;

	public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		AppEnvironment.LoadEnv();
		var seedPassword = GetSeedPassword();

		// Seed all users (staff and tenant users)
		var allUsers = new List<(string Email, UserStatus Status, string? FirstName, string? LastName)>();

		var ownerEmail = AppEnvironment.STAFF_OWNER_EMAIL;
		if (!string.IsNullOrWhiteSpace(ownerEmail)) {
			var normalizedOwnerEmail = ownerEmail.Trim().ToLowerInvariant();
			allUsers.Add((normalizedOwnerEmail, UserStatus.Active, "Platform", "Owner"));
		}

		allUsers.AddRange(new List<(string Email, UserStatus Status, string? FirstName, string? LastName)> {
			// Staff users
			("staff-admin@example.com", UserStatus.Active, "Staff", "Admin"),
			("staff-user@example.com", UserStatus.Active, "Staff", "User"),
			// Tenant users
			("admin-acme@example.com", UserStatus.Active, "Admin", "Acme"),
			("user-acme@example.com", UserStatus.Active, "User", "Acme"),
			("admin-techstart@example.com", UserStatus.Active, "Admin", "TechStart"),
			("user-techstart@example.com", UserStatus.Active, "User", "TechStart"),
			("admin-global@example.com", UserStatus.Active, "Admin", "Global"),
			("user-global@example.com", UserStatus.Active, "User", "Global"),
			// Cross-tenant users
			("alice@example.com", UserStatus.Active, "Alice", "Example"),
			("bob@example.com", UserStatus.Active, "Bob", "Example"),
			("charlie@example.com", UserStatus.Active, "Charlie", "Example")
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
				_logger.LogInformation("Seeded {Count} users.", newUsers.Count);
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
				_logger.LogInformation("Seeded {Count} users.", newUsers.Count);
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

