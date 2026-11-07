using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public interface IStaffUserRoleAssignmentService {
	Task<StaffUserRolesSummary?> GetStaffUserRolesAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<UpdateStaffUserRolesServiceResult> UpdateStaffUserRolesAsync(
		Guid userId,
		List<Guid> roleIds,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class StaffUserRoleAssignmentService : IStaffUserRoleAssignmentService {
	private readonly AppDbContext _DbContext;

	public StaffUserRoleAssignmentService(AppDbContext dbContext) {
		this._DbContext = dbContext;
	}

	public async Task<StaffUserRolesSummary?> GetStaffUserRolesAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Resolve the staff UserAccount ID for the given User ID.
		// IMPORTANT:
		// This endpoint backs the staff-user details UI. We still want the page to render for
		// suspended users (view-only), so we DO NOT filter on suspension here. Suspension affects
		// authentication and action availability, not whether the record exists.
		var staffAccountId = await (
			from ua in this._DbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.Id
		).FirstOrDefaultAsync(cancellationToken);

		// NOTE: ua.Id is nullable in the model (Guid?) so FirstOrDefault can yield null/empty.
		if (staffAccountId is null || staffAccountId.Value == Guid.Empty) {
			return null;
		}

		// Load currently assigned staff roles (via the junction table).
		// Junction rows are hard-deleted when unassigned, so row existence is the active
		// assignment state. We still filter deleted roles and enforce staff scope.
		var assignedRolesRaw = await (
			from uap in this._DbContext.UserAccountRole
			join p in this._DbContext.Role on uap.RoleId equals p.Id
			where uap.UserAccountId == staffAccountId.Value
				&& !p.IsDeleted
				&& p.Scope == RoleScope.Staff
			select new { p.Id, p.Name, p.Description }
		).ToListAsync(cancellationToken);

		var assignedRoles = new List<StaffUserRoleSummary>(assignedRolesRaw.Count);
		foreach (var role in assignedRolesRaw) {
			if (role.Id is null) {
				throw new InvalidOperationException("Role id is null");
			}

			assignedRoles.Add(new StaffUserRoleSummary(
				role.Id.Value,
				role.Name,
				role.Description
			));
		}

		// We intentionally do NOT return "available roles" here.
		// Returning the full universe can grow unbounded and becomes a performance smell.
		// The UI should fetch candidates via `FindStaffRoles` with `search=...`.
		return new StaffUserRolesSummary(AssignedRoles: assignedRoles);
	}

	public async Task<UpdateStaffUserRolesServiceResult> UpdateStaffUserRolesAsync(
		Guid userId,
		List<Guid> roleIds,
		CancellationToken cancellationToken = default
	) {
		// Resolve the staff UserAccount ID for the given User ID.
		// NOTE:
		// We intentionally allow role maintenance even if the target staff user is suspended.
		// Suspending a user should block login and disable UI actions for that user, but staff
		// administrators may still need to update role assignment for cleanup or future reactivation.
		var staffAccountId = await (
			from ua in this._DbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (staffAccountId is null || staffAccountId.Value == Guid.Empty) {
			return new UpdateStaffUserRolesServiceResult.UserNotFound();
		}

		// Role.Id is nullable (Guid?) in the EF model, so we convert our requested IDs to
		// nullable IDs to keep the LINQ query fully translatable by EF.
		var roleIdsNullable = roleIds.Select(id => (Guid?)id).ToList();

		// Load all requested roles in a single query.
		// We only select the fields we need to validate and to return the updated assignment.
		var requestedRoles = await (
			from p in this._DbContext.Role
			where roleIdsNullable.Contains(p.Id)
				&& !p.IsDeleted
			select new {
				p.Id,
				p.Scope,
				p.Name,
				p.Description,
			}
		).ToListAsync(cancellationToken);

		// Validate: every requested ID must exist.
		var existingIds = new List<Guid>();
		foreach (var role in requestedRoles) {
			var id = role.Id;
			if (id is not null) {
				existingIds.Add(id.Value);
			}
		}
		var missingIds = roleIds.Except(existingIds).ToList();
		if (missingIds.Count > 0) {
			return new UpdateStaffUserRolesServiceResult.RolesNotFound(missingIds);
		}

		// Validate: all requested roles must be staff-scope (we never attach tenant roles to staff accounts).
		var nonStaffIds = new List<Guid>();
		foreach (var role in requestedRoles) {
			var id = role.Id;
			if (id is not null && role.Scope != RoleScope.Staff) {
				nonStaffIds.Add(id.Value);
			}
		}
		if (nonStaffIds.Count > 0) {
			return new UpdateStaffUserRolesServiceResult.RolesNotStaffScope(nonStaffIds);
		}

		await using var transaction = await this._DbContext.Database.BeginTransactionAsync(
			cancellationToken
		);
		// This is intentional commit-order serialization: if role update acquires the
		// live staff-account lock and commits first, it returns Success. A concurrent
		// delete blocks on the same account row and then sweeps these committed links.
		var lockedStaffAccount =
			await this._LockLiveStaffUserAccountForRoleUpdateAsync(
				userId,
				staffAccountId.Value,
				cancellationToken
			);

		if (lockedStaffAccount is null) {
			await transaction.RollbackAsync(cancellationToken);
			return new UpdateStaffUserRolesServiceResult.UserNotFound();
		}

		var lockedStaffAccountId = lockedStaffAccount.GetRequiredId();

		// "Replace set" semantics for a pure junction table:
		// - remove links that are currently assigned but not in the new set
		// - add links that are in the new set but not currently assigned
		var existingLinks = await (
			from uap in this._DbContext.UserAccountRole
			where uap.UserAccountId == lockedStaffAccountId
			select uap
		).ToListAsync(cancellationToken);

		var existingRoleIds = existingLinks
			.Select(x => x.RoleId)
			.ToHashSet();

		var desiredRoleIds = roleIds.Distinct().ToList();

		var linksToRemove = existingLinks
			.Where(x => !desiredRoleIds.Contains(x.RoleId))
			.ToList();

		// Staff last-admin invariant (#2289): the full-access system role is the source of
		// every permission, so removing it from its last active holder would lock every
		// staff member out. Non-full-access actors are already blocked from *assigning* it;
		// this also blocks anyone from removing the last one.
		if (linksToRemove.Count > 0) {
			var removedRoleIds = linksToRemove
				.Select(link => (Guid?)link.RoleId)
				.ToList();
			var removesFullAccess = await this._DbContext.Role.AnyAsync(
				role => removedRoleIds.Contains(role.Id)
					&& role.IsFullAccess
					&& !role.IsDeleted,
				cancellationToken
			);

			if (removesFullAccess) {
				var targetIsActiveHolder = await FullAccessRoleQueries
					.ActiveStaffFullAccessAccounts(this._DbContext)
					.AnyAsync(
						account => account.Id == lockedStaffAccountId,
						cancellationToken
					);
				if (targetIsActiveHolder) {
					var activeFullAccessCount =
						await FullAccessRoleQueries.CountActiveStaffFullAccessAsync(
							this._DbContext,
							cancellationToken
						);
					if (activeFullAccessCount <= 1) {
						await transaction.RollbackAsync(cancellationToken);
						return new UpdateStaffUserRolesServiceResult.LastFullAccessRoleRemoval();
					}
				}
			}
		}

		if (linksToRemove.Count > 0) {
			// RemoveRange is a hard delete because UserAccountRole no longer inherits
			// BaseAttributesNoKey, so SaveChanges will not convert it to soft-delete.
			this._DbContext.UserAccountRole.RemoveRange(linksToRemove);
		}

		var toAddIds = desiredRoleIds
			.Where(id => !existingRoleIds.Contains(id))
			.ToList();

		// Only insert missing pairs. Existing composite-key rows already mean assigned.
		var linksToInsert = new List<UserAccountRole>();
		foreach (var roleId in toAddIds) {
			linksToInsert.Add(new UserAccountRole {
				UserAccountId = lockedStaffAccountId,
				RoleId = roleId
			});
		}

		if (linksToInsert.Count > 0) {
			await this._DbContext.UserAccountRole.AddRangeAsync(linksToInsert, cancellationToken);
		}

		try {
			await this._DbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		// Build the result from requestedRoles in-memory to avoid re-query-ing.
		// We also preserve the request order (roleIds) for a stable client experience.
		var assignedMap = new Dictionary<Guid, StaffUserRoleSummary>();
		foreach (var role in requestedRoles) {
			var id = role.Id;
			if (id is null) {
				throw new InvalidOperationException(
					"Role id is null after query filter"
				);
			}

			assignedMap[id.Value] = new StaffUserRoleSummary(
				id.Value,
				role.Name,
				role.Description
			);
		}

		var assigned = desiredRoleIds
			.Where(assignedMap.ContainsKey)
			.Select(id => assignedMap[id])
			.ToList();

		return new UpdateStaffUserRolesServiceResult.Success(assigned);
	}


	private async Task<UserAccount?> _LockLiveStaffUserAccountForRoleUpdateAsync(
		Guid userId,
		Guid staffAccountId,
		CancellationToken cancellationToken
	) {
		// Hold the staff-account row lock until commit so a concurrent delete cannot
		// soft-delete the account while missing this transaction's uncommitted links.
		// If delete arrives after we hold this lock, it serializes behind us and cleans
		// up the committed links once the lock is released.
		return await this._DbContext.UserAccount
			.FromSqlInterpolated($"""
				SELECT ua.*
				FROM user_accounts AS ua
				JOIN users AS u
					ON u.id = ua.user_id
				WHERE ua.id = {staffAccountId}
					AND ua.user_id = {userId}
					AND ua.scope = {(int)AccountScope.Staff}
					AND NOT ua.is_deleted
					AND NOT u.is_deleted
				FOR UPDATE OF ua
				""")
			.AsNoTracking()
			.SingleOrDefaultAsync(cancellationToken);
	}
}
