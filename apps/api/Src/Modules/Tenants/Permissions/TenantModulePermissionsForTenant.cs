using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.Tenants.Permissions;

public class TenantModulePermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "modules";

	public Permission ACCESS_DASHBOARD { get; }
	public Permission ACCESS_BILLING { get; }
	public Permission ACCESS_SETTINGS { get; }
	public Permission ACCESS_USERS { get; }

	public TenantModulePermissionsForTenant() {
		// These keys are the canonical tenant-module gates consumed end to end:
		// seeding, staff tenant-profile management, tenant auth data, and tenant UI gating.
		ACCESS_DASHBOARD = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "access_dashboard" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Access the dashboard", Description = "Access the tenant dashboard" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Accéder au tableau de bord", Description = "Accéder au tableau de bord du tenant" });

		ACCESS_BILLING = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "access_billing" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Access billing", Description = "Access tenant billing" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Accéder à la facturation", Description = "Accéder à la facturation du tenant" });

		ACCESS_SETTINGS = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "access_settings" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Access settings", Description = "Access tenant settings" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Accéder aux paramètres", Description = "Accéder aux paramètres du tenant" });

		ACCESS_USERS = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "access_users" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Access users", Description = "Access tenant users" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Accéder aux utilisateurs", Description = "Accéder aux utilisateurs du tenant" });
	}
}
