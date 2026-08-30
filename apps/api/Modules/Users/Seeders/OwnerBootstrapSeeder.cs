using System.Data;

using Microsoft.EntityFrameworkCore;

using Npgsql;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Seeders;

/// <summary>
/// Seeds the platform owner through STAFF_OWNER_* so production has an initial admin identity
/// without any demo tenants or fixtures.
/// </summary>
public class OwnerBootstrapSeeder : IEntitySeeder {
	private static readonly Lazy<string> CachedSeedPassword = new(
		() => PasswordUtils.HashPassword(AppEnvironment.Instance.STAFF_OWNER_BOOTSTRAP_CODE),
		LazyThreadSafetyMode.ExecutionAndPublication
	);

	private readonly ILogger<OwnerBootstrapSeeder> _logger;

	public OwnerBootstrapSeeder(ILogger<OwnerBootstrapSeeder>? logger = null) {
		_logger = logger
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
			_logger.LogWarning(
				"Owner bootstrap skipped; STAFF_OWNER_EMAIL is not configured."
			);
			return;
		}

		var normalizedOwnerEmail = ownerEmail.Trim().ToLowerInvariant();
		var seedPassword = CachedSeedPassword.Value;

		var ownerUserId = await EnsureOwnerUserAsync(
			dbContext,
			normalizedOwnerEmail,
			seedPassword,
			cancellationToken
		);

		await EnsureOwnerStaffAccountAsync(dbContext, ownerUserId, cancellationToken);
	}

	private async Task<Guid> EnsureOwnerUserAsync(
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
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded staff owner user.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogWarning(ex, "Duplicate owner user detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			try {
				await dbContext.User.AddAsync(owner, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded staff owner user.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				_logger.LogWarning(ex, "Duplicate owner user detected during seeding; skipping insert.");
			}
		}

		var reloadedOwner = await (
			from u in dbContext.User
			where u.Email == ownerEmail
			select u
		).SingleAsync(cancellationToken);
		return reloadedOwner.GetRequiredId();
	}

	private async Task EnsureOwnerStaffAccountAsync(
		AppDbContext dbContext,
		Guid ownerUserId,
		CancellationToken cancellationToken
	) {
		var existingOwnerStaffAccount = await (
			from ua in dbContext.UserAccount
			where ua.UserId == ownerUserId
				&& ua.Scope == AccountScope.Staff
			select ua
		).AnyAsync(cancellationToken);

		if (existingOwnerStaffAccount) {
			return;
		}

		var ownerAccount = UserAccount.CreateStaffAccount(ownerUserId, AccountLevel.Admin);
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
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded staff owner account.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogWarning(ex, "Duplicate owner staff account detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			try {
				await dbContext.UserAccount.AddAsync(ownerAccount, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded staff owner account.");
				}
			} catch (DbUpdateException ex) when (
				ex.InnerException is PostgresException pgEx
				&& pgEx.SqlState == "23505"
			) {
				_logger.LogWarning(ex, "Duplicate owner staff account detected during seeding; skipping insert.");
			}
		}
	}
}
