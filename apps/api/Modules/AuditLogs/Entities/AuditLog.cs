using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

using UserEntity = PublyApp.Api.Modules.Users.Entities.User;

namespace PublyApp.Api.Modules.AuditLogs.Entities;

[Table("audit_logs")]
[Index(nameof(UserId), nameof(CreatedAt))]
[Index(nameof(Action), nameof(CreatedAt))]
[Index(nameof(TargetId))]
public class AuditLog : BaseAttributes, INoTenantEntity {
	private UserEntity? _user;

	[Column("user_id")]
	public required Guid UserId { get; set; }
	[JsonIgnore]
	public UserEntity User {
		get { return RequiredNavigation.Get(_user, nameof(AuditLog), nameof(User)); }
		set { _user = value; }
	}

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

	/// <summary>
	/// Single construction path for audit entries, shared by <c>AuditLogService</c> (which
	/// commits the entry on its own) and by domain services that must add the entry to the
	/// same transaction as the state change it records.
	/// </summary>
	public static AuditLog CreateEntry(
		Guid userId,
		string action,
		Guid? targetId,
		object? details,
		string? ipAddress,
		string? userAgent
	) {
		return new AuditLog {
			UserId = userId,
			Action = action,
			TargetId = targetId,
			Details = details is not null
				? JsonSerializer.Serialize(details)
				: null,
			IpAddress = ipAddress,
			UserAgent = userAgent
		};
	}
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
	// K-1 (#863): operator resolved a dead-letter row's external-state triage.
	public const string JobDeadLetterTriageResolved = "job.dead_letter.triage.resolved";
	public const string StaffProfileCreated = "staff.profile.created";
	public const string StaffProfilePermissionsAssigned = "staff.profile.permissions.assigned";
	// Distinguish bulk delete of staff profiles from single-profile delete audit events.
	public const string StaffProfileBulkDeleted = "staff.profile.bulk.deleted";
	public const string StaffProfileUserAssigned = "staff.profile.user.assigned";
	public const string StaffProfileUserUnassigned = "staff.profile.user.unassigned";
	public const string TenantProfileCreated = "tenant.profile.created";
	public const string TenantProfileUpdated = "tenant.profile.updated";
	public const string TenantProfileDeleted = "tenant.profile.deleted";
	public const string TenantProfilePermissionsAssigned = "tenant.profile.permissions.assigned";
	public const string TenantProfilePermissionsUnassigned = "tenant.profile.permissions.unassigned";
	// Membership changes are the only history for user_account_profiles rows, which are
	// hard-deleted on unassign. Keep assign and unassign as distinct actions so the audit
	// trail reconstructs a member's profile timeline without inspecting row existence.
	public const string TenantProfileUserAssigned = "tenant.profile.user.assigned";
	public const string TenantProfileUserUnassigned = "tenant.profile.user.unassigned";
	public const string TenantProfileBulkDeleted = "tenant.profile.bulk.deleted";
	public const string TenantInvitationAccepted = "tenant.invitation.accepted";
	public const string TenantUpdated = "tenant.updated";
	public const string TenantDeleted = "tenant.deleted";
	public const string TenantUserRemoved = "tenant.user.removed";
	public const string TenantUserBulkRemoved = "tenant.user.bulk.removed";
	public const string TenantUserExported = "tenant.user.exported";
	public const string TenantUserUpdated = "tenant.user.updated";
	public const string TenantUserSuspended = "tenant.user.suspended";
	public const string TenantUserReactivated = "tenant.user.reactivated";
	public const string TenantUserIdentitySuspended = "tenant.user.identity.suspended";
	public const string TenantUserIdentityReactivated = "tenant.user.identity.reactivated";
	public const string TenantUserEmailUpdated = "tenant.user.email.updated";
	public const string TenantUserCompaniesAssigned = "tenant.user.companies.assigned";
	public const string TenantUserCompaniesBulkRemoved = "tenant.user.companies.bulk.removed";
	public const string TenantUserCompaniesBulkSuspended = "tenant.user.companies.bulk.suspended";
	public const string TenantUserCompaniesBulkReactivated = "tenant.user.companies.bulk.reactivated";

	// Staff-user lifecycle/identity operations (high impact, explicitly auditable).
	public const string StaffUserSuspended = "staff.user.suspended";
	public const string StaffUserReactivated = "staff.user.reactivated";
	public const string StaffUserBulkSuspended = "staff.user.bulk.suspended";
	public const string StaffUserBulkReactivated = "staff.user.bulk.reactivated";
	public const string StaffUserBulkDeleted = "staff.user.bulk.deleted";
	public const string StaffUserDeleted = "staff.user.deleted";
	public const string StaffUserEmailUpdated = "staff.user.email.updated";

	public const string UploadCreated = "upload.created";
	// Emitted by the upload-orphan-reclaim system job when it physically deletes an
	// orphaned blob and releases its budget bytes — the asset row itself is flipped
	// to Deleted, so this audit entry is the only durable record of the reclamation.
	public const string UploadAssetDeleted = "upload.asset.deleted";

	public const string PostCreated = "post.created";
	public const string PostUpdated = "post.updated";
	public const string PostDeleted = "post.deleted";
}
