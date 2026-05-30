using PublyApp.Api.Modules.AuditLogs.Permissions;
using PublyApp.Api.Modules.Invitations.Permissions;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Permissions.Permissions;
using PublyApp.Api.Modules.Profiles.Permissions;
using PublyApp.Api.Modules.SystemNotices.Permissions;
using PublyApp.Api.Modules.Tenants.Permissions;
using PublyApp.Api.Modules.Users.Permissions;

namespace PublyApp.Api.Lib;

public interface IScopePermissions {
	string KeyPrefix { get; }
}

public interface ISlicePermissions {
	string KeyPrefix { get; }
}

public class StaffScopePermissions : IScopePermissions {
	public string KeyPrefix { get; } = Permission.ScopeKeyPrefix.Staff;
	public UserPermissionsForStaff Users { get; } = new UserPermissionsForStaff();
	public InvitationPermissionsForStaff Invitations { get; } = new InvitationPermissionsForStaff();
	public TenantPermissionsForStaff Tenants { get; } = new TenantPermissionsForStaff();
	public ProfilePermissionsForStaff Profiles { get; } = new ProfilePermissionsForStaff();
	public PermissionPermissionsForStaff Permissions { get; } = new PermissionPermissionsForStaff();
	public SystemNoticePermissionsForStaff SystemNotices { get; } = new SystemNoticePermissionsForStaff();
	public AuditLogPermissionsForStaff AuditLogs { get; } = new AuditLogPermissionsForStaff();
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
