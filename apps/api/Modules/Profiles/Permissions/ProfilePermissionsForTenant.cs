using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Profiles.Permissions;

public class ProfilePermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "profiles";

	public Permission VIEW { get; }
	public Permission CREATE { get; }
	public Permission EDIT { get; }
	public Permission DELETE { get; }
	public Permission ASSIGN_MEMBERS { get; }
	public Permission MANAGE_PERMISSIONS { get; }

	public ProfilePermissionsForTenant() {
		this.VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View profiles",
					Description = "View permission profiles"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les profils",
					Description = "Consulter les profils de permissions"
				}
			);

		this.CREATE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "create" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Create profiles",
					Description = "Create new permission profiles"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Créer des profils",
					Description = "Créer de nouveaux profils de permissions"
				}
			);

		this.EDIT = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "edit" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Edit profiles",
					Description = "Edit permission profile details"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Modifier les profils",
					Description = "Modifier les détails des profils de permissions"
				}
			);

		this.DELETE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "delete" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Delete profiles",
					Description = "Delete permission profiles"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Supprimer des profils",
					Description = "Supprimer des profils de permissions"
				}
			);

		this.ASSIGN_MEMBERS = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "assign_members" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Assign members to profiles",
					Description = "Assign members to permission profiles"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Affecter des membres aux profils",
					Description = "Affecter des membres aux profils de permissions"
				}
			);

		this.MANAGE_PERMISSIONS = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "manage_permissions" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Manage profile permissions",
					Description = "Change the permissions granted by a profile"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Gérer les permissions des profils",
					Description = "Modifier les permissions accordées par un profil"
				}
			);
	}
}
