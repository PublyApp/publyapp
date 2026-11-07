using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Seeders;

/// <summary>
/// Seeds UserAccount entities in the database.
/// Creates Staff accounts for platform administrators to enable login during development.
/// </summary>
public class UserAccountSeeder : IEntitySeeder {
	private readonly ILogger<UserAccountSeeder> _Logger;
	private readonly HashSet<string> _FullAccessEmails = new(StringComparer.OrdinalIgnoreCase);
	private readonly List<(Guid UserId, Guid TenantId)> _FullAccessTenants = [];

	public UserAccountSeeder(ILogger<UserAccountSeeder>? logger = null) {
		this._Logger = logger
			?? SeederLoggerUtils.CreateDefault<UserAccountSeeder>();
	}

	public int Order {
		get {
			return 40;
		}
	}

	public bool IsDemo {
		get {
			return true;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		var newAccounts = new List<UserAccount>();

		// Seed staff accounts
		var staffAccounts = await this._SeedStaffAccountsAsync(dbContext, cancellationToken);
		newAccounts.AddRange(staffAccounts);

		// Seed tenant accounts
		var tenantAccounts = await this._SeedTenantAccountsAsync(dbContext, cancellationToken);
		newAccounts.AddRange(tenantAccounts);

		if (newAccounts.Count == 0) {
			this._Logger.LogInformation("UserAccount seeding skipped; all accounts already exist.");
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
				await this._SeedFullAccessAssignmentsAsync(dbContext, cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded {Count} user accounts.", newAccounts.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				await transaction.RollbackAsync(cancellationToken);
				this._Logger.LogWarning(ex, "Duplicate accounts detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			// Already in transaction (likely migration), just save changes
			try {
				await dbContext.UserAccount.AddRangeAsync(newAccounts, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await this._SeedFullAccessAssignmentsAsync(dbContext, cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded {Count} user accounts.", newAccounts.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				this._Logger.LogWarning(ex, "Duplicate accounts detected during seeding; skipping insert.");
			}
		}
	}

	private async Task<List<UserAccount>> _SeedStaffAccountsAsync(AppDbContext dbContext, CancellationToken cancellationToken) {
		var staffAccountsData = new List<(string Email, bool IsFullAccess)> {
			(SeedConstants.Staff.AdminEmail, true),
			(SeedConstants.Staff.UserEmail, false)
		};

		var staffEmails = staffAccountsData.Select(sa => sa.Email).ToList();
		var users = await (
			from u in dbContext.User
			where staffEmails.Contains(u.Email)
			select u
		).ToListAsync(cancellationToken);

		if (users.Count == 0) {
			this._Logger.LogWarning("No staff users found for account creation.");
			return [];
		}

		var emailToUserId = users
			.Where(u => u.Id.HasValue)
			.ToDictionary(
				u => u.Email,
				u => u.GetRequiredId()
			);

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
				var account = UserAccount.CreateStaffAccount(userId);
				account.ValidateAccountType();
				newStaffAccounts.Add(account);
				if (sa.IsFullAccess) {
					this._FullAccessEmails.Add(sa.Email);
				}
			}
		}

		return newStaffAccounts;
	}

	private async Task<List<UserAccount>> _SeedTenantAccountsAsync(AppDbContext dbContext, CancellationToken cancellationToken) {
		// Define tenant accounts: (UserEmail, TenantCode, IsFullAccess)
		var tenantAccountsData = new List<(string Email, string TenantCode, bool IsFullAccess)> {
			// Acme Corporation users
			(SeedConstants.Tenants.AcmeAdminEmail, SeedConstants.Tenants.AcmeCode, true),
			(SeedConstants.Tenants.AcmeUserEmail, SeedConstants.Tenants.AcmeCode, false),
			// TechStart Inc users
			(SeedConstants.Tenants.TechStartAdminEmail, SeedConstants.Tenants.TechStartCode, true),
			(SeedConstants.Tenants.TechStartUserEmail, SeedConstants.Tenants.TechStartCode, false),
			// Global Solutions users
			(SeedConstants.Tenants.GlobalAdminEmail, SeedConstants.Tenants.GlobalCode, true),
			(SeedConstants.Tenants.GlobalUserEmail, SeedConstants.Tenants.GlobalCode, false),
			// Cross-tenant users (member of multiple tenants)
			(SeedConstants.CrossTenant.AliceEmail, SeedConstants.Tenants.AcmeCode, false),
			(SeedConstants.CrossTenant.AliceEmail, SeedConstants.Tenants.TechStartCode, false),
			(SeedConstants.CrossTenant.BobEmail, SeedConstants.Tenants.TechStartCode, false),
			(SeedConstants.CrossTenant.BobEmail, SeedConstants.Tenants.GlobalCode, false),
			(SeedConstants.CrossTenant.CharlieEmail, SeedConstants.Tenants.AcmeCode, true),
			(SeedConstants.CrossTenant.CharlieEmail, SeedConstants.Tenants.GlobalCode, false),
		};

		// Get all relevant users
		var userEmails = tenantAccountsData.Select(ta => ta.Email).Distinct().ToList();
		var users = await (
			from u in dbContext.User
			where userEmails.Contains(u.Email)
			select u
		).ToListAsync(cancellationToken);

		if (users.Count == 0) {
			this._Logger.LogWarning("No tenant users found for account creation.");
			return [];
		}

		var emailToUserId = users
			.Where(u => u.Id.HasValue)
			.ToDictionary(
				u => u.Email,
				u => u.GetRequiredId()
			);

		// Get all relevant tenants
		var tenantCodes = tenantAccountsData.Select(ta => ta.TenantCode).Distinct().ToList();
		var tenants = await (
			from t in dbContext.Tenant
			where tenantCodes.Contains(t.Code)
			select t
		).ToListAsync(cancellationToken);

		if (tenants.Count == 0) {
			this._Logger.LogWarning("No tenants found for account creation.");
			return [];
		}

		var codeToTenantId = tenants
			.Where(t => t.Id.HasValue)
			.ToDictionary(
				t => t.Code,
				t => t.GetRequiredId()
			);

		// Get existing tenant accounts
		var userIds = emailToUserId.Values.ToList();
		var existingTenantAccounts = await (
			from ua in dbContext.UserAccount
			where userIds.Contains(ua.UserId) && ua.Scope == AccountScope.Tenant
			select new { ua.UserId, ua.TenantId }
		).ToListAsync(cancellationToken);
		var existingSet = existingTenantAccounts
			.Where(e => e.TenantId.HasValue)
			.Select(e => (
				e.UserId,
				TenantId: e.TenantId
					?? Guid.Empty
			))
			.ToHashSet();

		var newTenantAccounts = new List<UserAccount>();
		foreach (var ta in tenantAccountsData) {
			if (!emailToUserId.TryGetValue(ta.Email, out var userId)) {
				continue;
			}

			if (!codeToTenantId.TryGetValue(ta.TenantCode, out var tenantId)) {
				continue;
			}

			if (existingSet.Contains((userId, tenantId))) {
				continue;
			}

			var account = UserAccount.CreateTenantAccount(userId, tenantId);
			account.ValidateAccountType();
			newTenantAccounts.Add(account);
			if (ta.IsFullAccess) {
				this._FullAccessTenants.Add((userId, tenantId));
			}
		}

		return newTenantAccounts;
	}

	private async Task _SeedFullAccessAssignmentsAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken
	) {
		if (this._FullAccessEmails.Count == 0 && this._FullAccessTenants.Count == 0) {
			return;
		}

		var staffRole = await (
			from p in dbContext.Role
			where p.Scope == RoleScope.Staff
				&& p.Name == SystemRoleNames.StaffFullAccess
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (staffRole is null) {
			staffRole = Role.CreateStaffRole(
				SystemRoleNames.StaffFullAccess,
				"Platform owner with full system access",
				isFullAccess: true
			);
			await dbContext.Role.AddAsync(staffRole, cancellationToken);
			await dbContext.SaveChangesAsync(cancellationToken);
		}

		if (staffRole.Id is Guid staffRoleId) {
			var staffAccountIds = await (
				from ua in dbContext.UserAccount
				join u in dbContext.User on ua.UserId equals u.Id
				where ua.Scope == AccountScope.Staff
					&& !ua.IsDeleted
					&& this._FullAccessEmails.Contains(u.Email)
				select ua.Id
			).ToListAsync(cancellationToken);

			foreach (var accountId in staffAccountIds.OfType<Guid>()) {
				var exists = await dbContext.UserAccountRole.AnyAsync(
					uap => uap.UserAccountId == accountId && uap.RoleId == staffRoleId,
					cancellationToken);
				if (!exists) {
					await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
						UserAccountId = accountId,
						RoleId = staffRoleId
					}, cancellationToken);
				}
			}
		}

		foreach (var (userId, tenantId) in this._FullAccessTenants) {
			var tenantRole = await (
				from p in dbContext.Role
				where p.Scope == RoleScope.Tenant
					&& p.TenantId == tenantId
					&& p.Name == SystemRoleNames.TenantFullAccess
					&& !p.IsDeleted
				select p
			).FirstOrDefaultAsync(cancellationToken);

			if (tenantRole is null) {
				tenantRole = Role.CreateTenantRole(
					tenantId,
					SystemRoleNames.TenantFullAccess,
					"Organization owner with full access",
					isFullAccess: true
				);
				await dbContext.Role.AddAsync(tenantRole, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
			}

			if (tenantRole.Id is not Guid tenantRoleId) {
				continue;
			}

			var accountId = await (
				from ua in dbContext.UserAccount
				where ua.UserId == userId
					&& ua.TenantId == tenantId
					&& ua.Scope == AccountScope.Tenant
					&& !ua.IsDeleted
				select ua.Id
			).FirstOrDefaultAsync(cancellationToken);

			if (accountId is not Guid memberAccountId) {
				continue;
			}

			var exists = await dbContext.UserAccountRole.AnyAsync(
				uap => uap.UserAccountId == memberAccountId && uap.RoleId == tenantRoleId,
				cancellationToken);
			if (!exists) {
				await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
					UserAccountId = memberAccountId,
					RoleId = tenantRoleId
				}, cancellationToken);
			}
		}

		await dbContext.SaveChangesAsync(cancellationToken);
	}
}
