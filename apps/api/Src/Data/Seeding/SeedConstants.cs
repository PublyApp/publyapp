namespace MainApi.Src.Data.Seeding;

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
}
