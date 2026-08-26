using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Tenants.Entities;

namespace PublyApp.Api.Modules.Posts.Entities;

/// <summary>
/// One image attached to a Post (lane 639, epic #629 wave B3). Version 1 allows
/// exactly ONE live image per post; the partial unique index on
/// <c>post_id</c> (WHERE is_deleted = false, see
/// <see cref="PostMediaAssetConfiguration"/>) enforces that invariant in the
/// database while leaving room for multiple images later without a contracting
/// migration — future images relax the index predicate instead of reshaping
/// this table.
///
/// The blob itself lives in the shared uploads pipeline: <see cref="RelativePath"/>
/// points at an <c>UploadAsset</c>-managed file served under <c>/files</c>, and
/// its reference count was acquired BEFORE this row commits (same #807 F5
/// discipline as every other served URL). Deleting the owning post hard-deletes
/// this row and releases that reference inside the same unit of work.
/// </summary>
[Table("post_media_assets")]
public class PostMediaAsset : BaseAttributes, ITenantEntity {
	private Tenant? _tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public Tenant Tenant {
		get { return RequiredNavigation.Get(_tenant, nameof(PostMediaAsset), nameof(Tenant)); }
		set { _tenant = value; }
	}

	[Column("post_id")]
	public required Guid PostId { get; set; }
	[JsonIgnore]
	public Post Post {
		get { return RequiredNavigation.Get(_post, nameof(PostMediaAsset), nameof(Post)); }
		set { _post = value; }
	}
	private Post? _post;

	/// <summary>Storage-relative path owned by the uploads pipeline (blob referenced, never copied).</summary>
	[Column("relative_path")]
	public required string RelativePath { get; set; }

	[Column("content_type")]
	public required string ContentType { get; set; }

	/// <summary>Accessibility text supplied by the user; nullable by design.</summary>
	[Column("alt_text")]
	public string? AltText { get; set; }

	/// <summary>Intrinsic pixel width read from the image header at attach time.</summary>
	[Column("width_px")]
	public int WidthPx { get; set; }

	/// <summary>Intrinsic pixel height read from the image header at attach time.</summary>
	[Column("height_px")]
	public int HeightPx { get; set; }

	[Column("size_bytes")]
	public long SizeBytes { get; set; }

	[Column("uploaded_by_user_id")]
	public required Guid UploadedByUserId { get; set; }
}
