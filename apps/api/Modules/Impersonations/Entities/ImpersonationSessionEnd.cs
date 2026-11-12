using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Impersonations.Entities;

public enum ImpersonationEndReason {
	// A staff member ended the session explicitly.
	Revoked,
	// The session passed its expiry and was removed (swept or deleted at presentation).
	Expired
}

/// <summary>
/// Durable "this impersonation session is over" marker (#1519). <c>sessions</c> rows are
/// hard-deleted (house rule: no soft-delete lifecycle on sessions; history lives in audit
/// logs), so once a row is gone a late end call could not tell "never existed" (404) from
/// "already ended" (AlreadyEnded). This tombstone is keyed by the impersonation session id
/// (no FK: the session row it describes no longer exists), written in the same statement or
/// transaction that removes the session, and itself hard-deleted by the session-cleanup
/// sweep after a bounded retention window. It is NOT the audit trail
/// (<c>impersonation.ended</c> in <c>audit_logs</c> remains the record of who/why).
/// </summary>
[Table("impersonation_session_ends")]
public class ImpersonationSessionEnd : INoTenantEntity {
	[Column("session_id")]
	public required Guid SessionId { get; set; }

	[Column("ended_at")]
	public required DateTime EndedAt { get; set; }

	[Column("reason")]
	public required ImpersonationEndReason Reason { get; set; }

	// DB-generated; the retention sweep scans by ended_at, not this.
	[Column("created_at")]
	public DateTime CreatedAt { get; set; }
}
