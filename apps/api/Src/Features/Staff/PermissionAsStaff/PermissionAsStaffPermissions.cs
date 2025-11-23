using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Lib;

namespace MainApi.Src.Features.Staff.PermissionAsStaff;

public class PermissionAsStaffPermissions : ISlicePermissions {
	public string KeyPrefix { get; } = "permissions";

	public Permission LIST_FOR_STAFF { get; }
	public Permission LIST_FOR_TENANT { get; }

	public PermissionAsStaffPermissions() {
		LIST_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_staff" }));
		LIST_FOR_STAFF = LIST_FOR_STAFF.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List for staff", Description = "List permissions for staff" });
		LIST_FOR_STAFF = LIST_FOR_STAFF.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les permissions du staff", Description = "Lister les permissions du staff" });

		LIST_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_tenant" }));
		LIST_FOR_TENANT = LIST_FOR_TENANT.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List for tenant", Description = "List permissions for tenant" });
		LIST_FOR_TENANT = LIST_FOR_TENANT.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les permissions d'un tenant", Description = "Lister les permissions d'un tenant" });
	}
}
