using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Invitations.Permissions;

public class InvitationPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "invitations";

	public Permission VIEW { get; }
	public Permission CREATE { get; }
	public Permission REVOKE { get; }
	public Permission RESEND { get; }

	public InvitationPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View invitations",
					Description = "View pending invitations"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les invitations",
					Description = "Consulter les invitations en attente"
				}
			);

		CREATE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Create invitations",
					Description = "Send people a link to join the tenant with assigned access"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Créer des invitations",
					Description = "Envoyer un lien pour rejoindre le tenant avec les accès attribués"
				}
			);

		REVOKE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "revoke" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Revoke invitations",
					Description = "Invalidate a pending invitation so its link can no longer be used"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Révoquer des invitations",
					Description = "Invalider une invitation en attente pour rendre son lien inutilisable"
				}
			);

		RESEND = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "resend" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Resend invitations",
					Description = "Send the email for an existing pending invitation again"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Renvoyer les invitations",
					Description = "Envoyer de nouveau le courriel d'une invitation en attente"
				}
			);
	}
}
