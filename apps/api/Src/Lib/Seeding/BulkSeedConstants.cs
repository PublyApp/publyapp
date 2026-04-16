namespace MainApi.Src.Lib.Seeding;

/// <summary>
/// Configuration constants for bulk seed operations.
/// </summary>
public static class BulkSeedConstants {
	// Bulk data identification prefixes
	public const string TenantCodePrefix = "bulk-tenant-";
	public const string UserEmailDomain = "bulk.example.com";
	public const string StaffUserEmailPrefix = "bulk.staff";
	public const string ProjectNamePrefix = "Bulk Project ";

	// Default counts (can be overridden via env vars)
	public const int DefaultTenantCount = 500;
	public const int DefaultPowerUserCount = 200;
	public const int DefaultCrossTenantUserCount = 1400;
	public const int DefaultSingleTenantUserCount = 6400;
	public const int DefaultProjectsPerTenant = 10;
	public const int DefaultStaffUserCount = 500;
	public const int DefaultBatchSize = 500;

	// Status distribution
	// Semantics:
	// - Active*Ratio and Deleted*Ratio are fractions of the TOTAL population.
	// - If (Active + Deleted) < 1, the remainder is "Suspended (not deleted)".
	// - Deleted entities are always treated as suspended for state consistency.
	public const double ActiveTenantRatio = 0.90;
	public const double ActiveUserRatio = 0.85;
	public const double DeletedTenantRatio = 0.10;
	public const double DeletedUserRatio = 0.15;
	public const double DeletedProjectRatio = 0.05;

	// Staff distribution
	// For staff, we want enough Admins to exercise admin-only flows and enough regular staff users
	// to exercise permission-based access and list/table performance.
	public const double StaffAdminRatio = 0.25;

	// User distribution
	public const int MinTenantMembershipsForPowerUser = 10;
	public const int MaxTenantMembershipsForPowerUser = 50;
	public const int MinTenantMembershipsForCrossTenant = 2;
	public const int MaxTenantMembershipsForCrossTenant = 5;
}
