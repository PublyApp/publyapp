using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Settings.Permissions;

public class SettingsPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "settings";

	public Permission VIEW { get; }
	public Permission EDIT { get; }

	public SettingsPermissionsForTenant() {
		this.VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View settings",
					Description = "View workspace settings"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les paramètres",
					Description = "Consulter les paramètres de l'espace de travail"
				}
			);

		this.EDIT = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "edit" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Edit settings",
					Description = "Edit workspace settings"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Modifier les paramètres",
					Description = "Modifier les paramètres de l'espace de travail"
				}
			);
	}
}
