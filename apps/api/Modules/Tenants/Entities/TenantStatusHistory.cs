using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Tenants.Entities;

/// <summary>
/// One organisation lifecycle transition, append-only. A row records the
/// status the organisation moved to, so the sequence of rows for a tenant is
/// its history. Rows are written by the <c>tenants_record_status_history</c>
/// trigger in the same transaction as the status change itself (#2349):
/// every path — staff handlers, bulk actions, invitation acceptance, seeders —
/// is covered without each one remembering to write it.
/// </summary>
/// <remarks>
/// <c>tenant_id</c> deliberately carries no foreign key, like
/// <c>audit_logs.target_id</c>: this is a log keyed by an id, and hard deletes
/// write a terminal row through the trigger's DELETE arm instead of relying on
/// a cascade. The trade-off (a rewritten <c>tenants.id</c> mis-attributes past
/// rows) is recorded in
/// docs/records/2026-11-09-decision-tenant-status-history-trigger.md.
/// </remarks>
[Table("tenant_status_history")]
[Index(nameof(TenantStatusHistory.TenantId), nameof(TenantStatusHistory.OccurredAt))]
// The series query reads every transition up to the window's end, ordered by
// (occurred_at, id): an index led by tenant_id cannot serve it (#2349 MEDIUM-1).
[Index(nameof(TenantStatusHistory.OccurredAt), nameof(TenantStatusHistory.Id))]
public class TenantStatusHistory : INoTenantEntity {
	[Key]
	[Column("id")]
	public Guid Id { get; set; }

	[Column("tenant_id")]
	public Guid TenantId { get; set; }

	[Column("status")]
	public TenantLifecycleStatus Status { get; set; }

	/// <summary>
	/// When the transition happened (UTC), equal to <c>CreatedAt</c>. The
	/// migration's baseline row for a pre-existing tenant is dated at migration
	/// time, never at the tenant's creation: the past is not invented.
	/// </summary>
	[Column("occurred_at")]
	public DateTime OccurredAt { get; set; }

	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// The status a <see cref="TenantStatusHistory"/> row moved the organisation
/// to. <see cref="Deleted"/> is not a <see cref="TenantStatus"/>: soft
/// deletion keeps the status column untouched, so the history table needs its
/// own terminal value to record the deletion transition.
/// </summary>
public enum TenantLifecycleStatus {
	Pending = 10,
	Active = 20,
	Suspended = 30,
	Deleted = 40,
}
