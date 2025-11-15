using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Staff.ProfileAsStaff;
using MainApi.Src.Features.Staff.StaffMember;
using MainApi.Src.Features.Staff.TenantAsStaff;
using MainApi.Src.Features.Staff.UserAsStaff;

namespace MainApi.Src.Lib;

public interface IScopePermissions {
	string KeyPrefix { get; }
}

public interface ISlicePermissions {
	string KeyPrefix { get; }
}

public class StaffScopePermissions : IScopePermissions {
	public string KeyPrefix { get; } = Permission.ScopeKeyPrefix.Staff;
	public TenantAsStaffPermissions Tenants { get; } = new TenantAsStaffPermissions();
	public UserAsStaffPermissions Users { get; } = new UserAsStaffPermissions();
	public ProfileAsStaffPermissions Profiles { get; } = new ProfileAsStaffPermissions();
	public StaffMemberPermissions StaffMembers { get; } = new StaffMemberPermissions();
}

public class TenantScopePermissions : IScopePermissions {
	public string KeyPrefix { get; } = Permission.ScopeKeyPrefix.Tenant;
	// TODO: Add tenant permissions
}

public static class AppPermissions {
	public static StaffScopePermissions Staff { get; } = new StaffScopePermissions();
	public static TenantScopePermissions Tenant { get; } = new TenantScopePermissions();
}
