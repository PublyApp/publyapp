using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Publishing.Providers.Fakes;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Seeders;

/// <summary>
/// Demo seeder (Testing/Development only — <see cref="IEntitySeeder.IsDemo"/>):
/// provisions ONE dedicated publishing identity per demo tenant and grants it the
/// publish-capable permission set through the SAME role machinery production
/// uses (<c>RolePermission</c> + <c>UserAccountRole</c>, exactly what
/// InvitationAcceptanceService writes at runtime).
///
/// Why it exists: the D2 front-e2e scenario logs in as a NON-admin member
/// (<c>SINGLE_TENANT_USER_CREDENTIALS</c>) to exercise the real permission gate —
/// the composer's "Publish on" block renders only with
/// <c>tenant.socialaccounts.publish</c>. Seeded non-admin members hold no role
/// permissions by design, so without this seeder the block is hidden and the
/// scenario cannot run. Admins are deliberately NOT touched: the admin bypass is
/// already pinned elsewhere, and granting extra keys to admins would prove nothing.
/// Production excludes every IsDemo seeder (AppDbContext._CreateSeeders), so these
/// rows never exist in a real deployment.
///
/// Idempotent: roles are found by their pinned names scoped to the tenant, and
/// permission rows / account-role links are only added when missing, so re-seeds
/// and concurrent seeders converge without duplicating anything.
/// </summary>
public class PublishingProfileSeeder : IEntitySeeder {
	private readonly ILogger<PublishingProfileSeeder> _Logger;

	public PublishingProfileSeeder(ILogger<PublishingProfileSeeder>? logger = null) {
		this._Logger = logger
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
		// E2E-only seam: this role + link grant exists solely so the front-e2e
		// publish-now scenario (logged in as a seeded NON-admin member) sees the
		// composer "Publish on" block, which requires tenant.socialaccounts.publish. The
		// matching fakes are gated behind FakePublishingProviderEnabled, so this seeder
		// must be too: under the normal API/testing host (PUBLISHING_FAKE_PROVIDER unset)
		// no publishing role is granted, and the seeder never inserts Role rows
		// during a partial MigrateAsync pass (which would target a schema point before
		// the roles.icon column existed and throw).
		if (!FakePublishingProviderEnabled.IsEnabled()) {
			this._Logger.LogDebug(
				"PUBLISHING_FAKE_PROVIDER not enabled; skipping demo publishing-role seeding (e2e-only)."
			);
			return;
		}

		var tenants = await dbContext.Tenant
			.Where(t => !t.IsDeleted)
			.ToListAsync(cancellationToken);
		if (tenants.Count == 0) {
			this._Logger.LogWarning("No demo tenants found for publishing role seeding; skipping.");
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

			// Every NON-admin member of this tenant gets the publishing role.
			// Admins are deliberately untouched: their bypass is pinned elsewhere and
			// granting extra keys to them would prove nothing.
			var nonAdminAccounts = await dbContext.UserAccount
				.Where(ua => ua.TenantId == tenantId
					&& !ua.IsDeleted
					&& ua.Scope == AccountScope.Tenant
					&& !dbContext.UserAccountRole.Any(uap =>
						uap.UserAccountId == ua.Id
						&& !uap.Role.IsDeleted
						&& uap.Role.IsFullAccess))
				.ToDictionaryAsync(ua => ua.GetRequiredId(), ua => ua.UserId, cancellationToken);
			if (nonAdminAccounts.Count == 0) {
				continue;
			}

			// Materialised client-side key set: EF Core translates List/HashSet
			// .Contains(...) to SQL `IN (...)` but cannot translate Dictionary
			// .ContainsKey(...) inside a query (runtime translation failure).
			var nonAdminAccountIds = nonAdminAccounts.Keys.ToHashSet();

			var roleName = PublishingProfileSeeder._PublishingProfileName(tenant.Code);
			var role = await dbContext.Role
				.Where(p => p.Name == roleName && p.Scope == RoleScope.Tenant)
				.SingleOrDefaultAsync(cancellationToken);

			if (role is null) {
				role = Role.CreateTenantRole(
					tenantId,
					roleName,
					"e2e-only publishing permissions for seeded tenant members"
				);
				role.ValidateRoleType();
				dbContext.Role.Add(role);
				await dbContext.SaveChangesAsync(cancellationToken);
			}

			var roleId = role.GetRequiredId();
			// Per-role idempotency: compare against what THIS role already holds,
			// never against a global key list (other roles legitimately carry keys).
			var existingRoleKeys = await dbContext.RolePermission
				.Where(pp => pp.RoleId == roleId)
				.Select(pp => pp.PermissionKey)
				.ToListAsync(cancellationToken);
			var heldKeys = existingRoleKeys.ToHashSet();

			var grantedAny = false;
			foreach (var key in publishKeys) {
				if (heldKeys.Contains(key)) {
					continue;
				}

				dbContext.RolePermission.Add(new RolePermission {
					RoleId = roleId,
					PermissionKey = key,
				});
				grantedAny = true;
			}

			var existingLinks = await dbContext.UserAccountRole
				.Where(link => nonAdminAccountIds.Contains(link.UserAccountId)
					&& link.RoleId == roleId)
				.Select(link => link.UserAccountId)
				.ToListAsync(cancellationToken);
			var linkedAccountIds = existingLinks.ToHashSet();

			foreach (var accountId in nonAdminAccounts.Keys) {
				if (linkedAccountIds.Contains(accountId)) {
					continue;
				}

				dbContext.UserAccountRole.Add(new UserAccountRole {
					UserAccountId = accountId,
					RoleId = roleId,
				});
				grantedAny = true;
			}

			if (grantedAny) {
				try {
					await dbContext.SaveChangesAsync(cancellationToken);
				} catch (DbUpdateException ex) when (
					ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505"
				) {
					this._Logger.LogWarning(
						ex,
						"Duplicate publishing-role rows detected during seeding; skipping insert."
					);
				}
			}
		}
	}

	// Deterministic per-tenant role name — the idempotency key for re-seeds.
	private static string _PublishingProfileName(string tenantCode) {
		return $"demo-publishing-{tenantCode}";
	}
}
