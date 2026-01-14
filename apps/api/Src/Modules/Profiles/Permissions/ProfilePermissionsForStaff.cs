using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.Profiles.Permissions;

public class ProfilePermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "profiles";

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

	public ProfilePermissionsForStaff() {
		// ==== FOR STAFF ====
		LIST_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_staff" }));
		LIST_FOR_STAFF = LIST_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List staff profiles", Description = "List all staff profiles" });
		LIST_FOR_STAFF = LIST_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Liste les profils du staff", Description = "Liste tous les profils du staff" });

		GET_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_staff" }));
		GET_FOR_STAFF = GET_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a staff profile", Description = "View a staff profile" });
		GET_FOR_STAFF = GET_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un profil du staff", Description = "Voir un profil du staff" });

		CREATE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_staff" }));
		CREATE_FOR_STAFF = CREATE_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a staff profile", Description = "Create a new staff profile" });
		CREATE_FOR_STAFF = CREATE_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un profil du staff", Description = "Créer un nouveau profil du staff" });

		UPDATE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_staff" }));
		UPDATE_FOR_STAFF = UPDATE_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a staff profile", Description = "Update a staff profile" });
		UPDATE_FOR_STAFF = UPDATE_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mise à jour d'un profil du staff", Description = "Mettre à jour un profil de staff" });

		DELETE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_staff" }));
		DELETE_FOR_STAFF = DELETE_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a staff profile", Description = "Delete a staff profile" });
		DELETE_FOR_STAFF = DELETE_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un profil de staff", Description = "Supprimer un profil de staff" });

		// ==== FOR TENANT ====
		LIST_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_tenant" }));
		LIST_FOR_TENANT = LIST_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List tenant profiles", Description = "List all tenant profiles" });
		LIST_FOR_TENANT = LIST_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Liste les profils du tenant", Description = "Liste tous les profils du tenant" });

		GET_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_tenant" }));
		GET_FOR_TENANT = GET_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a tenant profile", Description = "View a single tenant profile" });
		GET_FOR_TENANT = GET_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un profil d'un tenant", Description = "Voir un seul profil d'un tenant" });

		CREATE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_tenant" }));
		CREATE_FOR_TENANT = CREATE_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a tenant profile", Description = "Create a new tenant profile" });
		CREATE_FOR_TENANT = CREATE_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un profil d'un tenant", Description = "Créer un nouveau profil d'un tenant" });

		UPDATE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_tenant" }));
		UPDATE_FOR_TENANT = UPDATE_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a tenant profile", Description = "Update a tenant profile" });
		UPDATE_FOR_TENANT = UPDATE_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mise à jour d'un profil d'un tenant", Description = "Mettre à jour un profil d'un tenant" });

		DELETE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_tenant" }));
		DELETE_FOR_TENANT = DELETE_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a tenant profile", Description = "Delete a tenant profile" });
		DELETE_FOR_TENANT = DELETE_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un profil d'un tenant", Description = "Supprimer un profil d'un tenant" });
	}
}
