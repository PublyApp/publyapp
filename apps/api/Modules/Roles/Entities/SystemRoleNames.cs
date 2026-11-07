namespace PublyApp.Api.Modules.Roles.Entities;

/// <summary>
/// Names of the seeded full-access system roles. They are data, not i18n keys:
/// the permission group the UI calls « Rôle » shows the role name as-is.
/// </summary>
public static class SystemRoleNames {
	/// <summary>The one staff-scope full-access role.</summary>
	public const string StaffFullAccess = "Staff Owner";

	/// <summary>The tenant-scope full-access role seeded for every tenant.</summary>
	public const string TenantFullAccess = "Owner";
}
