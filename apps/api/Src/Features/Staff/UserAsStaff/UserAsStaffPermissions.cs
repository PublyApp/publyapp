using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Lib;

namespace MainApi.Src.Features.Staff.UserAsStaff;

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
		GET_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_staff" }));
		CREATE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_staff" }));
		UPDATE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_staff" }));
		DELETE_FOR_STAFF = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_staff" }));

		// ==== FOR TENANT ====
		LIST_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list_for_tenant" }));
		GET_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get_for_tenant" }));
		CREATE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create_for_tenant" }));
		UPDATE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update_for_tenant" }));
		DELETE_FOR_TENANT = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete_for_tenant" }));
	}
}
