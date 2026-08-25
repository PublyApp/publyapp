using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Permissions;

/// <summary>
/// Tenant-scoped permissions for the social-accounts slice (Epic C §1 decision 5):
/// three verbs assigned through profiles like every other tenant permission.
/// Tenant admins hold them implicitly.
/// </summary>
public class SocialAccountPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "socialaccounts";

	public Permission VIEW { get; }
	public Permission MANAGE { get; }
	public Permission PUBLISH { get; }

	public SocialAccountPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View social accounts",
					Description = "See connected accounts and their status"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les comptes sociaux",
					Description = "Consulter les comptes connectés et leur statut"
				}
			);

		MANAGE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "manage" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Manage social accounts",
					Description = "Connect, reconnect and disconnect publishing accounts"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Gérer les comptes sociaux",
					Description = "Connecter, reconnecter et déconnecter les comptes de publication"
				}
			);

		PUBLISH = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "publish" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Publish through social accounts",
					Description = "Use connected accounts as publish targets for content"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Publier via les comptes sociaux",
					Description = "Utiliser les comptes connectés comme cibles de publication du contenu"
				}
			);
	}
}
