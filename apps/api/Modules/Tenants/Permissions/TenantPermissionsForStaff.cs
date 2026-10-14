using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Tenants.Permissions;

public class TenantPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "tenants";

	public Permission LIST { get; }
	public Permission GET { get; }
	public Permission CREATE { get; }
	public Permission UPDATE { get; }
	public Permission DELETE { get; }
	public Permission SUSPEND { get; }
	public Permission REACTIVATE { get; }

	public TenantPermissionsForStaff() {
		this.LIST = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "list" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List tenants", Description = "List all tenants" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Liste les tenants", Description = "Liste tous les tenants" });

		this.GET = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "get" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a tenant", Description = "View a tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un tenant", Description = "Voir un tenant" });

		this.CREATE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "create" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a tenant", Description = "Create a new tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un tenant", Description = "Créer un nouveau tenant" });

		this.UPDATE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "update" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a tenant", Description = "Update a tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour un tenant", Description = "Mettre à jour un tenant" });

		this.DELETE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "delete" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a tenant", Description = "Delete a tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un tenant", Description = "Supprimer un tenant" });

		this.SUSPEND = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "suspend" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Suspend a tenant", Description = "Suspend a tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Suspendre un tenant", Description = "Suspendre un tenant" });

		this.REACTIVATE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "reactivate" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Reactivate a tenant", Description = "Reactivate a tenant" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Réactiver un tenant", Description = "Réactiver un tenant" });
	}
}
