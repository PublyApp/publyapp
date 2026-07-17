using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Posts.Permissions;

public class PostPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "posts";

	public Permission VIEW { get; }
	public Permission CREATE { get; }
	public Permission EDIT { get; }
	public Permission PUBLISH { get; }
	public Permission SCHEDULE { get; }
	public Permission DELETE { get; }

	public PostPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View posts",
					Description = "View posts and their content"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les publications",
					Description = "Consulter les publications et leur contenu"
				}
			);

		CREATE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Create posts",
					Description = "Draft new posts"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Créer des publications",
					Description = "Rédiger de nouvelles publications"
				}
			);

		EDIT = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "edit" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Edit posts",
					Description = "Edit the content of existing posts"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Modifier les publications",
					Description = "Modifier le contenu des publications existantes"
				}
			);

		PUBLISH = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "publish" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Publish posts",
					Description = "Send content immediately to its connected publishing channels"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Publier du contenu",
					Description = "Diffuser immédiatement le contenu sur les canaux connectés"
				}
			);

		SCHEDULE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "schedule" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Schedule posts",
					Description = "Set content to publish on connected channels at a later date"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Planifier la diffusion",
					Description = "Planifier leur diffusion sur les canaux à une date ultérieure"
				}
			);

		DELETE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "delete" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Delete posts",
					Description = "Move posts to the recycle bin so they remain recoverable"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Supprimer les publications",
					Description = "Placer les contenus dans la corbeille pour permettre leur restauration"
				}
			);
	}
}
