using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Roles.Jobs;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Roles.Services;

public sealed record UpdateStaffRoleArgs(
	Guid RoleId,
	PatchField<string?> Name,
	PatchField<string?> Description,
	PatchField<string?> Icon,
	PatchField<string?> Tone
);

public abstract record UpdateStaffRoleResult {
	public sealed record Success(StaffRoleItem Role)
		: UpdateStaffRoleResult;
	public sealed record RoleNotFound : UpdateStaffRoleResult;
	public sealed record RoleNameExists(string Name) : UpdateStaffRoleResult;
	public sealed record SystemRoleProtected : UpdateStaffRoleResult;
}

public sealed record SetStaffRolePermissionArgs(
	Guid RoleId,
	string PermissionKey,
	bool IsAssigned
);

public abstract record SetStaffRolePermissionResult {
	public sealed record Success : SetStaffRolePermissionResult;
	public sealed record RoleNotFound : SetStaffRolePermissionResult;
	public sealed record PermissionNotFound : SetStaffRolePermissionResult;
	public sealed record SystemRoleProtected : SetStaffRolePermissionResult;
}

public sealed record CreateStaffRoleArgs(
	string Name,
	string? Description,
	List<string> Permissions,
	List<string> Emails,
	Guid InvitedByUserId,
	string? Icon,
	string? Tone
);

public sealed record BulkDeleteStaffRolesArgs(
	List<Guid> RoleIds
);

public abstract record DeleteStaffRoleServiceResult {
	public sealed record Success(int DeletedRoleCount)
		: DeleteStaffRoleServiceResult;
	public sealed record RoleNotFound : DeleteStaffRoleServiceResult;
	public sealed record SystemRoleProtected : DeleteStaffRoleServiceResult;
}

/// <summary>
/// Discriminated union representing the result of creating a staff role.
/// </summary>
public abstract record CreateStaffRoleResult {
	/// <summary>
	/// Successful result containing the created role and operation statistics.
	/// </summary>
	public sealed record Success(
		Role Role,
		int PermissionsAssigned,
		int UsersAssigned,
		int InvitationsSent,
		List<(string Email, string Token)> InvitationTokens
	) : CreateStaffRoleResult;

	/// <summary>
	/// Error result when a role with the same name already exists.
	/// </summary>
	public sealed record RoleNameExists(string Name) : CreateStaffRoleResult;

	/// <summary>
	/// Error result when one or more permission keys are invalid.
	/// </summary>
	public sealed record InvalidPermissions(List<string> InvalidKeys) : CreateStaffRoleResult;

	/// <summary>
	/// Error result when duplicate emails are provided.
	/// </summary>
	public sealed record DuplicateEmails(List<string> Emails) : CreateStaffRoleResult;

	/// <summary>
	/// Error result when users already have tenant or project accounts.
	/// Staff roles can only be assigned to users without tenant/project accounts.
	/// </summary>
	public sealed record UsersWithConflictingAccounts(List<string> Emails) : CreateStaffRoleResult;

	/// <summary>
	/// Error result when no permissions are provided.
	/// At least one permission is required for staff roles.
	/// </summary>
	public sealed record NoPermissionsProvided : CreateStaffRoleResult;
}

public interface IStaffRoleAsStaffService {
	Task<UpdateStaffRoleResult> UpdateStaffRoleAsync(
		UpdateStaffRoleArgs args,
		CancellationToken cancellationToken = default
	);

	Task<SetStaffRolePermissionResult> SetStaffRolePermissionAsync(
		SetStaffRolePermissionArgs args,
		CancellationToken cancellationToken = default
	);

	Task<CreateStaffRoleResult> CreateStaffRoleAsync(
		CreateStaffRoleArgs args,
		CancellationToken cancellationToken = default
	);

	Task<DeleteStaffRoleServiceResult> DeleteStaffRoleAsync(
		Guid roleId,
		CancellationToken cancellationToken = default
	);
	// Bulk staff role deletion used by staff actions.
	Task<BulkRoleActionResult> BulkDeleteStaffRolesAsync(
		BulkDeleteStaffRolesArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class StaffRoleAsStaffService : IStaffRoleAsStaffService {
	private readonly AppDbContext _DbContext;
	private readonly ILogger<StaffRoleAsStaffService> _Logger;
	private readonly IJobEnqueuer _JobEnqueuer;
	private readonly IInvitationEmailOutboxSignal _OutboxSignal;
	public StaffRoleAsStaffService(
		AppDbContext dbContext,
		ILogger<StaffRoleAsStaffService> logger,
		IJobEnqueuer jobEnqueuer,
		IInvitationEmailOutboxSignal outboxSignal
	) {
		this._DbContext = dbContext;
		this._Logger = logger;
		this._JobEnqueuer = jobEnqueuer;
		this._OutboxSignal = outboxSignal;
	}

	public async Task<UpdateStaffRoleResult> UpdateStaffRoleAsync(
		UpdateStaffRoleArgs args,
		CancellationToken cancellationToken = default
	) {
		var role = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new UpdateStaffRoleResult.RoleNotFound();
		}

		if (role.IsFullAccess) {
			return new UpdateStaffRoleResult.SystemRoleProtected();
		}

		if (args.Name.IsPresent) {
			var candidateName = args.Name.Value?.Trim();

			// Validation should prevent null/empty names. This is a post-validation guard.
			if (string.IsNullOrWhiteSpace(candidateName)) {
				throw new InvalidOperationException(
					"UpdateStaffRoleAsync received an invalid name. " +
					"Ensure endpoint validation ran before calling the service."
				);
			}

			var exists = await (
				from p in this._DbContext.Role
				where p.Scope == RoleScope.Staff
					&& !p.IsDeleted
					&& p.Id != args.RoleId
					&& p.Name == candidateName
				select p.Id
			).AnyAsync(cancellationToken);

			if (exists) {
				return new UpdateStaffRoleResult.RoleNameExists(candidateName);
			}

			role.Name = candidateName;
		}

		if (args.Description.IsPresent) {
			role.Description = args.Description.Value?.Trim();
		}

		if (args.Icon.IsPresent) {
			role.Icon = args.Icon.Value?.Trim();
		}

		if (args.Tone.IsPresent) {
			role.Tone = args.Tone.Value?.Trim();
		}

		await this._DbContext.SaveChangesAsync(cancellationToken);

		// Same response contract as tenant roles: count active membership rows only.
		var userAccountCount = await (
			from uap in this._DbContext.UserAccountRole
			where uap.RoleId == args.RoleId
			select uap.RoleId
		).CountAsync(cancellationToken);

		var updated = new StaffRoleItem {
			Id = role.GetRequiredId(),
			Name = role.Name,
			Description = role.Description,
			Icon = role.Icon,
			Tone = role.Tone,
			UserAccountCount = userAccountCount,
		};

		return new UpdateStaffRoleResult.Success(updated);
	}

	public async Task<SetStaffRolePermissionResult> SetStaffRolePermissionAsync(
		SetStaffRolePermissionArgs args,
		CancellationToken cancellationToken = default
	) {
		var role = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new SetStaffRolePermissionResult.RoleNotFound();
		}

		if (role.IsFullAccess) {
			return new SetStaffRolePermissionResult.SystemRoleProtected();
		}

		var permissionExists = await (
			from p in this._DbContext.Permission
			where p.Key == args.PermissionKey
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Staff
			select p.Key
		).AnyAsync(cancellationToken);

		if (!permissionExists) {
			return new SetStaffRolePermissionResult.PermissionNotFound();
		}

		var existing = await (
			from pp in this._DbContext.RolePermission
			where pp.RoleId == args.RoleId
				&& pp.PermissionKey == args.PermissionKey
			select pp
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is null) {
			if (args.IsAssigned) {
				// First-time assignment: create the junction row.
				await this._DbContext.RolePermission.AddAsync(
					new RolePermission {
						RoleId = args.RoleId,
						PermissionKey = args.PermissionKey,
					},
					cancellationToken
				);

				await this._DbContext.SaveChangesAsync(cancellationToken);
			}

			// Unassigning a non-existent row is a no-op (idempotent).
			return new SetStaffRolePermissionResult.Success();
		}

		if (args.IsAssigned) {
			// Existing row already represents an active grant; repeated POST is idempotent.
			return new SetStaffRolePermissionResult.Success();
		}

		// DELETE removes the grant row so future POST can insert a fresh composite-key row.
		this._DbContext.RolePermission.Remove(existing);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		return new SetStaffRolePermissionResult.Success();
	}

	/// <summary>
	/// Creates a new staff role with permissions and user assignments.
	/// </summary>
	/// <param name="name">The name of the role</param>
	/// <param name="description">Optional description for the role</param>
	/// <param name="permissions">List of permission keys to assign</param>
	/// <param name="emails">List of user emails to assign or invite</param>
	/// <param name="invitedByUserId">User ID creating the role</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>
	/// Success with statistics, or error result if validation fails
	/// </returns>
	public async Task<CreateStaffRoleResult> CreateStaffRoleAsync(
		CreateStaffRoleArgs args,
		CancellationToken cancellationToken = default
	) {
		var name = args.Name;
		var description = args.Description;
		var permissions = args.Permissions;
		var emails = args.Emails;
		var invitedByUserId = args.InvitedByUserId;
		var icon = args.Icon?.Trim();
		var tone = args.Tone?.Trim();

		// Normalize and validate inputs
		var normalizedName = name.Trim();
		var normalizedEmails = emails
			.Select(e => e.Trim().ToLowerInvariant())
			.ToList();

		// CRITICAL: Business rule - at least one permission is required
		if (permissions.Count == 0) {
			return new CreateStaffRoleResult.NoPermissionsProvided();
		}

		// Check for duplicate emails in input
		var duplicateEmails = normalizedEmails
			.GroupBy(e => e)
			.Where(g => g.Count() > 1)
			.Select(g => g.Key)
			.ToList();

		if (duplicateEmails.Count > 0) {
			return new CreateStaffRoleResult.DuplicateEmails(duplicateEmails);
		}

		// Check if role name already exists
		var roleExists = await (
			from p in this._DbContext.Role
			where p.Scope == RoleScope.Staff
				&& p.Name == normalizedName
			select p
		).AnyAsync(cancellationToken);

		if (roleExists) {
			return new CreateStaffRoleResult.RoleNameExists(normalizedName);
		}

		// Validate all permissions exist AND are Staff-scoped
		var validPermissionKeys = await (
			from p in this._DbContext.Permission
			where permissions.Contains(p.Key)
				&& p.Scope == PermissionScope.Staff
			select p.Key
		).ToListAsync(cancellationToken);

		var invalidPermissions = permissions
			.Except(validPermissionKeys)
			.ToList();

		if (invalidPermissions.Count > 0) {
			return new CreateStaffRoleResult.InvalidPermissions(invalidPermissions);
		}

		// Begin transaction
		await using var transaction = await this._DbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			// Create new staff role using factory method
			var role = Role.CreateStaffRole(
				normalizedName,
				description?.Trim()
			);
			role.Icon = icon;
			role.Tone = tone;

			await this._DbContext.Role.AddAsync(role, cancellationToken);
			await this._DbContext.SaveChangesAsync(cancellationToken);
			// Role ID is now available

			var roleId = role.GetRequiredId();

			// Create RolePermission entities
			var rolePermissions = permissions
				.Select(permissionKey => new RolePermission {
					RoleId = roleId,
					PermissionKey = permissionKey
				})
				.ToList();

			if (rolePermissions.Count > 0) {
				await this._DbContext.RolePermission
					.AddRangeAsync(rolePermissions, cancellationToken);
			}

			// Batch fetch existing users
			var existingUsers = await (
				from u in this._DbContext.User
				where normalizedEmails.Contains(u.Email)
					&& !u.IsDeleted
				select u
			).ToListAsync(cancellationToken);

			var existingUserEmails = existingUsers
				.Select(u => u.Email.ToLowerInvariant())
				.ToHashSet();

			// CRITICAL: Check for users with tenant or project accounts
			// Staff roles can ONLY be assigned to users without tenant/project accounts
			var existingUserIds = existingUsers.Select(u => u.GetRequiredId()).ToList();
			var conflictingAccounts = await (
				from ua in this._DbContext.UserAccount
				where existingUserIds.Contains(ua.UserId)
					&& (ua.Scope == AccountScope.Tenant || ua.Scope == AccountScope.Project)
					&& !ua.IsDeleted && ua.Status != AccountStatus.Suspended
				select ua.UserId
			).ToListAsync(cancellationToken);

			if (conflictingAccounts.Count > 0) {
				// Get emails of users with conflicting accounts
				var conflictingUserIds = conflictingAccounts.ToHashSet();
				var conflictingEmails = existingUsers
					.Where(u => conflictingUserIds.Contains(u.GetRequiredId()))
					.Select(u => u.Email)
					.ToList();

				return new CreateStaffRoleResult.UsersWithConflictingAccounts(conflictingEmails);
			}
			// Batch fetch existing staff accounts for these users
			var existingStaffAccounts = await (
				from ua in this._DbContext.UserAccount
				where existingUserIds.Contains(ua.UserId)
					&& ua.Scope == AccountScope.Staff
					&& !ua.IsDeleted && ua.Status != AccountStatus.Suspended
				select ua
			).ToListAsync(cancellationToken);

			var usersWithStaffAccounts = existingStaffAccounts
				.Select(ua => ua.UserId)
				.ToHashSet();

			// CRITICAL: Batch fetch existing UserAccountRole links to prevent duplicates
			var existingStaffAccountIds = existingStaffAccounts
				.Select(ua => ua.GetRequiredId())
				.ToList();

			var existingRoleLinks = await (
				from uap in this._DbContext.UserAccountRole
				where existingStaffAccountIds.Contains(uap.UserAccountId)
					&& uap.RoleId == roleId
				select uap.UserAccountId
			).ToListAsync(cancellationToken);

			var accountsAlreadyLinked = existingRoleLinks.ToHashSet();

			// Identify missing emails (need invitations)
			var missingEmails = normalizedEmails
				.Except(existingUserEmails)
				.ToList();

			// PERFORMANCE OPTIMIZATION: Batch create UserAccounts to avoid multiple SaveChanges

			// Step 6a: Identify users needing new staff accounts
			var usersNeedingStaffAccounts = existingUsers
				.Where(u => !usersWithStaffAccounts.Contains(u.GetRequiredId()))
				.ToList();

			// Step 6b: Batch create all new UserAccounts (SINGLE SaveChanges)
			var newUserAccountsMap = new Dictionary<Guid, UserAccount>();

			if (usersNeedingStaffAccounts.Count > 0) {
				var newUserAccountsToCreate = usersNeedingStaffAccounts
					.Select(user => {
						var userAccount = UserAccount.CreateStaffAccount(user.GetRequiredId());
						newUserAccountsMap[user.GetRequiredId()] = userAccount;
						return userAccount;
					})
					.ToList();

				await this._DbContext.UserAccount.AddRangeAsync(newUserAccountsToCreate, cancellationToken);
				await this._DbContext.SaveChangesAsync(cancellationToken);
				// All UserAccount IDs are now available
			}

			// Step 6c: Create UserAccountRole links for all users
			var newUserAccountRoles = new List<UserAccountRole>();
			var newLinksCreated = 0;
			var existingLinksSkipped = 0;
			var userIdsToNotify = new List<Guid>();

			foreach (var user in existingUsers) {
				var userId = user.GetRequiredId();
				Guid accountId;

				// Check if user already has a staff account
				if (!usersWithStaffAccounts.Contains(userId)) {
					// User just got a new staff account - get it from our map
					var newAccount = newUserAccountsMap[userId];
					accountId = newAccount.GetRequiredId();
					userIdsToNotify.Add(userId);
				} else {
					// User has existing staff account
					var existingAccount = existingStaffAccounts
						.First(ua => ua.UserId == userId);
					accountId = existingAccount.GetRequiredId();

					// CRITICAL: Only create link if it doesn't already exist
					if (accountsAlreadyLinked.Contains(accountId)) {
						existingLinksSkipped++;
						continue;
					}

					userIdsToNotify.Add(userId);
				}

				// Create UserAccountRole link
				var userAccountRole = new UserAccountRole {
					UserAccountId = accountId,
					RoleId = roleId
				};
				newUserAccountRoles.Add(userAccountRole);
				newLinksCreated++;
			}

			// Batch insert all UserAccountRole links
			if (newUserAccountRoles.Count > 0) {
				await this._DbContext.UserAccountRole
					.AddRangeAsync(newUserAccountRoles, cancellationToken);
			}

			// Check for existing pending invitations
			var existingInvitations = await (
				from i in this._DbContext.Invitation
				where missingEmails.Contains(i.Email)
					&& i.Scope == InvitationScope.Staff
					&& i.Status == InvitationStatus.Pending
				select i.Email.ToLowerInvariant()
			).ToListAsync(cancellationToken);

			// Filter out emails with pending invitations
			var emailsNeedingInvitations = missingEmails
				.Except(existingInvitations)
				.ToList();

			// Generate invitations with tokens
			var invitationTokens = new List<(string Email, string Token)>();
			var newInvitations = new List<Invitation>();

			foreach (var email in emailsNeedingInvitations) {
				if (email is null) {
					throw new InvalidOperationException(
						"CreateStaffRoleAsync encountered a null invitation email after validation."
					);
				}

				// Generate token using CryptoUtils
				var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);
				var expiresAt = DateTime.UtcNow.AddDays(7);

				var invitation = Invitation.CreateStaffInvitationWithRoles(
					email,
					new List<Guid> { roleId },
					invitedByUserId,
					expiresAt,
					token
				);

				invitation.ValidateInvitationType();
				newInvitations.Add(invitation);
				invitationTokens.Add((email, token));

				// Durable delivery record written in the same SaveChanges/transaction
				// as the invitation, delivered out-of-band by
				// InvitationEmailOutboxDispatcher — this path previously sent via a
				// request-scoped Task.Run with no durable record, so an aborted
				// request or process restart silently lost the invitation email
				// while the role-creation response still claimed it was sent
				// (round-6 API F4).
				var outboxRow = InvitationEmailOutbox.CreateStaffInvitation(email, token);
				outboxRow.Invitation = invitation;
				await this._DbContext.InvitationEmailOutbox.AddAsync(outboxRow, cancellationToken);
			}

			if (newInvitations.Count > 0) {
				await this._DbContext.Invitation
					.AddRangeAsync(newInvitations, cancellationToken);
			}

			// #291: one durable joined-staff notification job per EXISTING-user
			// recipient, enqueued INSIDE the domain transaction: a rolled-back role
			// creation takes its notifications with it, and a committed one always
			// carries durable delivery rows — properties the request-scoped Task.Run
			// this replaced never had.
			foreach (var notifyUserId in userIdsToNotify) {
				await this._JobEnqueuer.EnqueueAsync(
					StaffRoleEmailJobs.StaffJoinedNotificationV1,
					new StaffJoinedNotificationEmailPayload { UserId = notifyUserId },
					cancellationToken: cancellationToken
				);
			}

			// Save all changes
			await this._DbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			this._OutboxSignal.Notify();

			if (this._Logger.IsEnabled(LogLevel.Information)) {
				this._Logger.LogInformation(
					"Created staff role {RoleName} with {PermissionsCount} permissions, " +
					"{NewLinksCount} new user assignments, {ExistingLinksCount} existing links skipped, " +
					"{InvitationsCount} invitations sent",
					normalizedName,
					permissions.Count,
					newLinksCreated,
					existingLinksSkipped,
					invitationTokens.Count
				);
			}

			return new CreateStaffRoleResult.Success(
				role,
				permissions.Count,
				newLinksCreated,
				invitationTokens.Count,
				invitationTokens
			);
		} catch (Exception ex) {
			await transaction.RollbackAsync(cancellationToken);
			if (this._Logger.IsEnabled(LogLevel.Error)) {
				this._Logger.LogError(ex, "Failed to create staff role {RoleName}", normalizedName);
			}
			throw;
		}
	}

	public async Task<DeleteStaffRoleServiceResult> DeleteStaffRoleAsync(
		Guid roleId,
		CancellationToken cancellationToken = default
	) {
		// This is a staff-only route: treat missing/non-staff roles as not found.
		var role = await (
			from p in this._DbContext.Role
			where p.Id == roleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new DeleteStaffRoleServiceResult.RoleNotFound();
		}

		if (role.IsFullAccess) {
			return new DeleteStaffRoleServiceResult.SystemRoleProtected();
		}

		// Soft-delete the role (repo convention).
		// We also hard-delete the junction rows so that:
		// - the role stops contributing to UserAccountCount immediately, and
		// - re-creating links later can't conflict with unique constraints.
		var roleIdValue = role.GetRequiredId();

		var links = await (
			from uap in this._DbContext.UserAccountRole
			where uap.RoleId == roleIdValue
			select uap
		).ToListAsync(cancellationToken);

		if (links.Count > 0) {
			this._DbContext.ForceHardDeleteRange(links);
		}

		var permissions = await (
			from pp in this._DbContext.RolePermission
			where pp.RoleId == roleIdValue
			select pp
		).ToListAsync(cancellationToken);

		if (permissions.Count > 0) {
			this._DbContext.ForceHardDeleteRange(permissions);
		}

		role.IsDeleted = true;
		role.DeletedAt = DateTime.UtcNow;
		role.UpdatedAt = DateTime.UtcNow;

		await this._DbContext.SaveChangesAsync(cancellationToken);

		return new DeleteStaffRoleServiceResult.Success(DeletedRoleCount: 1);
	}

	public async Task<BulkRoleActionResult> BulkDeleteStaffRolesAsync(
		BulkDeleteStaffRolesArgs args,
		CancellationToken cancellationToken = default
	) {
		// Deduplicate caller input first to avoid duplicate work and duplicate
		// failed/succeeded accounting for repeated IDs.
		var requestedRoleIds = args.RoleIds.Distinct().ToList();

		if (requestedRoleIds.Count == 0) {
			return new BulkRoleActionResult(
				SucceededCount: 0,
				FailedCount: 0,
				FailedItems: []
			);
		}

		// Load candidate staff roles once, then evaluate each requested ID without
		// issuing a per-role delete request.
		var roles = await (
			from p in this._DbContext.Role
			where p.Scope == RoleScope.Staff
				&& !p.IsDeleted
				&& p.Id != null
				&& requestedRoleIds.Contains(p.Id.Value)
			select p
		).ToListAsync(cancellationToken);

		var roleById = roles.ToDictionary(p => p.GetRequiredId());
		var failedItems = new List<BulkRoleActionFailedItem>();
		foreach (var requestedRoleId in requestedRoleIds) {
			if (!roleById.TryGetValue(requestedRoleId, out var role)) {
				failedItems.Add(
					new BulkRoleActionFailedItem(
						requestedRoleId,
						"Role not found"
					)
				);
				continue;
			}

			// A default staff role is never deleted here, so it must appear
			// in FailedItems with its reason — dropping it silently would make
			// "requested - failed" account it as succeeded.
			if (role.IsDefault || role.IsFullAccess) {
				failedItems.Add(
					new BulkRoleActionFailedItem(
						requestedRoleId,
						role.IsFullAccess
							? "Full-access system roles cannot be deleted"
							: "Default roles cannot be deleted"
					)
				);
			}
		}

		// Drop protected roles from the delete list before touching joins or row state.
		var deletableRoleIds = roleById
			.Where(role => !role.Value.IsDefault && !role.Value.IsFullAccess)
			.Select(role => role.Key)
			.ToList();
		if (deletableRoleIds.Count == 0) {
			return new BulkRoleActionResult(
				SucceededCount: 0,
				FailedCount: failedItems.Count,
				FailedItems: failedItems
			);
		}

		var links = await (
			from uap in this._DbContext.UserAccountRole
			where deletableRoleIds.Contains(uap.RoleId)
			select uap
		).ToListAsync(cancellationToken);

		if (links.Count > 0) {
			this._DbContext.ForceHardDeleteRange(links);
		}

		var permissions = await (
			from pp in this._DbContext.RolePermission
			where deletableRoleIds.Contains(pp.RoleId)
			select pp
		).ToListAsync(cancellationToken);

		if (permissions.Count > 0) {
			this._DbContext.ForceHardDeleteRange(permissions);
		}

		// Soft-delete only non-default roles in-memory and persist once.
		var rolesToDelete = roleById
			.Values
			.Where(role => !role.IsDefault && !role.IsFullAccess)
			.ToList();

		foreach (var role in rolesToDelete) {
			role.IsDeleted = true;
			role.DeletedAt = DateTime.UtcNow;
			role.UpdatedAt = DateTime.UtcNow;
		}

		await this._DbContext.SaveChangesAsync(cancellationToken);

		var failedRoleIds = new HashSet<Guid>(failedItems.Select(item => item.RoleId));
		var succeededRoleIds = requestedRoleIds
			.Where(id => !failedRoleIds.Contains(id))
			.ToList();

		return new BulkRoleActionResult(
			SucceededCount: succeededRoleIds.Count,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}



}
