using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Calendar.Permissions;

public class CalendarPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "calendar";

	public Permission VIEW { get; }
	public Permission MANAGE { get; }

	public CalendarPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View calendar",
					Description = "View the content calendar"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir le calendrier",
					Description = "Consulter le calendrier de contenu"
				}
			);

		MANAGE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "manage" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Manage calendar",
					Description = "Reschedule and organize the content calendar"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Gérer le calendrier",
					Description = "Réorganiser les contenus et modifier leurs dates de diffusion"
				}
			);
	}
}
