using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Users.Permissions;

public class MemberPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "members";

	public Permission VIEW { get; }
	public Permission INVITE { get; }
	public Permission MANAGE { get; }
	public Permission SUSPEND { get; }
	public Permission REMOVE { get; }

	public MemberPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View members", Description = "View team members" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir les membres", Description = "Consulter les membres de l'équipe" });

		INVITE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "invite" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Invite members", Description = "Invite people to join the team" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Inviter des membres", Description = "Inviter des personnes à rejoindre l'équipe" });

		MANAGE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "manage" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Manage members", Description = "Manage team members and their profile assignments" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Gérer les membres", Description = "Gérer les membres de l'équipe et l'affectation de leurs profils" });

		SUSPEND = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "suspend" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Suspend members", Description = "Suspend team members' access" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Suspendre des membres", Description = "Suspendre l'accès des membres de l'équipe" });

		REMOVE = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "remove" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Remove members", Description = "Remove members from the team" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Retirer des membres", Description = "Retirer des membres de l'équipe" });
	}
}
