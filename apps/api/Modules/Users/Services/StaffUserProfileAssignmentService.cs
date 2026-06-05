using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public interface IStaffUserProfileAssignmentService {
	Task<StaffUserProfilesSummary?> GetStaffUserProfilesAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<UpdateStaffUserProfilesServiceResult> UpdateStaffUserProfilesAsync(
		Guid userId,
		List<Guid> profileIds,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class StaffUserProfileAssignmentService : IStaffUserProfileAssignmentService {
	private readonly AppDbContext _dbContext;

	public StaffUserProfileAssignmentService(AppDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<StaffUserProfilesSummary?> GetStaffUserProfilesAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Resolve the staff UserAccount ID for the given User ID.
		// IMPORTANT:
		// This endpoint backs the staff-user details UI. We still want the page to render for
		// suspended users (view-only), so we DO NOT filter on suspension here. Suspension affects
		// authentication and action availability, not whether the record exists.
		var staffAccountId = await (
			from ua in _dbContext.UserAccount
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

		// Load currently assigned staff profiles (via the junction table).
		// Junction rows are hard-deleted when unassigned, so row existence is the active
		// assignment state. We still filter deleted profiles and enforce staff scope.
		var assignedProfilesRaw = await (
			from uap in _dbContext.UserAccountProfile
			join p in _dbContext.Profile on uap.ProfileId equals p.Id
			where uap.UserAccountId == staffAccountId.Value
				&& !p.IsDeleted
				&& p.Scope == ProfileScope.Staff
			select new { p.Id, p.Name, p.Description }
		).ToListAsync(cancellationToken);

		var assignedProfiles = new List<StaffUserProfileSummary>(assignedProfilesRaw.Count);
		foreach (var profile in assignedProfilesRaw) {
			if (profile.Id is null) {
				throw new InvalidOperationException("Profile id is null");
			}

			assignedProfiles.Add(new StaffUserProfileSummary(
				profile.Id.Value,
				profile.Name,
				profile.Description
			));
		}

		// We intentionally do NOT return "available profiles" here.
		// Returning the full universe can grow unbounded and becomes a performance smell.
		// The UI should fetch candidates via `FindStaffProfiles` with `search=...`.
		return new StaffUserProfilesSummary(AssignedProfiles: assignedProfiles);
	}

	public async Task<UpdateStaffUserProfilesServiceResult> UpdateStaffUserProfilesAsync(
		Guid userId,
		List<Guid> profileIds,
		CancellationToken cancellationToken = default
	) {
		// Resolve the staff UserAccount ID for the given User ID.
		// NOTE:
		// We intentionally allow profile maintenance even if the target staff user is suspended.
		// Suspending a user should block login and disable UI actions for that user, but staff
		// administrators may still need to update profile assignment for cleanup or future reactivation.
		var staffAccountId = await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (staffAccountId is null || staffAccountId.Value == Guid.Empty) {
			return new UpdateStaffUserProfilesServiceResult.UserNotFound();
		}

		// Profile.Id is nullable (Guid?) in the EF model, so we convert our requested IDs to
		// nullable IDs to keep the LINQ query fully translatable by EF.
		var profileIdsNullable = profileIds.Select(id => (Guid?)id).ToList();

		// Load all requested profiles in a single query.
		// We only select the fields we need to validate and to return the updated assignment.
		var requestedProfiles = await (
			from p in _dbContext.Profile
			where profileIdsNullable.Contains(p.Id)
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
		foreach (var profile in requestedProfiles) {
			var id = profile.Id;
			if (id is not null) {
				existingIds.Add(id.Value);
			}
		}
		var missingIds = profileIds.Except(existingIds).ToList();
		if (missingIds.Count > 0) {
			return new UpdateStaffUserProfilesServiceResult.ProfilesNotFound(missingIds);
		}

		// Validate: all requested profiles must be staff-scope (we never attach tenant profiles to staff accounts).
		var nonStaffIds = new List<Guid>();
		foreach (var profile in requestedProfiles) {
			var id = profile.Id;
			if (id is not null && profile.Scope != ProfileScope.Staff) {
				nonStaffIds.Add(id.Value);
			}
		}
		if (nonStaffIds.Count > 0) {
			return new UpdateStaffUserProfilesServiceResult.ProfilesNotStaffScope(nonStaffIds);
		}

		await using var transaction = await _dbContext.Database.BeginTransactionAsync(
			cancellationToken
		);
		// This is intentional commit-order serialization: if profile update acquires the
		// live staff-account lock and commits first, it returns Success. A concurrent
		// delete blocks on the same account row and then sweeps these committed links.
		var lockedStaffAccount =
			await LockLiveStaffUserAccountForProfileUpdateAsync(
				userId,
				staffAccountId.Value,
				cancellationToken
			);

		if (lockedStaffAccount is null) {
			await transaction.RollbackAsync(cancellationToken);
			return new UpdateStaffUserProfilesServiceResult.UserNotFound();
		}

		var lockedStaffAccountId = lockedStaffAccount.GetRequiredId();

		// "Replace set" semantics for a pure junction table:
		// - remove links that are currently assigned but not in the new set
		// - add links that are in the new set but not currently assigned
		var existingLinks = await (
			from uap in _dbContext.UserAccountProfile
			where uap.UserAccountId == lockedStaffAccountId
			select uap
		).ToListAsync(cancellationToken);

		var existingProfileIds = existingLinks
			.Select(x => x.ProfileId)
			.ToHashSet();

		var desiredProfileIds = profileIds.Distinct().ToList();

		var linksToRemove = existingLinks
			.Where(x => !desiredProfileIds.Contains(x.ProfileId))
			.ToList();

		if (linksToRemove.Count > 0) {
			// RemoveRange is a hard delete because UserAccountProfile no longer inherits
			// BaseAttributesNoKey, so SaveChanges will not convert it to soft-delete.
			_dbContext.UserAccountProfile.RemoveRange(linksToRemove);
		}

		var toAddIds = desiredProfileIds
			.Where(id => !existingProfileIds.Contains(id))
			.ToList();

		// Only insert missing pairs. Existing composite-key rows already mean assigned.
		var linksToInsert = new List<UserAccountProfile>();
		foreach (var profileId in toAddIds) {
			linksToInsert.Add(new UserAccountProfile {
				UserAccountId = lockedStaffAccountId,
				ProfileId = profileId
			});
		}

		if (linksToInsert.Count > 0) {
			await _dbContext.UserAccountProfile.AddRangeAsync(linksToInsert, cancellationToken);
		}

		try {
			await _dbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		// Build the result from requestedProfiles in-memory to avoid re-query-ing.
		// We also preserve the request order (profileIds) for a stable client experience.
		var assignedMap = new Dictionary<Guid, StaffUserProfileSummary>();
		foreach (var profile in requestedProfiles) {
			var id = profile.Id;
			if (id is null) {
				throw new InvalidOperationException(
					"Profile id is null after query filter"
				);
			}

			assignedMap[id.Value] = new StaffUserProfileSummary(
				id.Value,
				profile.Name,
				profile.Description
			);
		}

		var assigned = desiredProfileIds
			.Where(assignedMap.ContainsKey)
			.Select(id => assignedMap[id])
			.ToList();

		return new UpdateStaffUserProfilesServiceResult.Success(assigned);
	}


	private async Task<UserAccount?> LockLiveStaffUserAccountForProfileUpdateAsync(
		Guid userId,
		Guid staffAccountId,
		CancellationToken cancellationToken
	) {
		// Hold the staff-account row lock until commit so a concurrent delete cannot
		// soft-delete the account while missing this transaction's uncommitted links.
		// If delete arrives after we hold this lock, it serializes behind us and cleans
		// up the committed links once the lock is released.
		return await _dbContext.UserAccount
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
