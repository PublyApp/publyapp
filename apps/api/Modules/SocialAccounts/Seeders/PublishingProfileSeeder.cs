using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Publishing.Providers.Fakes;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Seeders;

/// <summary>
/// Demo seeder (Testing/Development only — <see cref="IEntitySeeder.IsDemo"/>):
/// provisions ONE dedicated publishing identity per demo tenant and grants it the
/// publish-capable permission set through the SAME profile machinery production
/// uses (<c>ProfilePermission</c> + <c>UserAccountProfile</c>, exactly what
/// InvitationAcceptanceService writes at runtime).
///
/// Why it exists: the D2 front-e2e scenario logs in as a NON-admin member
/// (<c>SINGLE_TENANT_USER_CREDENTIALS</c>) to exercise the real permission gate —
/// the composer's "Publish on" block renders only with
/// <c>tenant.socialaccounts.publish</c>. Seeded non-admin members hold no profile
/// permissions by design, so without this seeder the block is hidden and the
/// scenario cannot run. Admins are deliberately NOT touched: the admin bypass is
/// already pinned elsewhere, and granting extra keys to admins would prove nothing.
/// Production excludes every IsDemo seeder (AppDbContext.CreateSeeders), so these
/// rows never exist in a real deployment.
///
/// Idempotent: profiles are found by their pinned names scoped to the tenant, and
/// permission rows / account-profile links are only added when missing, so re-seeds
/// and concurrent seeders converge without duplicating anything.
/// </summary>
public class PublishingProfileSeeder : IEntitySeeder {
	private readonly ILogger<PublishingProfileSeeder> _logger;

	public PublishingProfileSeeder(ILogger<PublishingProfileSeeder>? logger = null) {
		_logger = logger
			?? SeederLoggerUtils.CreateDefault<PublishingProfileSeeder>();
	}

	public int Order {
		get {
			return 46;
		}
	}

	public bool IsDemo {
		get {
			return true;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		// E2E-only seam: this profile + link grant exists solely so the front-e2e
		// publish-now scenario (logged in as a seeded NON-admin member) sees the
		// composer "Publish on" block, which requires tenant.socialaccounts.publish. The
		// matching fakes are gated behind FakePublishingProviderEnabled, so this seeder
		// must be too: under the normal API/testing host (PUBLISHING_FAKE_PROVIDER unset)
		// no publishing profile is granted, and the seeder never inserts Profile rows
		// during a partial MigrateAsync pass (which would target a schema point before
		// the profiles.icon column existed and throw).
		if (!FakePublishingProviderEnabled.IsEnabled()) {
			_logger.LogDebug(
				"PUBLISHING_FAKE_PROVIDER not enabled; skipping demo publishing-profile seeding (e2e-only)."
			);
			return;
		}

		var tenants = await dbContext.Tenant
			.Where(t => !t.IsDeleted)
			.ToListAsync(cancellationToken);
		if (tenants.Count == 0) {
			_logger.LogWarning("No demo tenants found for publishing profile seeding; skipping.");
			return;
		}

		// Publish capability end to end: list targets + fire publish-now need BOTH
		// keys (publish-now is ALL-of posts.publish AND socialaccounts.publish),
		// while the composer target lookup needs socialaccounts.publish alone.
		// posts.create is needed so a NON-admin member can compose+create a draft
		// through the composer in the e2e publish-now scenario (the composer's
		// onBeforePublish calls POST /posts which requires Posts.CREATE).
		string[] publishKeys = [
			AppPermissions.Tenant.Posts.CREATE.Key,
			AppPermissions.Tenant.Posts.PUBLISH.Key,
			AppPermissions.Tenant.Posts.VIEW.Key,
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key,
		];

		foreach (var tenant in tenants) {
			if (!tenant.Id.HasValue) {
				continue;
			}
			var tenantId = tenant.GetRequiredId();

			// Every NON-admin member of this tenant gets the publishing profile.
			// Admins are deliberately untouched: their bypass is pinned elsewhere and
			// granting extra keys to them would prove nothing.
			var nonAdminAccounts = await dbContext.UserAccount
				.Where(ua => ua.TenantId == tenantId
					&& !ua.IsDeleted
					&& ua.Scope == AccountScope.Tenant
					&& ua.Level == AccountLevel.User)
				.ToDictionaryAsync(ua => ua.GetRequiredId(), ua => ua.UserId, cancellationToken);
			if (nonAdminAccounts.Count == 0) {
				continue;
			}

			// Materialised client-side key set: EF Core translates List/HashSet
			// .Contains(...) to SQL `IN (...)` but cannot translate Dictionary
			// .ContainsKey(...) inside a query (runtime translation failure).
			var nonAdminAccountIds = nonAdminAccounts.Keys.ToHashSet();

			var profileName = PublishingProfileName(tenant.Code);
			var profile = await dbContext.Profile
				.Where(p => p.Name == profileName && p.Scope == ProfileScope.Tenant)
				.SingleOrDefaultAsync(cancellationToken);

			if (profile is null) {
				profile = Profile.CreateTenantProfile(
					tenantId,
					profileName,
					"e2e-only publishing permissions for seeded tenant members"
				);
				profile.ValidateProfileType();
				dbContext.Profile.Add(profile);
				await dbContext.SaveChangesAsync(cancellationToken);
			}

			var profileId = profile.GetRequiredId();
			// Per-profile idempotency: compare against what THIS profile already holds,
			// never against a global key list (other profiles legitimately carry keys).
			var existingProfileKeys = await dbContext.ProfilePermission
				.Where(pp => pp.ProfileId == profileId)
				.Select(pp => pp.PermissionKey)
				.ToListAsync(cancellationToken);
			var heldKeys = existingProfileKeys.ToHashSet();

			var grantedAny = false;
			foreach (var key in publishKeys) {
				if (heldKeys.Contains(key)) {
					continue;
				}

				dbContext.ProfilePermission.Add(new ProfilePermission {
					ProfileId = profileId,
					PermissionKey = key,
				});
				grantedAny = true;
			}

			var existingLinks = await dbContext.UserAccountProfile
				.Where(link => nonAdminAccountIds.Contains(link.UserAccountId)
					&& link.ProfileId == profileId)
				.Select(link => link.UserAccountId)
				.ToListAsync(cancellationToken);
			var linkedAccountIds = existingLinks.ToHashSet();

			foreach (var accountId in nonAdminAccounts.Keys) {
				if (linkedAccountIds.Contains(accountId)) {
					continue;
				}

				dbContext.UserAccountProfile.Add(new UserAccountProfile {
					UserAccountId = accountId,
					ProfileId = profileId,
				});
				grantedAny = true;
			}

			if (grantedAny) {
				try {
					await dbContext.SaveChangesAsync(cancellationToken);
				} catch (DbUpdateException ex) when (
					ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505"
				) {
					_logger.LogWarning(
						ex,
						"Duplicate publishing-profile rows detected during seeding; skipping insert."
					);
				}
			}
		}
	}

	// Deterministic per-tenant profile name — the idempotency key for re-seeds.
	private static string PublishingProfileName(string tenantCode) {
		return $"demo-publishing-{tenantCode}";
	}
}
