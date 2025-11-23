using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Staff.PermissionAsStaff;
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
	public PermissionAsStaffPermissions Permissions { get; } = new PermissionAsStaffPermissions();
	public StaffMemberPermissions StaffMembers { get; } = new StaffMemberPermissions();
}

public class TenantScopePermissions : IScopePermissions {
	public string KeyPrefix { get; } = Permission.ScopeKeyPrefix.Tenant;
	// Tenant module permissions are intentionally coarse-grained for now.
	// They drive both the backend catalog endpoint and the tenant auth payload used by the UI.
	public TenantModulePermissionsForTenant Modules { get; } = new TenantModulePermissionsForTenant();
}

public static class AppPermissions {
	public static StaffScopePermissions Staff { get; } = new StaffScopePermissions();
	public static TenantScopePermissions Tenant { get; } = new TenantScopePermissions();
}
