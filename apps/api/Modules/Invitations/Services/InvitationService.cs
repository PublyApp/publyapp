using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using UserEntity = PublyApp.Api.Modules.Users.Entities.User;

namespace PublyApp.Api.Modules.Invitations.Services;

public record FindTenantInvitationsFilters {
	public string? Search { get; init; }
	public IReadOnlySet<InvitationEffectiveStatus>? Status { get; init; }
}
public record FindTenantInvitationsArgs {
	public Guid Cursor { get; init; }
	public int? Limit { get; init; }
	public string? SortId { get; init; }
	public SortOrder SortOrder { get; init; }
	public FindTenantInvitationsFilters Filters { get; init; } = new();
}

public record FindStaffInvitationsArgs {
	public Guid Cursor { get; init; }
	public int? Limit { get; init; }
	public string? SortId { get; init; }
	public SortOrder? SortOrder { get; init; }
	public IReadOnlySet<InvitationEffectiveStatus>? Statuses { get; init; }
}

public record CreateStaffInvitationArgs(
	string Email,
	List<Guid> ProfileIds,
	Guid InvitedByUserId
);

public record CreateTenantInvitationArgs(
	string Email,
	Guid TenantId,
	List<Guid> ProfileIds,
	Guid InvitedByUserId
);

public record AcceptStaffInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);

public record AcceptTenantInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);

public record BulkCreateStaffInvitationsArgs(
	List<BulkStaffInvitationItem> Invitations,
	Guid InvitedByUserId
);

public interface IInvitationService {
	Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		CreateStaffInvitationArgs args,
		CancellationToken cancellationToken = default);

	Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
		CreateTenantInvitationArgs args,
		CancellationToken cancellationToken = default);

	Task<RevokeInvitationForStaffResult> RevokeInvitationForStaffAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<BulkStaffInvitationActionResult> BulkRevokeStaffInvitationsAsync(
		IReadOnlyCollection<Guid> invitationIds,
		CancellationToken cancellationToken = default);

	Task<RevokeInvitationForTenantAsStaffResult> RevokeInvitationForTenantAsStaffAsync(
		Guid tenantId,
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<Profile?> GetStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default);

	Task<bool> UserExistsAsync(
		string email,
		CancellationToken cancellationToken = default);

	Task<bool> PendingInvitationExistsAsync(
		string email,
		InvitationScope scope,
		CancellationToken cancellationToken = default);

	Task<bool> PendingTenantInvitationExistsAsync(
		string email,
		Guid tenantId,
		CancellationToken cancellationToken = default);

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

	// Batch validation methods for bulk operations
	Task<List<string>> GetExistingUserEmailsAsync(
		List<string> emails,
		CancellationToken cancellationToken = default);

	Task<List<string>> GetPendingInvitationEmailsAsync(
		List<string> emails,
		InvitationScope scope,
		CancellationToken cancellationToken = default);

	Task<List<Guid>> ValidateStaffProfilesAsync(
		List<Guid> profileIds,
		CancellationToken cancellationToken = default);

	// Bulk creation method
	Task<List<(string Email, string Token)>> BulkCreateStaffInvitationsAsync(
		BulkCreateStaffInvitationsArgs args,
		CancellationToken cancellationToken = default);

	Task MarkInvitationAsAcceptedAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);
}

public record InvitationListItem {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required string Scope { get; init; }
	public required string ProfileName { get; init; }
	public required string Status { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
	public string? InvitedByName { get; init; }
}

public abstract record FindStaffInvitationsResult {
	public sealed record Success(
		CursorPaginatedResult<InvitationListItem> Data
	) : FindStaffInvitationsResult;

	public sealed record CursorNotFound(string Cursor) : FindStaffInvitationsResult;

	public sealed record InvalidSortId(string SortId) : FindStaffInvitationsResult;
}

public abstract record FindTenantInvitationsResult {
	public sealed record Success(
		CursorPaginatedResult<InvitationListItem> Data
	) : FindTenantInvitationsResult;

	public sealed record CursorNotFound(string Cursor) : FindTenantInvitationsResult;

	public sealed record InvalidSortId(string SortId) : FindTenantInvitationsResult;
}

public record BulkStaffInvitationItem {
	public required string Email { get; init; }
	public required List<Guid> ProfileIds { get; init; }
}

public record StaffInvitationProfileInfo {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
}

public record StaffInvitationDetailsResult {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public DateTime? RevokedAt { get; init; }
	public required string Status { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required string InvitedByName { get; init; }
	public required Guid InvitedByUserId { get; init; }
	public required List<StaffInvitationProfileInfo> Profiles { get; init; }
}

public abstract record RevokeInvitationForStaffResult {
	public sealed record Success : RevokeInvitationForStaffResult;

	public sealed record NotFound : RevokeInvitationForStaffResult;

	public sealed record AlreadyAccepted : RevokeInvitationForStaffResult;
}

public static class BulkStaffInvitationActionFailureReasons {
	public const string NotFound = "not_found";
	public const string AlreadyAccepted = "already_accepted";
}

public record BulkStaffInvitationActionFailedItem(
	Guid InvitationId,
	string Reason
);

public record BulkStaffInvitationActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffInvitationActionFailedItem> FailedItems
);

public abstract record RevokeInvitationForTenantAsStaffResult {
	public sealed record Success : RevokeInvitationForTenantAsStaffResult;

	public sealed record NotFound : RevokeInvitationForTenantAsStaffResult;

	public sealed record AlreadyAccepted : RevokeInvitationForTenantAsStaffResult;
}

[Service(ServiceLifetime.Scoped)]
public class InvitationService : IInvitationService {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<InvitationService> _logger;

	public InvitationService(
		AppDbContext dbContext,
		ILogger<InvitationService> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		CreateStaffInvitationArgs args,
		CancellationToken cancellationToken = default
	) {
		var email = args.Email;
		var profileIds = args.ProfileIds;
		var invitedByUserId = args.InvitedByUserId;
		var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateStaffInvitationWithProfiles(
			email,
			profileIds,
			invitedByUserId,
			expiresAt,
			token
		);

		invitation.ValidateInvitationType();

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created staff invitation for {Email} with {ProfileCount} profiles by user {InvitedByUserId}",
				email,
				profileIds.Count,
				invitedByUserId
			);
		}

		return (invitation, token);
	}

	public async Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
		CreateTenantInvitationArgs args,
		CancellationToken cancellationToken = default
	) {
		var email = args.Email;
		var tenantId = args.TenantId;
		var profileIds = args.ProfileIds;
		var invitedByUserId = args.InvitedByUserId;
		var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateTenantInvitationWithProfiles(
			email,
			tenantId,
			profileIds,
			invitedByUserId,
			expiresAt,
			token
		);

		invitation.ValidateInvitationType();

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created tenant invitation for {Email} in tenant {TenantId} with {ProfileCount} profiles by user {InvitedByUserId}",
				email,
				tenantId,
				profileIds.Count,
				invitedByUserId
			);
		}

		return (invitation, token);
	}

	public async Task<RevokeInvitationForStaffResult> RevokeInvitationForStaffAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		Invitation? invitation = await _dbContext.Invitation
			.Where(inv => inv.Id == invitationId && inv.Scope == InvitationScope.Staff)
			.FirstOrDefaultAsync(cancellationToken);

		return await RevokeInvitationInternalAsync(
			invitation,
			invitationId,
			cancellationToken
		);
	}

	// Bulk path is hand-rolled (one SELECT + tracker mutations + one SaveChanges)
	// rather than looping RevokeInvitationForStaffAsync because the per-item
	// method round-trips the DB once per id. Keep classification logic in sync
	// with RevokeInvitationInternalAsync; if revoke ever grows side effects
	// (email, webhook, audit log), they must be replayed here too — they are
	// currently invoked at the handler layer instead.
	public async Task<BulkStaffInvitationActionResult> BulkRevokeStaffInvitationsAsync(
		IReadOnlyCollection<Guid> invitationIds,
		CancellationToken cancellationToken = default
	) {
		var requestedInvitationIds = invitationIds.Distinct().ToList();
		if (requestedInvitationIds.Count == 0) {
			return new BulkStaffInvitationActionResult(0, 0, []);
		}

		// 1 SELECT for all candidates, scope-filtered. Mirrors the per-item
		// RevokeInvitationForStaffAsync read predicate.
		var rows = await _dbContext.Invitation
			.Where(inv =>
				inv.Id != null
				&& requestedInvitationIds.Contains(inv.Id.Value)
				&& inv.Scope == InvitationScope.Staff
			)
			.ToListAsync(cancellationToken);

		var foundById = rows.ToDictionary(inv => inv.GetRequiredId());
		var failedItems = new List<BulkStaffInvitationActionFailedItem>();
		var succeededCount = 0;
		var now = DateTime.UtcNow;

		// Iterate over the requested ids (not over rows) so missing ids surface
		// as NotFound and the failed-items list preserves the requested order.
		foreach (var invitationId in requestedInvitationIds) {
			if (!foundById.TryGetValue(invitationId, out var invitation)) {
				failedItems.Add(new BulkStaffInvitationActionFailedItem(
					invitationId,
					BulkStaffInvitationActionFailureReasons.NotFound
				));
				continue;
			}

			// Mirror RevokeInvitationInternalAsync classification:
			// already-revoked is a success no-op; accepted is a hard failure.
			if (invitation.IsRevoked()) {
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation(
						"Invitation {InvitationId} is already revoked; no-op",
						invitationId
					);
				}
				succeededCount++;
				continue;
			}

			if (invitation.IsAccepted()) {
				if (_logger.IsEnabled(LogLevel.Warning)) {
					_logger.LogWarning(
						"Attempt to revoke accepted invitation {InvitationId} blocked",
						invitationId
					);
				}
				failedItems.Add(new BulkStaffInvitationActionFailedItem(
					invitationId,
					BulkStaffInvitationActionFailureReasons.AlreadyAccepted
				));
				continue;
			}

			// Mutate via the EF tracker; one SaveChanges flushes them all.
			invitation.Status = InvitationStatus.Revoked;
			invitation.RevokedAt = now;
			succeededCount++;

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
			}
		}

		// 1 SaveChanges for all updates.
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new BulkStaffInvitationActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<RevokeInvitationForTenantAsStaffResult> RevokeInvitationForTenantAsStaffAsync(
		Guid tenantId,
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		Invitation? invitation = await _dbContext.Invitation
			.Where(inv =>
				inv.Id == invitationId
				&& inv.Scope == InvitationScope.Tenant
				&& inv.TenantId == tenantId
			)
			.FirstOrDefaultAsync(cancellationToken);

		RevokeInvitationForStaffResult result = await RevokeInvitationInternalAsync(
			invitation,
			invitationId,
			cancellationToken
		);

		return result switch {
			RevokeInvitationForStaffResult.Success =>
				new RevokeInvitationForTenantAsStaffResult.Success(),
			RevokeInvitationForStaffResult.AlreadyAccepted =>
				new RevokeInvitationForTenantAsStaffResult.AlreadyAccepted(),
			_ => new RevokeInvitationForTenantAsStaffResult.NotFound()
		};
	}

	public async Task<Profile?> GetStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		var profileQuery =
			from p in _dbContext.Profile
			where p.Id == profileId && p.Scope == ProfileScope.Staff
			select p;

		return await profileQuery.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<bool> UserExistsAsync(
		string email,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.ToLowerInvariant();
		var userQuery =
			from u in _dbContext.User
			where u.Email == normalizedEmail
			select u;

		return await userQuery.AnyAsync(cancellationToken);
	}

	public async Task<bool> PendingInvitationExistsAsync(
		string email,
		InvitationScope scope,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.ToLowerInvariant();
		var invitationQuery =
			from inv in _dbContext.Invitation
			where inv.Email == normalizedEmail
				&& inv.Scope == scope
				&& inv.Status == InvitationStatus.Pending
				&& inv.ExpiresAt > DateTime.UtcNow
			select inv;

		return await invitationQuery.AnyAsync(cancellationToken);
	}

	public async Task<bool> PendingTenantInvitationExistsAsync(
		string email,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.ToLowerInvariant();
		var invitationQuery =
			from inv in _dbContext.Invitation
			where inv.Email == normalizedEmail
				&& inv.Scope == InvitationScope.Tenant
				&& inv.TenantId == tenantId
				&& inv.Status == InvitationStatus.Pending
				&& inv.ExpiresAt > DateTime.UtcNow
			select inv;

		return await invitationQuery.AnyAsync(cancellationToken);
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
			await _dbContext.UserAccount.AddAsync(account, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

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

	public async Task<List<string>> GetExistingUserEmailsAsync(
		List<string> emails,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();

		var existingEmails = await (
			from u in _dbContext.User.AsNoTracking()
			where normalizedEmails.Contains(u.Email)
			select u.Email
		).ToListAsync(cancellationToken);

		return existingEmails;
	}

	public async Task<List<string>> GetPendingInvitationEmailsAsync(
		List<string> emails,
		InvitationScope scope,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();

		var existingEmails = await (
			from inv in _dbContext.Invitation.AsNoTracking()
			where normalizedEmails.Contains(inv.Email)
				&& inv.Scope == scope
				&& inv.Status == InvitationStatus.Pending
				&& inv.ExpiresAt > DateTime.UtcNow
			select inv.Email
		).ToListAsync(cancellationToken);

		return existingEmails;
	}

	public async Task<List<Guid>> ValidateStaffProfilesAsync(
		List<Guid> profileIds,
		CancellationToken cancellationToken = default
	) {
		var validProfileIds = await (
			from p in _dbContext.Profile.AsNoTracking()
			where p.Id != null
				&& profileIds.Contains(p.Id.Value)
				&& p.Scope == ProfileScope.Staff
			select p.Id ?? Guid.Empty
		).ToListAsync(cancellationToken);

		return validProfileIds;
	}

	public async Task<List<(string Email, string Token)>> BulkCreateStaffInvitationsAsync(
		BulkCreateStaffInvitationsArgs args,
		CancellationToken cancellationToken = default
	) {
		var invitations = args.Invitations;
		var invitedByUserId = args.InvitedByUserId;
		await using var tx = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			var expiresAt = DateTime.UtcNow.AddDays(7);
			var invitationTokens = new List<(string Email, string Token)>();

			foreach (var item in invitations) {
				// Generate unique token per invitation (one per email)
				var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);

				// Use factory to create invitation with multiple profiles
				var invitation = Invitation.CreateStaffInvitationWithProfiles(
					item.Email,
					item.ProfileIds,
					invitedByUserId,
					expiresAt,
					token
				);

				// Validate invitation type
				invitation.ValidateInvitationType();

				// Add invitation (EF Core will also track the InvitationProfile junction records)
				_dbContext.Invitation.Add(invitation);

				// Collect email and token for sending emails later
				invitationTokens.Add((item.Email, token));
			}

			// Save all changes (single database INSERT with multiple rows)
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Commit transaction
			await tx.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Created {Count} staff invitations in bulk by user {InvitedByUserId}",
					invitationTokens.Count,
					invitedByUserId
				);
			}

			return invitationTokens;
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

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Marked invitation {InvitationId} as accepted", invitationId);
		}
	}

	private async Task<RevokeInvitationForStaffResult> RevokeInvitationInternalAsync(
		Invitation? invitation,
		Guid invitationId,
		CancellationToken cancellationToken
	) {
		if (invitation is null) {
			return new RevokeInvitationForStaffResult.NotFound();
		}

		if (invitation.IsRevoked()) {
			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Invitation {InvitationId} is already revoked; no-op",
					invitationId
				);
			}
			return new RevokeInvitationForStaffResult.Success();
		}

		if (invitation.IsAccepted()) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Attempt to revoke accepted invitation {InvitationId} blocked",
					invitationId
				);
			}
			return new RevokeInvitationForStaffResult.AlreadyAccepted();
		}

		invitation.Status = InvitationStatus.Revoked;
		invitation.RevokedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
		}

		return new RevokeInvitationForStaffResult.Success();
	}
}
