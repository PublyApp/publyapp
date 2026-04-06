using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.Invitations.Permissions;

public class InvitationPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "invitations";

	public Permission LIST_FOR_STAFF { get; }
	public Permission LIST_FOR_TENANT { get; }
	public Permission GET_FOR_STAFF { get; }
	public Permission CREATE_FOR_STAFF { get; }
	public Permission REVOKE_FOR_STAFF { get; }
	public Permission REVOKE_FOR_TENANT { get; }
	public Permission GET_LINK_FOR_STAFF { get; }
	public Permission RESEND_FOR_STAFF { get; }

	public InvitationPermissionsForStaff() {
		LIST_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "list_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List invitations for staff", Description = "List invitations for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les invitations pour le staff", Description = "Lister les invitations pour le staff" });

		LIST_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "list_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List invitations for tenant", Description = "List invitations for a specific tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les invitations pour le tenant", Description = "Lister les invitations pour un tenant spécifique" });

		GET_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "get_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View an invitation for staff", Description = "View details of a staff invitation" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir une invitation pour le staff", Description = "Voir les détails d'une invitation pour le staff" });

		CREATE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create an invitation for staff", Description = "Create an invitation for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer une invitation pour le staff", Description = "Créer une invitation pour le staff" });

		REVOKE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "revoke_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Revoke an invitation for staff", Description = "Revoke an invitation for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Révoquer une invitation pour le staff", Description = "Révoquer une invitation pour le staff" });

		REVOKE_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "revoke_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Revoke an invitation for tenant", Description = "Revoke an invitation for a specific tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Révoquer une invitation pour le tenant", Description = "Révoquer une invitation pour un tenant spécifique" });

		// Extra actions for managing pending invitations.
		GET_LINK_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "get_link_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Get invitation link for staff", Description = "Get invitation link for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Récupérer le lien d'invitation pour le staff", Description = "Récupérer le lien d'invitation pour le staff" });

		RESEND_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "resend_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Resend invitation for staff", Description = "Resend invitation for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Renvoyer une invitation pour le staff", Description = "Renvoyer une invitation pour le staff" });
	}
}
