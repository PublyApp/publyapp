using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Roles.Permissions;

public class RolePermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "roles";

	// ==== FOR STAFF ====
	public Permission LIST_FOR_STAFF { get; }
	public Permission LIST_USERS_FOR_STAFF_ROLE { get; }
	public Permission GET_FOR_STAFF { get; }
	public Permission CREATE_FOR_STAFF { get; }
	public Permission UPDATE_FOR_STAFF { get; }
	public Permission DELETE_FOR_STAFF { get; }

	// ==== FOR TENANT ====
	public Permission LIST_FOR_TENANT { get; }
	public Permission LIST_USERS_FOR_TENANT_ROLE { get; }
	public Permission GET_FOR_TENANT { get; }
	public Permission CREATE_FOR_TENANT { get; }
	public Permission UPDATE_FOR_TENANT { get; }
	public Permission DELETE_FOR_TENANT { get; }

	public RolePermissionsForStaff() {
		// ==== FOR STAFF ====
		this.LIST_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "list_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List staff roles", Description = "List all staff roles" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Liste les profils du staff", Description = "Liste tous les profils du staff" });

		this.LIST_USERS_FOR_STAFF_ROLE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "list_users_for_staff_role" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List users assigned to a staff role", Description = "List users assigned to a staff role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les utilisateurs affectés à un profil du staff", Description = "Lister les utilisateurs affectés à un profil du staff" });

		this.GET_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "get_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a staff role", Description = "View a staff role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un profil du staff", Description = "Voir un profil du staff" });

		this.CREATE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "create_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a staff role", Description = "Create a new staff role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un profil du staff", Description = "Créer un nouveau profil du staff" });

		this.UPDATE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "update_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a staff role", Description = "Update a staff role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mise à jour d'un profil du staff", Description = "Mettre à jour un profil de staff" });

		this.DELETE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "delete_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a staff role", Description = "Delete a staff role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un profil de staff", Description = "Supprimer un profil de staff" });

		// ==== FOR TENANT ====
		this.LIST_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "list_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List tenant roles", Description = "List all tenant roles" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Liste les profils du tenant", Description = "Liste tous les profils du tenant" });

		this.LIST_USERS_FOR_TENANT_ROLE = Permission
			.CreateStaffPermission(
				string.Join(
					Permission.KeySeparator,
					new[] { this.KeyPrefix, "list_users_for_tenant_role" }
				)
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "List users assigned to a tenant role",
					Description = "List users assigned to a tenant role",
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Lister les utilisateurs affectés à un profil du tenant",
					Description = "Lister les utilisateurs affectés à un profil du tenant",
				}
			);

		this.GET_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "get_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a tenant role", Description = "View a single tenant role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un profil d'un tenant", Description = "Voir un seul profil d'un tenant" });

		this.CREATE_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "create_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a tenant role", Description = "Create a new tenant role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un profil d'un tenant", Description = "Créer un nouveau profil d'un tenant" });

		this.UPDATE_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "update_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a tenant role", Description = "Update a tenant role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mise à jour d'un profil d'un tenant", Description = "Mettre à jour un profil d'un tenant" });

		this.DELETE_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "delete_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a tenant role", Description = "Delete a tenant role" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un profil d'un tenant", Description = "Supprimer un profil d'un tenant" });
	}
}
