using System.Data;

using Microsoft.EntityFrameworkCore;

using Npgsql;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Seeders;

/// <summary>
/// Seeds the platform owner through STAFF_OWNER_* so production has an initial admin identity
/// without any demo tenants or fixtures.
/// </summary>
public class OwnerBootstrapSeeder : IEntitySeeder {
	private static readonly Lazy<string> _CachedSeedPassword = new(
		() => PasswordUtils.HashPassword(AppEnvironment.Instance.STAFF_OWNER_BOOTSTRAP_CODE),
		LazyThreadSafetyMode.ExecutionAndPublication
	);

	private readonly ILogger<OwnerBootstrapSeeder> _Logger;

	public OwnerBootstrapSeeder(ILogger<OwnerBootstrapSeeder>? logger = null) {
		this._Logger = logger
			?? SeederLoggerUtils.CreateDefault<OwnerBootstrapSeeder>();
	}

	public int Order {
		get {
			return 25;
		}
	}

	public bool IsDemo {
		get {
			return false;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		var ownerEmail = AppEnvironment.Instance.STAFF_OWNER_EMAIL;
		if (string.IsNullOrWhiteSpace(ownerEmail)) {
			this._Logger.LogWarning(
				"Owner bootstrap skipped; STAFF_OWNER_EMAIL is not configured."
			);
			return;
		}

		var normalizedOwnerEmail = ownerEmail.Trim().ToLowerInvariant();
		var seedPassword = OwnerBootstrapSeeder._CachedSeedPassword.Value;

		var ownerUserId = await this._EnsureOwnerUserAsync(
			dbContext,
			normalizedOwnerEmail,
			seedPassword,
			cancellationToken
		);

		var ownerAccountId = await this._EnsureOwnerStaffAccountAsync(dbContext, ownerUserId, cancellationToken);
		await OwnerBootstrapSeeder._EnsureFullAccessAssignmentAsync(
			dbContext, ownerAccountId, cancellationToken
		);
	}

	private async Task<Guid> _EnsureOwnerUserAsync(
		AppDbContext dbContext,
		string ownerEmail,
		string seedPassword,
		CancellationToken cancellationToken
	) {
		var existingOwner = await (
			from u in dbContext.User
			where u.Email == ownerEmail
			select u
		).FirstOrDefaultAsync(cancellationToken);

		if (existingOwner is not null) {
			return existingOwner.GetRequiredId();
		}

		var owner = new User {
			Email = ownerEmail,
			Password = seedPassword,
			Status = UserStatus.Active,
			FirstName = "Platform",
			LastName = "Owner",
			IsVerified = true
		};

		// Check if already in a transaction (e.g., during migrations)
		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(
				IsolationLevel.Serializable,
				cancellationToken
			);
			try {
				await dbContext.User.AddAsync(owner, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded staff owner user.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				await transaction.RollbackAsync(cancellationToken);
				this._Logger.LogWarning(ex, "Duplicate owner user detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			try {
				await dbContext.User.AddAsync(owner, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded staff owner user.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				this._Logger.LogWarning(ex, "Duplicate owner user detected during seeding; skipping insert.");
			}
		}

		var reloadedOwner = await (
			from u in dbContext.User
			where u.Email == ownerEmail
			select u
		).SingleAsync(cancellationToken);
		return reloadedOwner.GetRequiredId();
	}

	private async Task<Guid> _EnsureOwnerStaffAccountAsync(
		AppDbContext dbContext,
		Guid ownerUserId,
		CancellationToken cancellationToken
	) {
		var existingOwnerStaffAccount = await (
			from ua in dbContext.UserAccount
			where ua.UserId == ownerUserId
				&& ua.Scope == AccountScope.Staff
			select ua.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (existingOwnerStaffAccount is Guid existingAccountId) {
			return existingAccountId;
		}

		var ownerAccount = UserAccount.CreateStaffAccount(ownerUserId);
		ownerAccount.ValidateAccountType();

		// Check if already in a transaction (e.g., during migrations)
		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(
				IsolationLevel.Serializable,
				cancellationToken
			);
			try {
				await dbContext.UserAccount.AddAsync(ownerAccount, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded staff owner account.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				await transaction.RollbackAsync(cancellationToken);
				this._Logger.LogWarning(ex, "Duplicate owner staff account detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			try {
				await dbContext.UserAccount.AddAsync(ownerAccount, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded staff owner account.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				this._Logger.LogWarning(ex, "Duplicate owner staff account detected during seeding; skipping insert.");
			}
		}

		var persistedOwnerAccount = await (
			from ua in dbContext.UserAccount
			where ua.UserId == ownerUserId && ua.Scope == AccountScope.Staff
			select ua.Id
		).FirstAsync(cancellationToken);
		if (persistedOwnerAccount is not Guid ownerAccountId) {
			throw new InvalidOperationException("Owner staff account missing after seed");
		}
		return ownerAccountId;
	}

	private static async Task _EnsureFullAccessAssignmentAsync(
		AppDbContext dbContext,
		Guid accountId,
		CancellationToken cancellationToken
	) {
		var role = await (
			from p in dbContext.Role
			where p.Scope == RoleScope.Staff
				&& p.Name == SystemRoleNames.StaffFullAccess
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			role = Role.CreateStaffRole(
				SystemRoleNames.StaffFullAccess,
				"Platform owner with full system access",
				isFullAccess: true
			);
			await dbContext.Role.AddAsync(role, cancellationToken);
			await dbContext.SaveChangesAsync(cancellationToken);
		}

		var linkExists = await dbContext.UserAccountRole
			.AnyAsync(uap => uap.UserAccountId == accountId && uap.RoleId == role.Id, cancellationToken);
		if (!linkExists && role.Id is Guid roleId) {
			await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
				UserAccountId = accountId,
				RoleId = roleId
			}, cancellationToken);
			await dbContext.SaveChangesAsync(cancellationToken);
		}
	}
}
