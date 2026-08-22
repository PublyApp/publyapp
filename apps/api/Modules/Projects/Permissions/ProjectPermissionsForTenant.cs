using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Projects.Permissions;

public class ProjectPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "projects";

	public Permission VIEW { get; }

	public ProjectPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View projects",
					Description = "List the workspace's projects"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les projets",
					Description = "Lister les projets de l'espace"
				}
			);
	}
}
