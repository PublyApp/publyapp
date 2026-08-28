using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Publishing.Providers.Fakes;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Seeders;

/// <summary>
/// Demo seeder (Testing/Development only — <see cref="IEntitySeeder.IsDemo"/>): one
/// Active Bluesky account per demo tenant so composer publish-target lists are never
/// empty in test stacks (round-2 blocker fix for the D2 front-e2e scenario; the
/// API-side tripwire is
/// <c>GetPublishTargetsForTenant.Spec.ItShouldListTheDemoSeededAcmeBlueskyAccountForATenantAdmin</c>).
///
/// The stored credential blob is <see cref="PlaceholderCredentialBlob"/> — a
/// placeholder that satisfies the schema, NOT a working secret. It is never sent
/// anywhere: only the PUBLISHING_FAKE_PROVIDER=1 session seam
/// (<c>FakeBlueskySessionProvider</c>) ever resolves these rows, and the production
/// <c>BlueskySessionProvider</c> refuses the placeholder as "no usable stored
/// credential". Re-seeds are idempotent: the DID derives deterministically from the
/// display handle, and inserts tolerate a concurrent-seeder unique violation.
/// </summary>
public class SocialAccountSeeder : IEntitySeeder {
	private readonly ILogger<SocialAccountSeeder> _logger;

	public SocialAccountSeeder(ILogger<SocialAccountSeeder>? logger = null) {
		_logger = logger
			?? SeederLoggerUtils.CreateDefault<SocialAccountSeeder>();
	}

	public int Order {
		get {
			return 45;
		}
	}

	public bool IsDemo {
		get {
			return true;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		// E2E-only seam: these demo rows exist to satisfy the front-e2e publish-now
		// scenario, which runs the WHOLE publish pipeline (session-open + delivery) through
		// the deterministic fakes. The fakes are themselves gated behind
		// FakePublishingProviderEnabled, so the matching seeded accounts must be too: under
		// the normal API/testing host (PUBLISHING_FAKE_PROVIDER unset) no demo account is
		// seeded, and the seeder never touches the change tracker during partial
		// MigrateAsync passes (which would otherwise insert into a schema point that
		// predates the social_accounts columns and throw).
		if (!FakePublishingProviderEnabled.IsEnabled()) {
			_logger.LogDebug(
				"PUBLISHING_FAKE_PROVIDER not enabled; skipping demo social account seeding (e2e-only)."
			);
			return;
		}

		// (TenantCode, DisplayHandle); handles are pinned constants so specs and e2e
		// suites can assert on them.
		var demoAccounts = new List<(string TenantCode, string DisplayHandle)> {
			(SeedConstants.Tenants.AcmeCode, SeedConstants.SocialAccounts.AcmeBlueskyHandle),
			(SeedConstants.Tenants.TechStartCode, SeedConstants.SocialAccounts.TechStartBlueskyHandle),
			(SeedConstants.Tenants.GlobalCode, SeedConstants.SocialAccounts.GlobalBlueskyHandle),
		};

		var tenantCodes = demoAccounts.Select(entry => entry.TenantCode).ToList();
		var tenants = await (
			from t in dbContext.Tenant
			where tenantCodes.Contains(t.Code)
			select t
		).ToListAsync(cancellationToken);

		if (tenants.Count == 0) {
			_logger.LogWarning("No demo tenants found for social account seeding; skipping.");
			return;
		}

		var codeToTenantId = tenants
			.Where(t => t.Id.HasValue)
			.ToDictionary(t => t.Code, t => t.GetRequiredId());

		var existingDids = await dbContext.SocialAccount
			.Where(account => !account.IsDeleted)
			.Select(account => account.ExternalAccountId)
			.ToListAsync(cancellationToken);
		var existingDidsSet = existingDids.ToHashSet();

		var newAccounts = new List<SocialAccount>();
		foreach (var (tenantCode, displayHandle) in demoAccounts) {
			if (!codeToTenantId.TryGetValue(tenantCode, out var tenantId)) {
				continue;
			}

			var did = DeterministicDid(displayHandle);
			if (existingDidsSet.Contains(did)) {
				continue;
			}

			newAccounts.Add(new SocialAccount {
				TenantId = tenantId,
				Provider = SocialProvider.Bluesky,
				ExternalAccountId = did,
				DisplayHandle = displayHandle,
				CredentialType = SocialCredentialType.AppPassword,
				ProtectedCredentials = PlaceholderCredentialBlob,
				Status = SocialAccountStatus.Active,
			});
		}

		if (newAccounts.Count == 0) {
			_logger.LogInformation(
				"Social account seeding skipped; all demo accounts already exist."
			);
			return;
		}

		await dbContext.SocialAccount.AddRangeAsync(newAccounts, cancellationToken);
		try {
			await dbContext.SaveChangesAsync(cancellationToken);
			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Seeded {Count} demo social accounts.", newAccounts.Count
				);
			}
		} catch (DbUpdateException ex) when (
			ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505"
		) {
			// Lost a race against a concurrent seeder inserting the same rows; the
			// winner's rows satisfy the contract, so this is a skip, not an error.
			_logger.LogWarning(
				ex,
				"Duplicate demo social accounts detected during seeding; skipping insert."
			);
		}
	}

	// Opaque placeholder for the encrypted-credentials column: derived from this
	// public constant, protects nothing by design, and is distinct from every real
	// credential surface. Only the e2e fake session seam ever consumes it.
	public const string PlaceholderCredentialBlob = "demo-e2e-placeholder-blob";

	// The DID derives deterministically from the handle so re-seeds stay idempotent:
	// the same handle always maps to the same external account id, which the
	// existence check above deduplicates on.
	private static string DeterministicDid(string displayHandle) {
		var seed =
			Math.Abs((long)StringComparer.Ordinal.GetHashCode(displayHandle));
		return $"did:plc:{seed:x16}";
	}
}
