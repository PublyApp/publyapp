namespace PublyApp.Api.Modules.Profiles.Entities;

/// <summary>
/// Names of the seeded full-access system profiles. They are data, not i18n keys:
/// the permission group the UI calls « Rôle » shows the profile name as-is.
/// </summary>
public static class SystemProfileNames {
	/// <summary>The one staff-scope full-access profile.</summary>
	public const string StaffFullAccess = "Staff Owner";

	/// <summary>The tenant-scope full-access profile seeded for every tenant.</summary>
	public const string TenantFullAccess = "Owner";
}
