namespace MainApi.Src.Lib.Testing;

using MainApi.Src.Data.Seeding;

/// <summary>
/// Convenience facade over <see cref="SeedConstants"/>
/// for test code. Delegates all seed data values to the
/// single source of truth.
///
/// Header constants (SessionTokenHeader, TenantIdHeader)
/// are test infrastructure — defined here, not in
/// SeedConstants. Also referenced by TestEnvironment.cs
/// to set env var values.
/// </summary>
internal static class TestConstants {
	// Credentials
	public const string SeedPassword =
		SeedConstants.SeedPassword;

	// Staff users
	public const string StaffAdminEmail =
		SeedConstants.Staff.AdminEmail;
	public const string StaffUserEmail =
		SeedConstants.Staff.UserEmail;

	// Tenant users
	public const string AcmeAdminEmail =
		SeedConstants.Tenants.AcmeAdminEmail;
	public const string AcmeUserEmail =
		SeedConstants.Tenants.AcmeUserEmail;
	public const string TechStartAdminEmail =
		SeedConstants.Tenants.TechStartAdminEmail;
	public const string GlobalAdminEmail =
		SeedConstants.Tenants.GlobalAdminEmail;

	// Cross-tenant users
	public const string AliceEmail =
		SeedConstants.CrossTenant.AliceEmail;
	public const string BobEmail =
		SeedConstants.CrossTenant.BobEmail;

	// Headers (test infrastructure — not seed data)
	public const string SessionTokenHeader =
		"X-Session-Token";
	public const string TenantIdHeader =
		"X-PublyApp-TenantId";
}
