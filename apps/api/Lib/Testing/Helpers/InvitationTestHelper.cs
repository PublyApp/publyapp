using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// A seeded invitation, with everything a spec needs to assert the wire body or the
/// generated link. <paramref name="ChangedAt"/> is the accepted/revoked timestamp the
/// seed wrote, so a spec can assert it round-trips.
/// </summary>
internal sealed record SeededStaffInvitation(
	Guid Id,
	string Email,
	string Token,
	Guid ProfileId,
	string ProfileName,
	Guid InvitedByUserId,
	DateTime ExpiresAt,
	DateTime ChangedAt
);

/// <summary>
/// Seeds invitation rows directly for the staff invitation read/action specs
/// (get details, get link, resend) without going through the create endpoint — the
/// specs need states the create endpoint cannot produce (accepted, revoked, expired)
/// and must not depend on its permission setup.
/// </summary>
internal static class InvitationTestHelper {
	public static async Task<SeededStaffInvitation> SeedStaffInvitationAsync(
		ApiFixture fixture,
		InvitationStatus status = InvitationStatus.Pending,
		DateTime? expiresAt = null
	) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = await db.Profile
			.Where(candidate => candidate.Scope == ProfileScope.Staff && !candidate.IsDeleted)
			.OrderBy(candidate => candidate.Name)
			.FirstAsync();
		var inviter = await db.User
			.Where(user => user.Email == TestConstants.StaffAdminEmail)
			.FirstAsync();

		var email = $"staff-invitation-{Guid.NewGuid():N}@example.com";
		var token = Guid.NewGuid().ToString("N")[..32];
		var changedAt = DateTime.UtcNow.AddMinutes(-1);
		var invitation = Invitation.CreateStaffInvitationWithProfiles(
			email,
			[profile.GetRequiredId()],
			inviter.GetRequiredId(),
			expiresAt ?? DateTime.UtcNow.AddDays(7),
			token
		);
		invitation.Status = status;
		if (status == InvitationStatus.Accepted) {
			invitation.AcceptedAt = changedAt;
		}

		if (status == InvitationStatus.Revoked) {
			invitation.RevokedAt = changedAt;
		}

		await db.Invitation.AddAsync(invitation);
		await db.SaveChangesAsync();

		return new SeededStaffInvitation(
			invitation.GetRequiredId(),
			email,
			token,
			profile.GetRequiredId(),
			profile.Name,
			inviter.GetRequiredId(),
			invitation.ExpiresAt,
			changedAt
		);
	}

	/// <summary>
	/// A tenant-scoped invitation. The staff read/action handlers must treat its id
	/// exactly like an unknown one (scope guard), so specs assert 404 on it.
	/// </summary>
	public static async Task<Guid> SeedTenantInvitationAsync(ApiFixture fixture) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = await db.Tenant
			.Where(candidate => candidate.Name == SeedConstants.Tenants.AcmeName)
			.FirstAsync();
		var inviter = await db.User
			.Where(user => user.Email == TestConstants.StaffAdminEmail)
			.FirstAsync();

		var invitation = Invitation.CreateTenantInvitationWithProfiles(
			$"tenant-invitation-{Guid.NewGuid():N}@example.com",
			tenant.GetRequiredId(),
			[],
			inviter.GetRequiredId(),
			DateTime.UtcNow.AddDays(7),
			Guid.NewGuid().ToString("N")[..32]
		);
		await db.Invitation.AddAsync(invitation);
		await db.SaveChangesAsync();

		return invitation.GetRequiredId();
	}
}
