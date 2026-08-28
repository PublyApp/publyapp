namespace PublyApp.Api.Data.Seeding;

/// <summary>
/// Single source of truth for all seed data values.
/// Referenced by EF Core seeders (production) and
/// TestConstants (test infrastructure).
///
/// If you change any value here, the corresponding seeder
/// must be re-run (or the DB re-seeded) for the change to
/// take effect.
/// </summary>
public static class SeedConstants {
	public const string SeedPassword =
		"ChangeMe123!@3#lol";

	public static class Staff {
		public const string AdminEmail =
			"staff-admin@example.com";
		public const string UserEmail =
			"staff-user@example.com";
	}

	public static class Tenants {
		// Acme Corporation
		public const string AcmeCode = "acme-corp";
		public const string AcmeName = "Acme Corporation";
		public const string AcmeAdminEmail =
			"admin-acme@example.com";
		public const string AcmeUserEmail =
			"user-acme@example.com";

		// TechStart Inc
		public const string TechStartCode = "techstart-inc";
		public const string TechStartName = "TechStart Inc";
		public const string TechStartAdminEmail =
			"admin-techstart@example.com";
		public const string TechStartUserEmail =
			"user-techstart@example.com";

		// Global Solutions
		public const string GlobalCode = "global-solutions";
		public const string GlobalName = "Global Solutions";
		public const string GlobalAdminEmail =
			"admin-global@example.com";
		public const string GlobalUserEmail =
			"user-global@example.com";
	}

	public static class CrossTenant {
		public const string AliceEmail =
			"alice@example.com";
		public const string BobEmail =
			"bob@example.com";
		public const string CharlieEmail =
			"charlie@example.com";
	}

	// Demo social accounts (SocialAccountSeeder): one Active Bluesky account
	// per demo tenant so publish-target lists are never empty in dev/test.
	// Handles are pinned so specs and e2e suites can assert on them; the
	// credentials blob is a placeholder — only the PUBLISHING_FAKE_PROVIDER=1
	// session seam ever reads it, and it never touches a real network.
	public static class SocialAccounts {
		public const string AcmeBlueskyHandle =
			"@acme-corp.bsky.social";
		public const string TechStartBlueskyHandle =
			"@techstart-inc.bsky.social";
		public const string GlobalBlueskyHandle =
			"@global-solutions.bsky.social";
	}
}
