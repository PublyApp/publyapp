using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;
namespace PublyApp.Api.Modules.Invitations.Services;

public record FindTenantInvitationsFilters {
	public string? Search { get; init; }
	public IReadOnlySet<InvitationEffectiveStatus>? Status { get; init; }
	public IReadOnlySet<AccountLevel>? Level { get; init; }
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
	string TenantName,
	List<Guid> ProfileIds,
	AccountLevel AccountLevel,
	Guid InvitedByUserId
);

public abstract record CreateTenantInvitationResult {
	public sealed record Success(
		Invitation Invitation,
		string Token
	) : CreateTenantInvitationResult;

	public sealed record InvalidProfileAssignment(
		string Reason,
		TranslationKey TranslationKey
	) : CreateTenantInvitationResult;
}

public record BulkCreateStaffInvitationsArgs(
	List<BulkStaffInvitationItem> Invitations,
	Guid InvitedByUserId
);

public record BulkCreateTenantInvitationsFailedItem(
	int Index,
	string Email,
	string Reason,
	string TranslationKey
);

public record BulkCreateTenantInvitationsResult(
	int SucceededCount,
	int FailedCount,
	List<BulkCreateTenantInvitationsFailedItem> FailedItems
);

public interface IInvitationService {
	Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		CreateStaffInvitationArgs args,
		CancellationToken cancellationToken = default);

	Task<CreateTenantInvitationResult> CreateTenantInvitationAsync(
		CreateTenantInvitationArgs args,
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

	Task<List<Guid>> ValidateTenantProfilesAsync(
		Guid tenantId,
		List<Guid> profileIds,
		CancellationToken cancellationToken = default);

	// Bulk creation method
	Task<List<(string Email, string Token)>> BulkCreateStaffInvitationsAsync(
		BulkCreateStaffInvitationsArgs args,
		CancellationToken cancellationToken = default);

	Task<List<string>> GetPendingTenantInvitationEmailsAsync(
		List<string> emails,
		Guid tenantId,
		CancellationToken cancellationToken = default);
}

public record InvitationListItem {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required string Scope { get; init; }
	public required string ProfileName { get; init; }
	public required InvitationEffectiveStatus Status { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
	public string? InvitedByName { get; init; }
}

public record StaffTenantInvitationListItem {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required string Scope { get; init; }
	public string? ProfileName { get; init; }
	public required List<StaffInvitationProfileInfo> Profiles { get; init; }
	public required InvitationEffectiveStatus Status { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
	public string? InvitedByName { get; init; }
	public required AccountLevel AccountLevel { get; init; }
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
		CursorPaginatedResult<StaffTenantInvitationListItem> Data
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
	public required InvitationEffectiveStatus Status { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required string InvitedByName { get; init; }
	public required Guid InvitedByUserId { get; init; }
	public required List<StaffInvitationProfileInfo> Profiles { get; init; }
}

[Service(ServiceLifetime.Scoped)]
public class InvitationService : IInvitationService {
	private readonly AppDbContext _dbContext;
	private readonly IJobEnqueuer _jobEnqueuer;
	private readonly ILogger<InvitationService> _logger;

	public InvitationService(
		AppDbContext dbContext,
		IJobEnqueuer jobEnqueuer,
		ILogger<InvitationService> logger
	) {
		_dbContext = dbContext;
		_jobEnqueuer = jobEnqueuer;
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

		// Fold (design §5.4): the invitation and its email job are enqueued in ONE
		// transaction — the invitation is saved first so its store-generated uuidv7 id is
		// available for the job payload, then the enqueue joins the same transaction (its
		// transactional NOTIFY fires at commit). A rolled-back invitation takes its job
		// with it; a committed one always has a durable delivery job.
		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		await _jobEnqueuer.EnqueueAsync(
			InvitationEmailJobs.StaffInvitationV1,
			new StaffInvitationEmailPayload { InvitationId = invitation.GetRequiredId() },
			cancellationToken: cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);

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

	public async Task<CreateTenantInvitationResult> CreateTenantInvitationAsync(
		CreateTenantInvitationArgs args,
		CancellationToken cancellationToken = default
	) {
		var email = args.Email;
		var tenantId = args.TenantId;
		var profileIds = args.ProfileIds;
		var invitedByUserId = args.InvitedByUserId;
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		if (args.AccountLevel == AccountLevel.Admin
			&& profileIds.Count > 0
		) {
			return new CreateTenantInvitationResult.InvalidProfileAssignment(
				"Admin invitees cannot be assigned profiles",
				ResponseKeys.AdminInviteeCannotHaveProfiles
			);
		}

		if (args.AccountLevel == AccountLevel.User
			&& profileIds.Count > maxProfilesPerUser
		) {
			return new CreateTenantInvitationResult.InvalidProfileAssignment(
				$"Cannot assign more than {maxProfilesPerUser} profiles",
				ResponseKeys.TooManyProfilesForInvitee
			);
		}

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
		invitation.AccountLevel = args.AccountLevel;

		invitation.ValidateInvitationType();

		// Fold (design §5.4): invitation + email job enqueued in ONE transaction; the
		// invitation is saved first so its uuidv7 id is available for the job payload.
		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		await _jobEnqueuer.EnqueueAsync(
			InvitationEmailJobs.TenantInvitationV1,
			new TenantInvitationEmailPayload { InvitationId = invitation.GetRequiredId() },
			cancellationToken: cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created tenant invitation for {Email} in tenant {TenantId} with {ProfileCount} profiles by user {InvitedByUserId}",
				email,
				tenantId,
				profileIds.Count,
				invitedByUserId
			);
		}

		return new CreateTenantInvitationResult.Success(invitation, token);
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

	public async Task<List<Guid>> ValidateTenantProfilesAsync(
		Guid tenantId,
		List<Guid> profileIds,
		CancellationToken cancellationToken = default
	) {
		var normalizedProfileIds = profileIds.Distinct().ToList();

		var validProfileIds = await (
			from p in _dbContext.Profile.AsNoTracking()
			where p.Id != null
				&& normalizedProfileIds.Contains(p.Id.Value)
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p.Id ?? Guid.Empty
		).ToListAsync(cancellationToken);

		return validProfileIds;
	}

	public async Task<List<string>> GetPendingTenantInvitationEmailsAsync(
		List<string> emails,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();
		var now = DateTime.UtcNow;

		var existingEmails = await (
			from inv in _dbContext.Invitation.AsNoTracking()
			where normalizedEmails.Contains(inv.Email)
				&& inv.Scope == InvitationScope.Tenant
				&& inv.TenantId == tenantId
				&& inv.Status == InvitationStatus.Pending
				&& inv.ExpiresAt > now
			select inv.Email
		).ToListAsync(cancellationToken);

		return existingEmails;
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
			var newInvitations = new List<Invitation>();

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
				newInvitations.Add(invitation);

				// Collect email and token for sending emails later
				invitationTokens.Add((item.Email, token));
			}

			// Save all invitations first (single INSERT) so their store-generated uuidv7
			// ids are available for the email job payloads.
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Fold (design §5.4): one email job per invitation, all joining THIS
			// transaction (their transactional NOTIFYs fire at commit).
			foreach (var invitation in newInvitations) {
				await _jobEnqueuer.EnqueueAsync(
					InvitationEmailJobs.StaffInvitationV1,
					new StaffInvitationEmailPayload { InvitationId = invitation.GetRequiredId() },
					cancellationToken: cancellationToken
				);
			}

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


}
