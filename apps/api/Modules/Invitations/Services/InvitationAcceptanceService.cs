using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

using UserEntity = PublyApp.Api.Modules.Users.Entities.User;

namespace PublyApp.Api.Modules.Invitations.Services;

public sealed record AcceptStaffInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);

public sealed record AcceptTenantInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);

public interface IInvitationAcceptanceService {
	Task<UserEntity> AcceptStaffInvitationAsync(
		AcceptStaffInvitationArgs args,
		CancellationToken cancellationToken = default);

	Task<UserEntity> AcceptTenantInvitationAsync(
		AcceptTenantInvitationArgs args,
		CancellationToken cancellationToken = default);

	Task<UserEntity> AcceptTenantInvitationForExistingUserAsync(
		Invitation invitation,
		Guid userId,
		CancellationToken cancellationToken = default);

	Task MarkInvitationAsAcceptedAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public sealed class InvitationAcceptanceService : IInvitationAcceptanceService {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<InvitationAcceptanceService> _logger;

	public InvitationAcceptanceService(AppDbContext dbContext, ILogger<InvitationAcceptanceService> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<UserEntity> AcceptStaffInvitationAsync(
		AcceptStaffInvitationArgs args,
		CancellationToken cancellationToken = default
	) {
		var invitation = args.Invitation;
		var firstName = args.FirstName;
		var lastName = args.LastName;
		var passwordHash = args.PasswordHash;
		await using var tx = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			// Create user
			var user = new UserEntity {
				Email = invitation.Email,
				Password = passwordHash,
				FirstName = firstName,
				LastName = lastName,
				Status = UserStatus.Active,
				IsVerified = true
			};
			await _dbContext.User.AddAsync(user, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Create staff account
			var account = UserAccount.CreateStaffAccount(
				user.GetRequiredId(),
				AccountLevel.User
			);
			await _dbContext.UserAccount.AddAsync(account, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Load invitation profiles
			var invitationProfiles = await (
				from ip in _dbContext.InvitationProfile
				where ip.InvitationId == invitation.GetRequiredId()
				select ip
			).ToListAsync(cancellationToken);

			// Assign ALL profiles from the invitation
			foreach (var invitationProfile in invitationProfiles) {
				await _dbContext.UserAccountProfile.AddAsync(
					new UserAccountProfile {
						UserAccountId = account.GetRequiredId(),
						ProfileId = invitationProfile.ProfileId
					},
					cancellationToken
				);
			}

			// Mark invitation as accepted
			invitation.Status = InvitationStatus.Accepted;
			invitation.AcceptedAt = DateTime.UtcNow;
			await InvitationEmailOutbox.CancelPendingForInvitationAsync(
				_dbContext, invitation.GetRequiredId(), cancellationToken
			);
			await _dbContext.SaveChangesAsync(cancellationToken);

			await tx.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Staff invitation accepted: User {UserId} created with {ProfileCount} profiles from invitation {InvitationId}",
					user.GetRequiredId(),
					invitationProfiles.Count,
					invitation.GetRequiredId()
				);
			}

			return user;
		} catch {
			await tx.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task<UserEntity> AcceptTenantInvitationAsync(
		AcceptTenantInvitationArgs args,
		CancellationToken cancellationToken = default
	) {
		var invitation = args.Invitation;
		var firstName = args.FirstName;
		var lastName = args.LastName;
		var passwordHash = args.PasswordHash;
		await using var tx = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			// Validate invitation has TenantId
			if (invitation.TenantId is null) {
				throw new InvalidOperationException(
					$"Tenant invitation {invitation.GetRequiredId()} has no TenantId"
				);
			}

			var tenantId = invitation.TenantId.Value;
			var accountLevel = invitation.AccountLevel ?? AccountLevel.User;

			// Create user
			var user = new UserEntity {
				Email = invitation.Email,
				Password = passwordHash,
				FirstName = firstName,
				LastName = lastName,
				Status = UserStatus.Active,
				IsVerified = true
			};
			await _dbContext.User.AddAsync(user, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Create tenant account
			var account = UserAccount.CreateTenantAccount(
				user.GetRequiredId(),
				tenantId,
				accountLevel
			);
			await _dbContext.UserAccount.AddAsync(account, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Load invitation profiles
			var invitationProfiles = await (
				from ip in _dbContext.InvitationProfile
				where ip.InvitationId == invitation.GetRequiredId()
				select ip
			).ToListAsync(cancellationToken);

			// Assign ALL profiles from the invitation
			foreach (var invitationProfile in invitationProfiles) {
				await _dbContext.UserAccountProfile.AddAsync(
					new UserAccountProfile {
						UserAccountId = account.GetRequiredId(),
						ProfileId = invitationProfile.ProfileId
					},
					cancellationToken
				);
			}

			var tenant = await (
				from t in _dbContext.Tenant
				where t.Id == tenantId && !t.IsDeleted
				select t
			).FirstOrDefaultAsync(cancellationToken);

			if (tenant is null) {
				throw new InvalidOperationException(
					$"Tenant {tenantId} not found for invitation {invitation.GetRequiredId()}"
				);
			}

			if (tenant.IsPending() && !tenant.IsSuspended()) {
				tenant.Status = TenantStatus.Active;
				tenant.UpdatedAt = DateTime.UtcNow;
			}

			// Mark invitation as accepted
			invitation.Status = InvitationStatus.Accepted;
			invitation.AcceptedAt = DateTime.UtcNow;
			await InvitationEmailOutbox.CancelPendingForInvitationAsync(
				_dbContext, invitation.GetRequiredId(), cancellationToken
			);
			await _dbContext.SaveChangesAsync(cancellationToken);

			await tx.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Tenant invitation accepted: User {UserId} created in tenant {TenantId} with AccountLevel {AccountLevel} and {ProfileCount} profiles from invitation {InvitationId}",
					user.GetRequiredId(),
					tenantId,
					accountLevel,
					invitationProfiles.Count,
					invitation.GetRequiredId()
				);
			}

			return user;
		} catch {
			await tx.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task<UserEntity> AcceptTenantInvitationForExistingUserAsync(
		Invitation invitation,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		await using var tx = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			if (invitation.TenantId is null) {
				throw new InvalidOperationException(
					$"Tenant invitation {invitation.GetRequiredId()} has no TenantId"
				);
			}

			// TenantMembershipLockOrder step 1: an invitation can carry Admin level, so this
			// path adds an admin membership to an identity that already exists and could be
			// concurrently guarded by global suspension. Same rationale as the company
			// assignment path. (The new-user acceptance path needs no mutex: it creates the
			// identity in its own transaction, so nothing can be guarding it yet.)
			await TenantMembershipLockOrder.LockUserIdentityRowsAsync(
				_dbContext,
				[userId],
				cancellationToken
			);

			var tenantId = invitation.TenantId.Value;
			var accountLevel = invitation.AccountLevel ?? AccountLevel.User;

			var user = await (
				from u in _dbContext.User
				where u.Id == userId && !u.IsDeleted
				select u
			).FirstOrDefaultAsync(cancellationToken);

			if (user is null) {
				throw new InvalidOperationException(
					$"User {userId} not found for invitation acceptance"
				);
			}

			var hasStaffAccount = await (
				from ua in _dbContext.UserAccount
				where ua.UserId == userId
					&& ua.Scope == AccountScope.Staff
					&& !ua.IsDeleted
				select ua
			).AnyAsync(cancellationToken);

			if (hasStaffAccount) {
				throw new InvalidOperationException(
					"Staff and tenant/project accounts are mutually exclusive"
				);
			}

			var existingTenantAccount = await (
				from ua in _dbContext.UserAccount
				where ua.UserId == userId
					&& ua.TenantId == tenantId
					&& ua.Scope == AccountScope.Tenant
					&& !ua.IsDeleted
				select ua
			).FirstOrDefaultAsync(cancellationToken);

			if (existingTenantAccount is not null) {
				throw new InvalidOperationException(
					"User is already member of tenant"
				);
			}

			var account = UserAccount.CreateTenantAccount(
				userId,
				tenantId,
				accountLevel
			);
			var addedAccount = await _dbContext.UserAccount.AddAsync(account, cancellationToken);

			try {
				await _dbContext.SaveChangesAsync(cancellationToken);
			} catch (DbUpdateException ex) when (IsUserAccountUniqueViolation(ex)) {
				// Race condition: a concurrent request accepted the same tenant
				// invitation between our existence check and this insert. The
				// database-enforced membership invariant (ux_user_accounts_tenant_active)
				// rejected the duplicate row; treat this as the same
				// already-member outcome the synchronous check above returns.
				_dbContext.Entry(addedAccount.Entity).State = EntityState.Detached;
				throw new InvalidOperationException("User is already member of tenant");
			}

			var invitationProfiles = await (
				from ip in _dbContext.InvitationProfile
				where ip.InvitationId == invitation.GetRequiredId()
				select ip
			).ToListAsync(cancellationToken);

			foreach (var invitationProfile in invitationProfiles) {
				await _dbContext.UserAccountProfile.AddAsync(
					new UserAccountProfile {
						UserAccountId = account.GetRequiredId(),
						ProfileId = invitationProfile.ProfileId
					},
					cancellationToken
				);
			}

			var tenant = await (
				from t in _dbContext.Tenant
				where t.Id == tenantId && !t.IsDeleted
				select t
			).FirstOrDefaultAsync(cancellationToken);

			if (tenant is null) {
				throw new InvalidOperationException(
					$"Tenant {tenantId} not found for invitation {invitation.GetRequiredId()}"
				);
			}

			if (tenant.IsPending() && !tenant.IsSuspended()) {
				tenant.Status = TenantStatus.Active;
				tenant.UpdatedAt = DateTime.UtcNow;
			}

			invitation.Status = InvitationStatus.Accepted;
			invitation.AcceptedAt = DateTime.UtcNow;
			await InvitationEmailOutbox.CancelPendingForInvitationAsync(
				_dbContext, invitation.GetRequiredId(), cancellationToken
			);
			await _dbContext.SaveChangesAsync(cancellationToken);

			await tx.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Tenant invitation accepted by existing user {UserId} in tenant {TenantId} with AccountLevel {AccountLevel} and {ProfileCount} profiles from invitation {InvitationId}",
					userId,
					tenantId,
					accountLevel,
					invitationProfiles.Count,
					invitation.GetRequiredId()
				);
			}

			return user;
		} catch {
			await tx.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task MarkInvitationAsAcceptedAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		var invitation = await _dbContext.Invitation
			.FindAsync([invitationId], cancellationToken);

		if (invitation is null) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Attempt to mark non-existent invitation {InvitationId} as accepted",
					invitationId
				);
			}
			return;
		}

		if (invitation.IsAccepted()) {
			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Invitation {InvitationId} is already accepted; no-op",
					invitationId
				);
			}
			return;
		}

		invitation.Status = InvitationStatus.Accepted;
		invitation.AcceptedAt = DateTime.UtcNow;

		await InvitationEmailOutbox.CancelPendingForInvitationAsync(
			_dbContext, invitationId, cancellationToken
		);

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Marked invitation {InvitationId} as accepted", invitationId);
		}
	}

	/// <summary>
	/// Detects unique constraint violations on user_accounts table.
	/// PostgreSQL error code 23505 = unique_violation.
	/// Checks table name to avoid masking unrelated unique violations.
	/// </summary>
	private static bool IsUserAccountUniqueViolation(DbUpdateException ex) {
		if (ex.InnerException is Npgsql.PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals("user_accounts", StringComparison.OrdinalIgnoreCase);
		}
		return false;
	}
}
