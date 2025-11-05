using System.Data;
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Account;

/// <summary>
/// Seeds UserAccount entities in the database.
/// Creates Staff accounts for platform administrators to enable login during development.
/// </summary>
public class UserAccountSeeder : IEntitySeeder {
	private readonly ILogger<UserAccountSeeder> _logger;

	public UserAccountSeeder(ILogger<UserAccountSeeder>? logger = null) {
		_logger = logger ?? CreateDefaultLogger();
	}

	private static ILogger<UserAccountSeeder> CreateDefaultLogger() {
		using var loggerFactory = LoggerFactory.Create(builder => {
			builder.AddConsole();
		});
		return loggerFactory.CreateLogger<UserAccountSeeder>();
	}

	public int Order => 40;

	public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		AppEnvironment.LoadEnv();
		// Define staff accounts to create
		var staffAccountsData = new List<(string Email, AccountLevel Level)>();

		var ownerEmail = AppEnvironment.STAFF_OWNER_EMAIL;
		if (!string.IsNullOrWhiteSpace(ownerEmail)) {
			staffAccountsData.Add((ownerEmail.Trim().ToLowerInvariant(), AccountLevel.Admin));
		}

		staffAccountsData.AddRange(new[] {
			("staff-admin@example.com", AccountLevel.Admin),
			("staff-user@example.com", AccountLevel.User)
		});

		// Get user IDs for the staff users
		var staffEmails = staffAccountsData.Select(sa => sa.Email).ToList();
		var usersQuery =
			from u in dbContext.User
			where staffEmails.Contains(u.Email)
			select u;
		var users = await usersQuery.ToListAsync(cancellationToken);

		if (users.Count == 0) {
			_logger.LogWarning("No staff users found for account creation. Ensure UserSeeder runs before UserAccountSeeder.");
			return;
		}

		// Map email to user ID
		var emailToUserId = users
			.Where(u => u.Id.HasValue)
			.ToDictionary(u => u.Email, u => u.Id!.Value);

		// Check which staff accounts already exist
		var userIds = users.Where(u => u.Id.HasValue).Select(u => u.Id!.Value).ToList();
		var existingStaffAccountsQuery =
			from ua in dbContext.UserAccount
			where userIds.Contains(ua.UserId) && ua.Scope == AccountScope.Staff
			select ua;
		var existingStaffAccounts = await existingStaffAccountsQuery.ToListAsync(cancellationToken);
		var existingStaffUserIds = existingStaffAccounts.Select(ua => ua.UserId).ToHashSet();

		// Create new staff accounts
		var newStaffAccounts = new List<UserAccount>();
		foreach (var sa in staffAccountsData) {
			if (emailToUserId.TryGetValue(sa.Email, out var userId) && !existingStaffUserIds.Contains(userId)) {
				var account = UserAccount.CreateStaffAccount(userId, sa.Level);
				account.ValidateAccountType();
				newStaffAccounts.Add(account);
			}
		}

		if (newStaffAccounts.Count == 0) {
			_logger.LogInformation("UserAccount seeding skipped; all staff accounts already exist.");
			return;
		}

		// Check if already in a transaction (e.g., during migrations)
		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.UserAccount.AddRangeAsync(newStaffAccounts, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				_logger.LogInformation("Seeded {Count} staff accounts.", newStaffAccounts.Count);
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogWarning(ex, "Duplicate staff accounts detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			// Already in transaction (likely migration), just save changes
			try {
				await dbContext.UserAccount.AddRangeAsync(newStaffAccounts, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				_logger.LogInformation("Seeded {Count} staff accounts.", newStaffAccounts.Count);
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				_logger.LogWarning(ex, "Duplicate staff accounts detected during seeding; skipping insert.");
			}
		}
	}
}
