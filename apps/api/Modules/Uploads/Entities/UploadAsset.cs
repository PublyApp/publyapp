using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Uploads.Entities;

/// <summary>
/// First-class record of one stored upload blob (#807 phase 2, F1/F5). Every byte
/// this API admits through <c>POST /uploads</c> gets exactly one row, created in
/// the <see cref="UploadAssetState.Reserved"/> state INSIDE the same database
/// transaction that atomically reserves the bytes against the global budget —
/// before the destination file is opened. The row carries the ownership facts the
/// old flow lacked: real size, sniffed content type, purpose, creator, lifecycle
/// state, and a reference count.
///
/// Lifecycle (one-way transitions, all inside transactions):
/// Reserved → Stored   (blob written and audited; bytes move reserved → committed)
/// Stored   → Referenced / back (reference-count transitions on tenant.logo_url writes)
/// Referenced/Stored → Orphaned (last reference dropped; <c>DeleteNotBefore</c> set)
/// Orphaned → Deleted    (sweeper job physically deleted the blob after the grace
/// period AND a final zero-reference recheck)
///
/// The row is the durable accounting unit: the per-creator budget check sums
/// <c>size_bytes</c> over non-<see cref="UploadAssetState.Deleted"/> rows, so
/// releasing a failed upload MUST remove its row (not merely flip state).
/// </summary>
[Table("upload_assets")]
public class UploadAsset : BaseAttributes, INoTenantEntity {
	[Column("relative_path")]
	public required string RelativePath { get; set; }

	[Column("size_bytes")]
	public required long SizeBytes { get; set; }

	[Column("content_type")]
	public required string ContentType { get; set; }

	/// <summary>
	/// Snake_case purpose bucket the bytes were admitted for (e.g.
	/// <c>staff_upload</c>). Recorded so per-purpose policy (quota tiers, private
	/// asset prefixes) can layer onto this table without a schema change.
	/// </summary>
	[Column("purpose")]
	public required string Purpose { get; set; }

	[Column("created_by_user_id")]
	public required Guid CreatedByUserId { get; set; }

	[JsonIgnore]
	public Users.Entities.User CreatedByUser {
		get { return RequiredNavigation.Get(_createdByUser, nameof(UploadAsset), nameof(CreatedByUser)); }
		set { _createdByUser = value; }
	}
	private Users.Entities.User? _createdByUser;

	[Column("state")]
	public UploadAssetState State { get; set; } = UploadAssetState.Reserved;

	[Column("reference_count")]
	public int ReferenceCount { get; set; }

	/// <summary>
	/// Earliest instant the sweeper may physically delete the blob. Set when the
	/// asset transitions to <see cref="UploadAssetState.Orphaned"/>; null while any
	/// earlier state holds. The sweeper additionally rechecks
	/// <see cref="ReferenceCount"/> == 0 at delete time, closing the TOCTOU race.
	/// </summary>
	[Column("delete_not_before")]
	public DateTime? DeleteNotBefore { get; set; }
}

/// <summary>
/// Upload asset lifecycle. Numeric values are stored; gaps leave room for future
/// states without renumbering (same convention as <c>PostStatus</c>).
/// </summary>
public enum UploadAssetState {
	Reserved = 10,
	Stored = 20,
	Referenced = 30,
	Orphaned = 40,
	Deleted = 50,
}
