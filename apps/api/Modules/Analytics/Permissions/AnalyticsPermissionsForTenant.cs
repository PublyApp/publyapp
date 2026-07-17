using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Analytics.Permissions;

public class AnalyticsPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "analytics";

	public Permission VIEW { get; }
	public Permission EXPORT { get; }

	public AnalyticsPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View analytics", Description = "View performance analytics" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir les statistiques", Description = "Consulter les statistiques de performance" });

		EXPORT = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "export" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Export reports", Description = "Export analytics reports" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Exporter les rapports", Description = "Exporter les rapports de statistiques" });
	}
}
