using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Media.Permissions;

public class MediaPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "media";

	public Permission VIEW { get; }
	public Permission UPLOAD { get; }
	public Permission EDIT { get; }
	public Permission DELETE { get; }

	public MediaPermissionsForTenant() {
		this.VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View media library",
					Description = "Browse the media library"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir la médiathèque",
					Description = "Parcourir la médiathèque"
				}
			);

		this.UPLOAD = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "upload" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Upload media",
					Description = "Upload files to the media library"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Téléverser des médias",
					Description = "Téléverser des fichiers dans la médiathèque"
				}
			);

		this.EDIT = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "edit" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Edit media",
					Description = "Edit media details and metadata"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Modifier les médias",
					Description = "Modifier les détails et les métadonnées des médias"
				}
			);

		this.DELETE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "delete" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Delete media",
					Description = "Remove files from the media library"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Supprimer des médias",
					Description = "Supprimer des fichiers de la médiathèque"
				}
			);
	}
}
