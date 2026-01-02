using System.Data;

using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Shared.Users;

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

		var newAccounts = new List<UserAccount>();

		// Seed staff accounts
		var staffAccounts = await SeedStaffAccountsAsync(dbContext, cancellationToken);
		newAccounts.AddRange(staffAccounts);

		// Seed tenant accounts
		var tenantAccounts = await SeedTenantAccountsAsync(dbContext, cancellationToken);
		newAccounts.AddRange(tenantAccounts);

		if (newAccounts.Count == 0) {
			_logger.LogInformation("UserAccount seeding skipped; all accounts already exist.");
			return;
		}

		// Check if already in a transaction (e.g., during migrations)
		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.UserAccount.AddRangeAsync(newAccounts, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded {Count} user accounts.", newAccounts.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogWarning(ex, "Duplicate accounts detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			// Already in transaction (likely migration), just save changes
			try {
				await dbContext.UserAccount.AddRangeAsync(newAccounts, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded {Count} user accounts.", newAccounts.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				_logger.LogWarning(ex, "Duplicate accounts detected during seeding; skipping insert.");
			}
		}
	}

	private async Task<List<UserAccount>> SeedStaffAccountsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
		var staffAccountsData = new List<(string Email, AccountLevel Level)>();

		var ownerEmail = AppEnvironment.STAFF_OWNER_EMAIL;
		if (!string.IsNullOrWhiteSpace(ownerEmail)) {
			staffAccountsData.Add((ownerEmail.Trim().ToLowerInvariant(), AccountLevel.Admin));
		}

		staffAccountsData.AddRange(new[] {
			("staff-admin@example.com", AccountLevel.Admin),
			("staff-user@example.com", AccountLevel.User)
		});

		var staffEmails = staffAccountsData.Select(sa => sa.Email).ToList();
		var users = await (
			from u in dbContext.User
			where staffEmails.Contains(u.Email)
			select u
		).ToListAsync(cancellationToken);

		if (users.Count == 0) {
			_logger.LogWarning("No staff users found for account creation.");
			return [];
		}

		var emailToUserId = users
			.Where(u => u.Id.HasValue)
			.ToDictionary(u => u.Email, u => u.Id!.Value);

		var userIds = emailToUserId.Values.ToList();
		var existingStaffUserIds = await (
			from ua in dbContext.UserAccount
			where userIds.Contains(ua.UserId) && ua.Scope == AccountScope.Staff
			select ua.UserId
		).ToListAsync(cancellationToken);
		var existingSet = existingStaffUserIds.ToHashSet();

		var newStaffAccounts = new List<UserAccount>();
		foreach (var sa in staffAccountsData) {
			if (emailToUserId.TryGetValue(sa.Email, out var userId) && !existingSet.Contains(userId)) {
				var account = UserAccount.CreateStaffAccount(userId, sa.Level);
				account.ValidateAccountType();
				newStaffAccounts.Add(account);
			}
		}

		return newStaffAccounts;
	}

	private async Task<List<UserAccount>> SeedTenantAccountsAsync(MainApiDbContext dbContext, CancellationToken cancellationToken) {
		// Define tenant accounts: (UserEmail, TenantCode, Level)
		var tenantAccountsData = new List<(string Email, string TenantCode, AccountLevel Level)> {
			// Acme Corporation users
			("admin-acme@example.com", "acme-corp", AccountLevel.Admin),
			("user-acme@example.com", "acme-corp", AccountLevel.User),
			// TechStart Inc users
			("admin-techstart@example.com", "techstart-inc", AccountLevel.Admin),
			("user-techstart@example.com", "techstart-inc", AccountLevel.User),
			// Global Solutions users
			("admin-global@example.com", "global-solutions", AccountLevel.Admin),
			("user-global@example.com", "global-solutions", AccountLevel.User),
			// Cross-tenant users (member of multiple tenants)
			("alice@example.com", "acme-corp", AccountLevel.User),
			("alice@example.com", "techstart-inc", AccountLevel.User),
			("bob@example.com", "techstart-inc", AccountLevel.User),
			("bob@example.com", "global-solutions", AccountLevel.User),
			("charlie@example.com", "acme-corp", AccountLevel.Admin),
			("charlie@example.com", "global-solutions", AccountLevel.User),
		};

		// Get all relevant users
		var userEmails = tenantAccountsData.Select(ta => ta.Email).Distinct().ToList();
		var users = await (
			from u in dbContext.User
			where userEmails.Contains(u.Email)
			select u
		).ToListAsync(cancellationToken);

		if (users.Count == 0) {
			_logger.LogWarning("No tenant users found for account creation.");
			return [];
		}

		var emailToUserId = users
			.Where(u => u.Id.HasValue)
			.ToDictionary(u => u.Email, u => u.Id!.Value);

		// Get all relevant tenants
		var tenantCodes = tenantAccountsData.Select(ta => ta.TenantCode).Distinct().ToList();
		var tenants = await (
			from t in dbContext.Tenant
			where tenantCodes.Contains(t.Code)
			select t
		).ToListAsync(cancellationToken);

		if (tenants.Count == 0) {
			_logger.LogWarning("No tenants found for account creation.");
			return [];
		}

		var codeToTenantId = tenants
			.Where(t => t.Id.HasValue)
			.ToDictionary(t => t.Code, t => t.Id!.Value);

		// Get existing tenant accounts
		var userIds = emailToUserId.Values.ToList();
		var existingTenantAccounts = await (
			from ua in dbContext.UserAccount
			where userIds.Contains(ua.UserId) && ua.Scope == AccountScope.Tenant
			select new { ua.UserId, ua.TenantId }
		).ToListAsync(cancellationToken);
		var existingSet = existingTenantAccounts
			.Where(e => e.TenantId.HasValue)
			.Select(e => (e.UserId, e.TenantId!.Value))
			.ToHashSet();

		var newTenantAccounts = new List<UserAccount>();
		foreach (var ta in tenantAccountsData) {
			if (!emailToUserId.TryGetValue(ta.Email, out var userId)) continue;
			if (!codeToTenantId.TryGetValue(ta.TenantCode, out var tenantId)) continue;
			if (existingSet.Contains((userId, tenantId))) continue;

			var account = UserAccount.CreateTenantAccount(userId, tenantId, ta.Level);
			account.ValidateAccountType();
			newTenantAccounts.Add(account);
		}

		return newTenantAccounts;
	}
}
