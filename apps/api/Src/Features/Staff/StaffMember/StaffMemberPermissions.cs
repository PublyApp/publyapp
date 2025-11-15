using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Lib;

namespace MainApi.Src.Features.Staff.StaffMember;

public class StaffMemberPermissions : ISlicePermissions {
	public string KeyPrefix { get; } = "staff-members";

	public Permission LIST { get; }
	public Permission GET { get; }
	public Permission CREATE { get; }
	public Permission UPDATE { get; }
	public Permission DELETE { get; }

	public StaffMemberPermissions() {
		LIST = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list" }));
		GET = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get" }));
		CREATE = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create" }));
		UPDATE = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update" }));
		DELETE = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete" }));
	}
}
