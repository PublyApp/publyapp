using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using UserEntity = MainApi.Src.Modules.Shared.Users.User;

namespace MainApi.Src.Modules.Staff.AuditLogs;

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
	public const string ImpersonationStarted = "impersonation.started";
	public const string ImpersonationEnded = "impersonation.ended";
	public const string LoginSucceeded = "auth.login.succeeded";
	public const string LoginFailed = "auth.login.failed";
	public const string SystemNoticeCreated = "system.notice.created";
	public const string SystemNoticeUpdated = "system.notice.updated";
	public const string StaffProfileCreated = "staff.profile.created";
	public const string StaffProfilePermissionsAssigned = "staff.profile.permissions.assigned";
	public const string StaffProfileUserAssigned = "staff.profile.user.assigned";
}
