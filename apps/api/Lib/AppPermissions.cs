using PublyApp.Api.Modules.Analytics.Permissions;
using PublyApp.Api.Modules.Approvals.Permissions;
using PublyApp.Api.Modules.AuditLogs.Permissions;
using PublyApp.Api.Modules.Billing.Permissions;
using PublyApp.Api.Modules.Calendar.Permissions;
using PublyApp.Api.Modules.Channels.Permissions;
using PublyApp.Api.Modules.Invitations.Permissions;
using PublyApp.Api.Modules.Jobs.Permissions;
using PublyApp.Api.Modules.Media.Permissions;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Permissions.Permissions;
using PublyApp.Api.Modules.Posts.Permissions;
using PublyApp.Api.Modules.Profiles.Permissions;
using PublyApp.Api.Modules.Projects.Permissions;
using PublyApp.Api.Modules.Settings.Permissions;
using PublyApp.Api.Modules.SocialAccounts.Permissions;
using PublyApp.Api.Modules.SystemNotices.Permissions;
using PublyApp.Api.Modules.Tenants.Permissions;
using PublyApp.Api.Modules.Uploads.Permissions;
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
	public UploadPermissionsForStaff Uploads { get; } = new UploadPermissionsForStaff();
	// K-1 (#863): the jobs slice ships permission-first; its only surface today is
	// the dead-letter resolve-unclassified triage endpoint.
	public JobsPermissionsForStaff Jobs { get; } = new JobsPermissionsForStaff();
}

public class TenantScopePermissions : IScopePermissions {
	public string KeyPrefix { get; } = Permission.ScopeKeyPrefix.Tenant;
	// Coarse-grained module-access gates (dashboard/billing/settings/users). These
	// drive the tenant auth payload used by the UI and are kept intact.
	public TenantModulePermissionsForTenant Modules { get; } = new TenantModulePermissionsForTenant();

	// Fine-grained, domain-first tenant capability catalog. Seeded data only; the
	// staff tenant-profile permission matrix renders one group per slice KeyPrefix.
	// Several slices live in permissions-only module folders whose feature code is
	// not yet built (Posts, Media, Calendar, Channels, Approvals, Analytics,
	// Settings, Billing) — the keys exist so profiles can be configured ahead of
	// the features shipping.
	public PostPermissionsForTenant Posts { get; } = new PostPermissionsForTenant();
	public ProjectPermissionsForTenant Projects { get; } = new ProjectPermissionsForTenant();
	public MediaPermissionsForTenant Media { get; } = new MediaPermissionsForTenant();
	public CalendarPermissionsForTenant Calendar { get; } = new CalendarPermissionsForTenant();
	public ChannelPermissionsForTenant Channels { get; } = new ChannelPermissionsForTenant();
	public ApprovalPermissionsForTenant Approvals { get; } = new ApprovalPermissionsForTenant();
	public AnalyticsPermissionsForTenant Analytics { get; } = new AnalyticsPermissionsForTenant();
	public MemberPermissionsForTenant Members { get; } = new MemberPermissionsForTenant();
	public InvitationPermissionsForTenant Invitations { get; } = new InvitationPermissionsForTenant();
	public ProfilePermissionsForTenant Profiles { get; } = new ProfilePermissionsForTenant();
	public SettingsPermissionsForTenant Settings { get; } = new SettingsPermissionsForTenant();
	public BillingPermissionsForTenant Billing { get; } = new BillingPermissionsForTenant();
	public AuditLogPermissionsForTenant AuditLogs { get; } = new AuditLogPermissionsForTenant();
	// C2 (#641): Bluesky-first social accounts. Three verbs per Epic C §1 decision 5.
	public SocialAccountPermissionsForTenant SocialAccounts { get; } = new SocialAccountPermissionsForTenant();
}

public static class AppPermissions {
	public static StaffScopePermissions Staff { get; } = new StaffScopePermissions();
	public static TenantScopePermissions Tenant { get; } = new TenantScopePermissions();
}
