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
	Failed = 2,
	// Claimed by a dispatcher instance for delivery (round-6 API F2). A row leased
	// past LeaseDuration without transitioning to Sent/Failed is treated as
	// abandoned (crashed process) and becomes claimable again.
	Processing = 3,
	// Terminal: the owning invitation was revoked/accepted/superseded before this
	// row was sent (round-6 API F3). Kept for operator visibility, never sent.
	Cancelled = 4
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
[Index(nameof(InvitationId))]
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

	// Links this row back to the invitation it delivers a link for, so revoke/accept
	// can cancel a still-pending send and the dispatcher can recheck eligibility
	// right before sending (round-6 API F3). Nullable only because it is populated
	// via EF's same-SaveChanges FK fixup from the newly created Invitation
	// (store-generated uuidv7 id) — always set by every current producer.
	[Column("invitation_id")]
	public Guid? InvitationId { get; set; }
	public Invitation? Invitation { get; set; }

	// Durable fold-lineage marker (§4.6, R1/R2). Written ONCE, by the fold migration's
	// CancelFoldedPendingRows step, to the job_queue.id this row was folded into, in the
	// same statement that marks the row Cancelled. Nothing else ever writes it, so it is a
	// provenance-safe fact — unlike the free-text LastError the old dispatcher fills and
	// the cancellation paths preserve. The fold's back-copy excludes rows carrying it
	// (their outcome is the new job, not a cancellation), and because it lives on the
	// source row it OUTLIVES the fold job, which is deleted on success before R2's
	// straggler back-copy. The R1 dispatcher/entity ship unchanged and ignore it.
	[Column("folded_job_id")]
	public Guid? FoldedJobId { get; set; }

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

	// Set when a dispatcher instance claims this row for delivery (round-6 API F2).
	[Column("claimed_at")]
	public DateTime? ClaimedAt { get; set; }

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

	// Cancels any not-yet-delivered rows for an invitation that just became
	// ineligible (revoked/accepted/superseded). Mutates tracked entities only —
	// callers must still call SaveChangesAsync (round-6 API F3, sweep target).
	public static async Task CancelPendingForInvitationAsync(
		PublyApp.Api.Data.DbContext.AppDbContext dbContext,
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		var rows = await dbContext.InvitationEmailOutbox
			.Where(o => o.InvitationId == invitationId
				&& (o.Status == InvitationEmailOutboxStatus.Pending
					|| o.Status == InvitationEmailOutboxStatus.Processing))
			.ToListAsync(cancellationToken);

		foreach (var row in rows) {
			row.Status = InvitationEmailOutboxStatus.Cancelled;
		}
	}
}
