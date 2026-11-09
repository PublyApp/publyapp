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
/// <c>audit_logs.target_id</c>: this is a log keyed by an id, tenants are only
/// soft-deleted (the id never disappears), and the pagination specs rewrite
/// <c>tenants.id</c>, which a plain FK would reject.
/// </remarks>
[Table("tenant_status_history")]
[Index(nameof(TenantStatusHistory.TenantId), nameof(TenantStatusHistory.OccurredAt))]
public class TenantStatusHistory : INoTenantEntity {
	[Key]
	[Column("id")]
	public Guid Id { get; set; }

	[Column("tenant_id")]
	public Guid TenantId { get; set; }

	[Column("status")]
	public TenantLifecycleStatus Status { get; set; }

	/// <summary>
	/// When the transition happened (UTC). Equal to <c>CreatedAt</c> for rows
	/// the trigger writes; the backfill reuses the tenant's creation date.
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
