using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Uploads.Entities;

/// <summary>
/// Single-row durable byte budget for upload admission control (#807 F1). One row
/// per scope kind: the global pool (<see cref="UploadBudgetScope.Global"/>) plus,
/// when configured, one row per creator (<see cref="UploadBudgetScope.CreatorUser"/>). All
/// budget arithmetic happens inside the database via a conditional
/// <c>UPDATE ... SET reserved_bytes = reserved_bytes + n WHERE headroom &gt;= n</c>
/// executed on a serialisable transaction against THIS row — Postgres row-locks
/// the single tuple, so concurrent admissions serialise and over-admission is
/// impossible by construction (no read-check-write race).
///
/// <c>reserved_bytes</c> holds bytes of assets still being written;
/// <c>committed_bytes</c> holds bytes whose blobs exist durably. Commit moves n
/// between them; release subtracts from reserved. Both run inside the caller's
/// transaction so a rolled-back upload never leaves phantom reservations.
/// </summary>
[Table("upload_budgets")]
public class UploadBudget : INoTenantEntity {
	[Key]
	[Column("id")]
	public Guid? Id { get; set; }

	[Column("scope_kind")]
	public UploadBudgetScope ScopeKind { get; set; } = UploadBudgetScope.Global;

	/// <summary>
	/// Scope discriminator: null for the global pool; the creator user id or the
	/// purpose string otherwise. Unique per (scope_kind, scope_key).
	/// </summary>
	[Column("scope_key")]
	public string? ScopeKey { get; set; }

	[Column("max_bytes")]
	public required long MaxBytes { get; set; }

	[Column("reserved_bytes")]
	public long ReservedBytes { get; set; }

	[Column("committed_bytes")]
	public long CommittedBytes { get; set; }
}

/// <summary>Budget scope kinds. Numeric values are stored.</summary>
public enum UploadBudgetScope {
	Global = 10,
	CreatorUser = 20,
}
