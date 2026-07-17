using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Channels.Permissions;

public class ChannelPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "channels";

	public Permission VIEW { get; }
	public Permission CONNECT { get; }
	public Permission DISCONNECT { get; }
	public Permission MANAGE { get; }

	public ChannelPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View channels",
					Description = "View connected publishing channels"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les canaux",
					Description = "Consulter les canaux de publication connectés"
				}
			);

		CONNECT = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "connect" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Connect channels",
					Description = "Connect new publishing channels"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Connecter des canaux",
					Description = "Connecter de nouveaux canaux de publication"
				}
			);

		DISCONNECT = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "disconnect" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Disconnect channels",
					Description = "Disconnect publishing channels"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Déconnecter des canaux",
					Description = "Déconnecter des canaux de publication"
				}
			);

		MANAGE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "manage" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Manage channels",
					Description = "Manage channel settings and credentials"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Gérer les canaux",
					Description = "Gérer les paramètres et les identifiants des canaux"
				}
			);
	}
}
