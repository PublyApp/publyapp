using System.ComponentModel.DataAnnotations.Schema;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Invitations.Entities;

public enum InvitationEmailKind {
	TenantInvitation = 0,
	StaffInvitation = 1
}

public enum InvitationEmailOutboxStatus {
	Pending = 0,
	Sent = 1,
	// Terminal: attempts exhausted. Kept (not deleted) for operator visibility/manual redelivery.
	Failed = 2
}

/// <summary>
/// Durable record of an invitation email that must be delivered. Written in the same
/// transaction/SaveChanges call as the invitation row it belongs to, so a committed
/// invitation always has a durable delivery record — independent of request
/// cancellation or process shutdown. Delivery is performed out-of-band by
/// InvitationEmailOutboxDispatcher (round-5 API F3).
/// </summary>
[Table("invitation_email_outbox")]
[Index(nameof(Status), nameof(NextAttemptAt))]
public class InvitationEmailOutbox : BaseAttributes, INoTenantEntity {
	[Column("email")]
	public required string Email { get; set; }

	[Column("kind")]
	public InvitationEmailKind Kind { get; set; }

	// Only present for InvitationEmailKind.TenantInvitation.
	[Column("tenant_name")]
	public string? TenantName { get; set; }

	[Column("token")]
	public required string Token { get; set; }

	// Only present for InvitationEmailKind.TenantInvitation.
	[Column("account_level")]
	public AccountLevel? AccountLevel { get; set; }

	[Column("status")]
	public InvitationEmailOutboxStatus Status { get; set; } = InvitationEmailOutboxStatus.Pending;

	[Column("attempt_count")]
	public int AttemptCount { get; set; }

	[Column("last_error")]
	public string? LastError { get; set; }

	[Column("next_attempt_at")]
	public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;

	[Column("sent_at")]
	public DateTime? SentAt { get; set; }

	public static InvitationEmailOutbox CreateTenantInvitation(
		string email,
		string tenantName,
		string token,
		AccountLevel accountLevel
	) {
		return new InvitationEmailOutbox {
			Email = email,
			Kind = InvitationEmailKind.TenantInvitation,
			TenantName = tenantName,
			Token = token,
			AccountLevel = accountLevel
		};
	}

	public static InvitationEmailOutbox CreateStaffInvitation(string email, string token) {
		return new InvitationEmailOutbox {
			Email = email,
			Kind = InvitationEmailKind.StaffInvitation,
			Token = token
		};
	}
}
