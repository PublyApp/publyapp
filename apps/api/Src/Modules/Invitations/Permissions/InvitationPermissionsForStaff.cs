using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.Invitations.Permissions;

public class InvitationPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "invitations";

	public Permission LIST_FOR_STAFF { get; }
	public Permission CREATE_FOR_STAFF { get; }
	public Permission REVOKE_FOR_STAFF { get; }

	public InvitationPermissionsForStaff() {
		LIST_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "list_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List invitations for staff", Description = "List invitations for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les invitations pour le staff", Description = "Lister les invitations pour le staff" });

		CREATE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create an invitation for staff", Description = "Create an invitation for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer une invitation pour le staff", Description = "Créer une invitation pour le staff" });

		REVOKE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "revoke_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Revoke an invitation for staff", Description = "Revoke an invitation for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Révoquer une invitation pour le staff", Description = "Révoquer une invitation pour le staff" });
	}
}
