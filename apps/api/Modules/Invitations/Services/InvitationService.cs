using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Roles.Services;

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
	public string? Search { get; init; }
	// Invitations holding ANY of these roles (by id); null = no role filter.
	public IReadOnlySet<Guid>? RoleIds { get; init; }
}

public record CreateStaffInvitationArgs(
	string Email,
	List<Guid> RoleIds,
	Guid InvitedByUserId
);

public record CreateTenantInvitationArgs(
	string Email,
	Guid TenantId,
	string TenantName,
	List<Guid> RoleIds,
	Guid InvitedByUserId
);

public abstract record CreateTenantInvitationResult {
	public sealed record Success(
		Invitation Invitation,
		string Token
	) : CreateTenantInvitationResult;

	public sealed record InvalidRoleAssignment(
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

	Task<Role?> GetStaffRoleAsync(
		Guid roleId,
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

	Task<List<Guid>> ValidateStaffRolesAsync(
		List<Guid> roleIds,
		CancellationToken cancellationToken = default);

	Task<List<Guid>> ValidateTenantRolesAsync(
		Guid tenantId,
		List<Guid> roleIds,
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
	public required string RoleName { get; init; }
	// The same roles as RoleName, one entry each (a role name may itself hold a comma).
	public List<string> RoleNames { get; init; } = [];
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
	public string? RoleName { get; init; }
	public required List<StaffInvitationRoleInfo> Roles { get; init; }
	public required InvitationEffectiveStatus Status { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
	public string? InvitedByName { get; init; }
}

public sealed record StaffInvitationCounts(
	int Total,
	int Pending,
	int Accepted,
	int Expired,
	int Revoked,
	int ExpiringSoon,
	IReadOnlyList<StaffRoleCount> RoleCounts
);

public abstract record FindStaffInvitationsResult {
	public sealed record Success(
		CursorPaginatedResult<InvitationListItem> Data,
		StaffInvitationCounts Counts
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
	public required List<Guid> RoleIds { get; init; }
}

public record StaffInvitationRoleInfo {
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
	public required List<StaffInvitationRoleInfo> Roles { get; init; }
}

[Service(ServiceLifetime.Scoped)]
public class InvitationService : IInvitationService {
	private readonly AppDbContext _DbContext;
	private readonly IJobEnqueuer _JobEnqueuer;
	private readonly ILogger<InvitationService> _Logger;

	public InvitationService(
		AppDbContext dbContext,
		IJobEnqueuer jobEnqueuer,
		ILogger<InvitationService> logger
	) {
		this._DbContext = dbContext;
		this._JobEnqueuer = jobEnqueuer;
		this._Logger = logger;
	}

	public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		CreateStaffInvitationArgs args,
		CancellationToken cancellationToken = default
	) {
		var email = args.Email;
		var roleIds = args.RoleIds;
		var invitedByUserId = args.InvitedByUserId;
		var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateStaffInvitationWithRoles(
			email,
			roleIds,
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
			await this._DbContext.Database.BeginTransactionAsync(cancellationToken);

		await this._DbContext.Invitation.AddAsync(invitation, cancellationToken);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		await this._JobEnqueuer.EnqueueAsync(
			InvitationEmailJobs.StaffInvitationV1,
			new StaffInvitationEmailPayload { InvitationId = invitation.GetRequiredId() },
			cancellationToken: cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Created staff invitation for {Email} with {RoleCount} roles by user {InvitedByUserId}",
				email,
				roleIds.Count,
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
		var roleIds = args.RoleIds;
		var invitedByUserId = args.InvitedByUserId;
		var maxRolesPerUser = AppEnvironment.Instance.MAX_ROLES_PER_USER;

		// Every invitee is now described purely by the roles (roles) they receive.
		// There is no admin flag to exempt: the full-access system role is one of the
		// roles and is protected by the caller-side escalation guard.
		if (roleIds.Count > maxRolesPerUser) {
			return new CreateTenantInvitationResult.InvalidRoleAssignment(
				$"Cannot assign more than {maxRolesPerUser} roles",
				ResponseKeys.TooManyRolesForInvitee
			);
		}

		var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateTenantInvitationWithRoles(
			email,
			tenantId,
			roleIds,
			invitedByUserId,
			expiresAt,
			token
		);
		invitation.ValidateInvitationType();

		// Fold (design §5.4): invitation + email job enqueued in ONE transaction; the
		// invitation is saved first so its uuidv7 id is available for the job payload.
		await using var transaction =
			await this._DbContext.Database.BeginTransactionAsync(cancellationToken);

		await this._DbContext.Invitation.AddAsync(invitation, cancellationToken);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		await this._JobEnqueuer.EnqueueAsync(
			InvitationEmailJobs.TenantInvitationV1,
			new TenantInvitationEmailPayload { InvitationId = invitation.GetRequiredId() },
			cancellationToken: cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Created tenant invitation for {Email} in tenant {TenantId} with {RoleCount} roles by user {InvitedByUserId}",
				email,
				tenantId,
				roleIds.Count,
				invitedByUserId
			);
		}

		return new CreateTenantInvitationResult.Success(invitation, token);
	}

	public async Task<Role?> GetStaffRoleAsync(
		Guid roleId,
		CancellationToken cancellationToken = default
	) {
		var roleQuery =
			from p in this._DbContext.Role
			where p.Id == roleId && p.Scope == RoleScope.Staff
			select p;

		return await roleQuery.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<bool> UserExistsAsync(
		string email,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.ToLowerInvariant();
		var userQuery =
			from u in this._DbContext.User
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
			from inv in this._DbContext.Invitation
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
			from inv in this._DbContext.Invitation
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
			from u in this._DbContext.User.AsNoTracking()
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
			from inv in this._DbContext.Invitation.AsNoTracking()
			where normalizedEmails.Contains(inv.Email)
				&& inv.Scope == scope
				&& inv.Status == InvitationStatus.Pending
				&& inv.ExpiresAt > DateTime.UtcNow
			select inv.Email
		).ToListAsync(cancellationToken);

		return existingEmails;
	}

	public async Task<List<Guid>> ValidateStaffRolesAsync(
		List<Guid> roleIds,
		CancellationToken cancellationToken = default
	) {
		var validRoleIds = await (
			from p in this._DbContext.Role.AsNoTracking()
			where p.Id != null
				&& roleIds.Contains(p.Id.Value)
				&& p.Scope == RoleScope.Staff
			select p.Id ?? Guid.Empty
		).ToListAsync(cancellationToken);

		return validRoleIds;
	}

	public async Task<List<Guid>> ValidateTenantRolesAsync(
		Guid tenantId,
		List<Guid> roleIds,
		CancellationToken cancellationToken = default
	) {
		var normalizedRoleIds = roleIds.Distinct().ToList();

		var validRoleIds = await (
			from p in this._DbContext.Role.AsNoTracking()
			where p.Id != null
				&& normalizedRoleIds.Contains(p.Id.Value)
				&& p.Scope == RoleScope.Tenant
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p.Id ?? Guid.Empty
		).ToListAsync(cancellationToken);

		return validRoleIds;
	}

	public async Task<List<string>> GetPendingTenantInvitationEmailsAsync(
		List<string> emails,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();
		var now = DateTime.UtcNow;

		var existingEmails = await (
			from inv in this._DbContext.Invitation.AsNoTracking()
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
		await using var tx = await this._DbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			var expiresAt = DateTime.UtcNow.AddDays(7);
			var invitationTokens = new List<(string Email, string Token)>();
			var newInvitations = new List<Invitation>();

			foreach (var item in invitations) {
				// Generate unique token per invitation (one per email)
				var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);

				// Use factory to create invitation with multiple roles
				var invitation = Invitation.CreateStaffInvitationWithRoles(
					item.Email,
					item.RoleIds,
					invitedByUserId,
					expiresAt,
					token
				);

				// Validate invitation type
				invitation.ValidateInvitationType();

				// Add invitation (EF Core will also track the InvitationRole junction records)
				this._DbContext.Invitation.Add(invitation);
				newInvitations.Add(invitation);

				// Collect email and token for sending emails later
				invitationTokens.Add((item.Email, token));
			}

			// Save all invitations first (single INSERT) so their store-generated uuidv7
			// ids are available for the email job payloads.
			await this._DbContext.SaveChangesAsync(cancellationToken);

			// Fold (design §5.4): one email job per invitation, all joining THIS
			// transaction (their transactional NOTIFYs fire at commit).
			foreach (var invitation in newInvitations) {
				await this._JobEnqueuer.EnqueueAsync(
					InvitationEmailJobs.StaffInvitationV1,
					new StaffInvitationEmailPayload { InvitationId = invitation.GetRequiredId() },
					cancellationToken: cancellationToken
				);
			}

			// Commit transaction
			await tx.CommitAsync(cancellationToken);

			if (this._Logger.IsEnabled(LogLevel.Information)) {
				this._Logger.LogInformation(
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
