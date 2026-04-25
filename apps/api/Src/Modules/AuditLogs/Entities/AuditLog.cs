using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

using Microsoft.EntityFrameworkCore;

using UserEntity = MainApi.Src.Modules.Users.Entities.User;

namespace MainApi.Src.Modules.AuditLogs.Entities;

[Table("audit_logs")]
[Index(nameof(UserId), nameof(CreatedAt))]
[Index(nameof(Action), nameof(CreatedAt))]
[Index(nameof(TargetId))]
public class AuditLog : BaseAttributes, INoTenantEntity {
	[Column("user_id")]
	public required Guid UserId { get; set; }
	[JsonIgnore]
	public UserEntity User { get; set; } = null!;

	[Column("action")]
	public required string Action { get; set; }

	[Column("target_id")]
	public Guid? TargetId { get; set; }

	[Column("details")]
	public string? Details { get; set; }

	[Column("ip_address")]
	public string? IpAddress { get; set; }

	[Column("user_agent")]
	public string? UserAgent { get; set; }
}

public static class AuditActions {
	public const string InvitationCreated = "invitation.created";
	public const string InvitationAccepted = "invitation.accepted";
	public const string InvitationRevoked = "invitation.revoked";
	public const string TenantSuspended = "tenant.suspended";
	public const string TenantReactivated = "tenant.reactivated";
	public const string TenantBulkSuspended = "tenant.bulk.suspended";
	public const string TenantBulkReactivated = "tenant.bulk.reactivated";
	public const string TenantBulkDeleted = "tenant.bulk.deleted";
	public const string ImpersonationStarted = "impersonation.started";
	public const string ImpersonationEnded = "impersonation.ended";
	public const string LoginSucceeded = "auth.login.succeeded";
	public const string LoginFailed = "auth.login.failed";
	public const string SystemNoticeCreated = "system.notice.created";
	public const string SystemNoticeUpdated = "system.notice.updated";
	public const string SystemNoticeDeleted = "system.notice.deleted";
	public const string StaffProfileCreated = "staff.profile.created";
	public const string StaffProfilePermissionsAssigned = "staff.profile.permissions.assigned";
	public const string StaffProfileUserAssigned = "staff.profile.user.assigned";
	public const string TenantProfileCreated = "tenant.profile.created";
	public const string TenantProfileUpdated = "tenant.profile.updated";
	public const string TenantProfileDeleted = "tenant.profile.deleted";
	public const string TenantProfilePermissionsAssigned = "tenant.profile.permissions.assigned";
	public const string TenantProfilePermissionsUnassigned = "tenant.profile.permissions.unassigned";
	public const string TenantProfileBulkDeleted = "tenant.profile.bulk.deleted";
	public const string TenantInvitationAccepted = "tenant.invitation.accepted";
	public const string TenantUpdated = "tenant.updated";
	public const string TenantDeleted = "tenant.deleted";
	public const string TenantUserRemoved = "tenant.user.removed";
	public const string TenantUserUpdated = "tenant.user.updated";
	public const string TenantUserSuspended = "tenant.user.suspended";
	public const string TenantUserReactivated = "tenant.user.reactivated";

	// Staff-user lifecycle/identity operations (high impact, explicitly auditable).
	public const string StaffUserSuspended = "staff.user.suspended";
	public const string StaffUserReactivated = "staff.user.reactivated";
	public const string StaffUserDeleted = "staff.user.deleted";
	public const string StaffUserEmailUpdated = "staff.user.email.updated";
}
