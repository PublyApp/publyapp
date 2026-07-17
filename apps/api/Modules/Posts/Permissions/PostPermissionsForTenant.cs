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
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View posts", Description = "View posts and their content" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir les publications", Description = "Consulter les publications et leur contenu" });

		CREATE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create posts", Description = "Draft new posts" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer des publications", Description = "Rédiger de nouvelles publications" });

		EDIT = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "edit" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Edit posts", Description = "Edit the content of existing posts" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Modifier les publications", Description = "Modifier le contenu des publications existantes" });

		PUBLISH = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "publish" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Publish posts", Description = "Publish posts to connected channels" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Publier les publications", Description = "Publier les publications sur les canaux connectés" });

		SCHEDULE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "schedule" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Schedule posts", Description = "Schedule posts for future publishing" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Programmer les publications", Description = "Programmer la publication future des publications" });

		DELETE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "delete" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete posts", Description = "Delete posts" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer les publications", Description = "Supprimer des publications" });
	}
}
