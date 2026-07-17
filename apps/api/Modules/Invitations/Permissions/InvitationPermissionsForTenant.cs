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
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View invitations", Description = "View pending invitations" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir les invitations", Description = "Consulter les invitations en attente" });

		CREATE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create invitations", Description = "Create new invitations" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer des invitations", Description = "Créer de nouvelles invitations" });

		REVOKE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "revoke" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Revoke invitations", Description = "Revoke pending invitations" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Révoquer des invitations", Description = "Révoquer les invitations en attente" });

		RESEND = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "resend" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Resend invitations", Description = "Resend invitation emails" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Renvoyer des invitations", Description = "Renvoyer les courriels d'invitation" });
	}
}
