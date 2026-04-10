using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.Users.Permissions;

public class UserPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "users";

	// ==== FOR STAFF ====
	public Permission LIST_FOR_STAFF { get; }
	public Permission GET_FOR_STAFF { get; }
	public Permission CREATE_FOR_STAFF { get; }
	public Permission UPDATE_FOR_STAFF { get; }
	public Permission UPDATE_EMAIL_FOR_STAFF { get; }
	public Permission SUSPEND_FOR_STAFF { get; }
	public Permission REACTIVATE_FOR_STAFF { get; }
	public Permission DELETE_FOR_STAFF { get; }
	public Permission GET_PROFILES_FOR_STAFF { get; }
	public Permission UPDATE_PROFILES_FOR_STAFF { get; }

	// ==== FOR TENANT ====
	public Permission LIST_FOR_TENANT { get; }
	public Permission GET_FOR_TENANT { get; }
	public Permission CREATE_FOR_TENANT { get; }
	public Permission UPDATE_FOR_TENANT { get; }
	public Permission DELETE_FOR_TENANT { get; }

	public UserPermissionsForStaff() {
		// ==== FOR STAFF ====
		LIST_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List for staff", Description = "List users for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les utilisateurs du staff", Description = "Lister les utilisateurs du staff" });

		GET_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a user for staff", Description = "View a user for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un utilisateur du staff", Description = "Voir un utilisateur du staff" });

		CREATE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a user for staff", Description = "Create a new user for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un utilisateur du staff", Description = "Créer un nouvel utilisateur du staff" });

		UPDATE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a user for staff", Description = "Update a user for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour un utilisateur du staff", Description = "Mettre à jour un utilisateur du staff" });

		UPDATE_EMAIL_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_email_for_staff" }))
			// Keep email change separate from the general update permission. This operation is
			// security-sensitive and should be granted intentionally.
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update staff user email", Description = "Update a staff user's email (high risk)" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour l'email d'un utilisateur du staff", Description = "Mettre à jour l'email d'un utilisateur du staff (risque élevé)" });

		SUSPEND_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "suspend_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Suspend a staff user", Description = "Suspend a staff user" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Suspendre un utilisateur du staff", Description = "Suspendre un utilisateur du staff" });

		REACTIVATE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "reactivate_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Reactivate a staff user", Description = "Reactivate a suspended staff user" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Réactiver un utilisateur du staff", Description = "Réactiver un utilisateur du staff suspendu" });

		DELETE_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a user for staff", Description = "Delete a user for staff" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un utilisateur du staff", Description = "Supprimer un utilisateur du staff" });

		GET_PROFILES_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_profiles_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View staff user profiles", Description = "View profiles assigned to a staff user" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir les profils d'un utilisateur du staff", Description = "Voir les profils assignés à un utilisateur du staff" });

		UPDATE_PROFILES_FOR_STAFF = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_profiles_for_staff" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update staff user profiles", Description = "Assign or remove profiles for a staff user" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour les profils d'un utilisateur du staff", Description = "Assigner ou retirer des profils à un utilisateur du staff" });

		// ==== FOR TENANT ====
		LIST_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List for tenant", Description = "List users for tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les utilisateurs d'un tenant", Description = "Lister les utilisateurs d'un tenant" });

		GET_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a user for tenant", Description = "View a user for tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un utilisateur d'un tenant", Description = "Voir un utilisateur d'un tenant" });

		CREATE_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a user for tenant", Description = "Create a new user for tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un utilisateur d'un tenant", Description = "Créer un nouvel utilisateur d'un tenant" });

		UPDATE_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a user for tenant", Description = "Update a user for tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour un utilisateur d'un tenant", Description = "Mettre à jour un utilisateur d'un tenant" });

		DELETE_FOR_TENANT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_tenant" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a user for tenant", Description = "Delete a user for tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un utilisateur d'un tenant", Description = "Supprimer un utilisateur d'un tenant" });
	}
}
