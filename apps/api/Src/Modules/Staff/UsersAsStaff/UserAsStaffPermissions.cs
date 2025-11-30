using MainApi.Src.Modules.Shared.Permissions;
using MainApi.Src.Lib;

namespace MainApi.Src.Modules.Staff.UserAsStaff;

public class UserAsStaffPermissions : ISlicePermissions {
	public string KeyPrefix { get; } = "users";

	// ==== FOR STAFF ====
	public Permission LIST_FOR_STAFF { get; }
	public Permission GET_FOR_STAFF { get; }
	public Permission CREATE_FOR_STAFF { get; }
	public Permission UPDATE_FOR_STAFF { get; }
	public Permission DELETE_FOR_STAFF { get; }

	// ==== FOR TENANT ====
	public Permission LIST_FOR_TENANT { get; }
	public Permission GET_FOR_TENANT { get; }
	public Permission CREATE_FOR_TENANT { get; }
	public Permission UPDATE_FOR_TENANT { get; }
	public Permission DELETE_FOR_TENANT { get; }

	public UserAsStaffPermissions() {
		// ==== FOR STAFF ====
		LIST_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_staff" }));
		LIST_FOR_STAFF = LIST_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List for staff", Description = "List users for staff" });
		LIST_FOR_STAFF = LIST_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les utilisateurs du staff", Description = "Lister les utilisateurs du staff" });

		GET_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_staff" }));
		GET_FOR_STAFF = GET_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a user for staff", Description = "View a user for staff" });
		GET_FOR_STAFF = GET_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un utilisateur du staff", Description = "Voir un utilisateur du staff" });

		CREATE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_staff" }));
		CREATE_FOR_STAFF = CREATE_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a user for staff", Description = "Create a new user for staff" });
		CREATE_FOR_STAFF = CREATE_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un utilisateur du staff", Description = "Créer un nouvel utilisateur du staff" });

		UPDATE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_staff" }));
		UPDATE_FOR_STAFF = UPDATE_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a user for staff", Description = "Update a user for staff" });
		UPDATE_FOR_STAFF = UPDATE_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour un utilisateur du staff", Description = "Mettre à jour un utilisateur pour le staff" });

		DELETE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_staff" }));
		DELETE_FOR_STAFF = DELETE_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a user for staff", Description = "Delete a user for staff" });
		DELETE_FOR_STAFF = DELETE_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un utilisateur du staff", Description = "Supprimer un utilisateur du staff" });

		// ==== FOR TENANT ====
		LIST_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_tenant" }));
		LIST_FOR_TENANT = LIST_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List for tenant", Description = "List users for tenant" });
		LIST_FOR_TENANT = LIST_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les utilisateurs d'un tenant", Description = "Lister les utilisateurs d'un tenant" });

		GET_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_tenant" }));
		GET_FOR_TENANT = GET_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a user for tenant", Description = "View a user for tenant" });
		GET_FOR_TENANT = GET_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un utilisateur d'un tenant", Description = "Voir un utilisateur d'un tenant" });

		CREATE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_tenant" }));
		CREATE_FOR_TENANT = CREATE_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a user for tenant", Description = "Create a new user for tenant" });
		CREATE_FOR_TENANT = CREATE_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un utilisateur d'un tenant", Description = "Créer un nouvel utilisateur d'un tenant" });

		UPDATE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_tenant" }));
		UPDATE_FOR_TENANT = UPDATE_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a user for tenant", Description = "Update a user for tenant" });
		UPDATE_FOR_TENANT = UPDATE_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour un utilisateur d'un tenant", Description = "Mettre à jour un utilisateur d'un tenant" });

		DELETE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_tenant" }));
		DELETE_FOR_TENANT = DELETE_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a user for tenant", Description = "Delete a user for tenant" });
		DELETE_FOR_TENANT = DELETE_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un utilisateur d'un tenant", Description = "Supprimer un utilisateur d'un tenant" });
	}
}
