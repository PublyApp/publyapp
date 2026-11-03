using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Seeds the scope's full-access system profile exactly like production does: full access
/// is a profile assignment, never a flag on the account. Specs that used to say
/// "an admin account" now say "this account holds the full-access role".
/// </summary>
internal static class FullAccessProfileTestHelper {
	/// <summary>The staff-scope full-access profile, created on first use.</summary>
	public static async Task<Guid> EnsureStaffProfileAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken = default
	) {
		var existing = await (
			from p in dbContext.Profile
			where p.Scope == ProfileScope.Staff
				&& p.Name == SystemProfileNames.StaffFullAccess
				&& !p.IsDeleted
			select p.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is Guid existingId) {
			return existingId;
		}

		var profile = Profile.CreateStaffProfile(
			SystemProfileNames.StaffFullAccess,
			"Platform owner with full system access",
			isFullAccess: true
		);
		await dbContext.Profile.AddAsync(profile, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);
		return profile.GetRequiredId();
	}

	/// <summary>The tenant-scope full-access profile for <paramref name="tenantId"/>, created on first use.</summary>
	public static async Task<Guid> EnsureTenantProfileAsync(
		AppDbContext dbContext,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var existing = await (
			from p in dbContext.Profile
			where p.Scope == ProfileScope.Tenant
				&& p.TenantId == tenantId
				&& p.Name == SystemProfileNames.TenantFullAccess
				&& !p.IsDeleted
			select p.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is Guid existingId) {
			return existingId;
		}

		var profile = Profile.CreateTenantProfile(
			tenantId,
			SystemProfileNames.TenantFullAccess,
			"Organization owner with full access",
			isFullAccess: true
		);
		await dbContext.Profile.AddAsync(profile, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);
		return profile.GetRequiredId();
	}

	/// <summary>Grants <paramref name="profileId"/> to the account; idempotent.</summary>
	public static async Task AssignAsync(
		AppDbContext dbContext,
		Guid userAccountId,
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		var exists = await dbContext.UserAccountProfile.AnyAsync(
			uap => uap.UserAccountId == userAccountId && uap.ProfileId == profileId,
			cancellationToken
		);
		if (exists) {
			return;
		}

		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = userAccountId,
			ProfileId = profileId,
		}, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);
	}

	/// <summary>Makes a tenant member full-access (what "Admin" used to mean).</summary>
	public static async Task MakeTenantFullAccessAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userAccountId,
		CancellationToken cancellationToken = default
	) {
		var profileId = await FullAccessProfileTestHelper.EnsureTenantProfileAsync(
			dbContext, tenantId, cancellationToken
		);
		await FullAccessProfileTestHelper.AssignAsync(
			dbContext, userAccountId, profileId, cancellationToken
		);
	}
}
