using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Users.Permissions;

public class MemberPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "members";

	public Permission VIEW { get; }
	public Permission MANAGE { get; }
	public Permission SUSPEND { get; }
	public Permission REMOVE { get; }

	public MemberPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View members",
					Description = "See member account identity, role, status, and tenant access"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les membres",
					Description = "Consulter l'identité, le rôle, le statut et les accès des comptes"
				}
			);

		MANAGE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "manage" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Manage members",
					Description = "Change member account roles and statuses; profile assignment "
						+ "requires profiles.assign_members"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Gérer les membres",
					Description = "Modifier les rôles et statuts des comptes; l'affectation aux "
						+ "profils exige profiles.assign_members"
				}
			);

		SUSPEND = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "suspend" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Suspend members",
					Description = "Temporarily block a member account without removing it"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Suspendre des membres",
					Description = "Bloquer temporairement un compte sans le retirer du tenant"
				}
			);

		REMOVE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "remove" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Remove members",
					Description = "Remove a member account from the tenant and end its access"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Retirer des membres",
					Description = "Retirer un compte du tenant et mettre fin à ses accès"
				}
			);
	}
}
