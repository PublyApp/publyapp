using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;

namespace PublyApp.Api.Modules.Profiles.Services;

/// <summary>
/// The only place that answers "may this actor hand out the full-access role?".
/// The role is a normal <see cref="Entities.Profile"/> row with
/// <see cref="Entities.Profile.IsFullAccess"/> set, so an assignment endpoint that only
/// checked its route permission could otherwise let a non-full-access staff member grant
/// themselves (or anybody else) every right. Every assignment surface MUST call this.
/// </summary>
public interface IProfileAssignmentGuard {
	Task<bool> ActorHasFullAccessAsync(Guid actorUserId, CancellationToken cancellationToken = default);

	Task<bool> CanAssignProfilesAsync(
		Guid actorUserId,
		IReadOnlyCollection<Guid> profileIds,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class ProfileAssignmentGuard : IProfileAssignmentGuard {
	private readonly AppDbContext _DbContext;

	public ProfileAssignmentGuard(AppDbContext dbContext) {
		this._DbContext = dbContext;
	}

	public async Task<bool> ActorHasFullAccessAsync(
		Guid actorUserId,
		CancellationToken cancellationToken = default
	) {
		// Staff scope only: the caller of this guard is a staff actor handing out a
		// staff or tenant role. Reading the profile graph here (instead of the permission
		// service) keeps this a domain service with no other domain service injected.
		return await FullAccessRoleQueries.IsFullAccessUserAsync(
			this._DbContext,
			actorUserId,
			tenantId: null,
			cancellationToken
		);
	}

	public async Task<bool> CanAssignProfilesAsync(
		Guid actorUserId,
		IReadOnlyCollection<Guid> profileIds,
		CancellationToken cancellationToken = default
	) {
		if (profileIds.Count == 0) {
			return true;
		}

		var ids = profileIds.Distinct().ToList();
		var assignsFullAccess = await this._DbContext.Profile
			.AnyAsync(p =>
				p.Id != null
				&& ids.Contains(p.Id.Value)
				&& p.IsFullAccess
				&& !p.IsDeleted,
				cancellationToken);

		if (!assignsFullAccess) {
			return true;
		}

		return await this.ActorHasFullAccessAsync(actorUserId, cancellationToken);
	}
}
