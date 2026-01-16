using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.SystemNotices.Permissions;

public class SystemNoticePermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "system_notices";

	public Permission LIST { get; }
	public Permission GET { get; }
	public Permission CREATE { get; }
	public Permission UPDATE { get; }
	public Permission DELETE { get; }

	public SystemNoticePermissionsForStaff() {
		LIST = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "list" }))
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "List system notices",
					Description = "View list of all system notices"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Lister les avis système",
					Description = "Voir la liste de tous les avis système"
				}
			);

		GET = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "get" }))
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Get system notice",
					Description = "View details of a system notice"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir un avis système",
					Description = "Voir les détails d'un avis système"
				}
			);

		CREATE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create" }))
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Create system notice",
					Description = "Create a new system notice"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Créer un avis système",
					Description = "Créer un nouvel avis système"
				}
			);

		UPDATE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "update" }))
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Update system notice",
					Description = "Update an existing system notice"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Mettre à jour un avis système",
					Description = "Mettre à jour un avis système existant"
				}
			);

		DELETE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "delete" }))
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Delete system notice",
					Description = "Delete a system notice"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Supprimer un avis système",
					Description = "Supprimer un avis système"
				}
			);
	}
}
