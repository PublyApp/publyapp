using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.Tenants.Permissions;

public class TenantPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "tenants";

	public Permission LIST { get; }
	public Permission GET { get; }
	public Permission CREATE { get; }
	public Permission UPDATE { get; }
	public Permission DELETE { get; }

	public TenantPermissionsForStaff() {
		LIST = Permission.CreateStaffPermission(
			string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list" })
		);
		LIST = LIST.SetTranslation(
			SupportedLanguage.English,
			new PermissionTranslation { Name = "List tenants", Description = "List all tenants" }
		);
		LIST = LIST.SetTranslation(
			SupportedLanguage.French,
			new PermissionTranslation { Name = "Liste les tenants", Description = "Liste tous les tenants" }
		);

		GET = Permission.CreateStaffPermission(
			string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get" })
		);
		GET = GET.SetTranslation(
			SupportedLanguage.English,
			new PermissionTranslation { Name = "View a tenant", Description = "View a tenant" }
		);
		GET = GET.SetTranslation(
			SupportedLanguage.French,
			new PermissionTranslation { Name = "Voir un tenant", Description = "Voir un tenant" }
		);

		CREATE = Permission.CreateStaffPermission(
			string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create" })
		);
		CREATE = CREATE.SetTranslation(
			SupportedLanguage.English,
			new PermissionTranslation { Name = "Create a tenant", Description = "Create a new tenant" }
		);
		CREATE = CREATE.SetTranslation(
			SupportedLanguage.French,
			new PermissionTranslation { Name = "Créer un tenant", Description = "Créer un nouveau tenant" }
		);

		UPDATE = Permission.CreateStaffPermission(
			string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update" })
		);
		UPDATE = UPDATE.SetTranslation(
			SupportedLanguage.English,
			new PermissionTranslation { Name = "Update a tenant", Description = "Update a tenant" }
		);
		UPDATE = UPDATE.SetTranslation(
			SupportedLanguage.French,
			new PermissionTranslation { Name = "Mettre à jour un tenant", Description = "Mettre à jour un tenant" }
		);

		DELETE = Permission.CreateStaffPermission(
			string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete" })
		);
		DELETE = DELETE.SetTranslation(
			SupportedLanguage.English,
			new PermissionTranslation { Name = "Delete a tenant", Description = "Delete a tenant" }
		);
		DELETE = DELETE.SetTranslation(
			SupportedLanguage.French,
			new PermissionTranslation { Name = "Supprimer un tenant", Description = "Supprimer un tenant" }
		);
	}
}
