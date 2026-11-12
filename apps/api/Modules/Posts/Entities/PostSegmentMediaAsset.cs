using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Tenants.Entities;

namespace PublyApp.Api.Modules.Posts.Entities;

/// <summary>
/// One image attached to a FOLLOW-UP segment of a thread (#2181), up to the registry cap,
/// ordered by <see cref="Position"/> (0-based, contiguous among live rows of the segment).
/// Its own table on purpose: an older app version that knows only <c>post_media_assets</c>
/// never sees these rows as the post's images (expand/contract safe). The blob lives in the
/// shared uploads pipeline exactly like <see cref="PostMediaAsset"/>.
/// </summary>
[Table("post_segment_media_assets")]
public class PostSegmentMediaAsset : BaseAttributes, ITenantEntity, IPostImage {
	private Tenant? _Tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public Tenant Tenant {
		get { return RequiredNavigation.Get(this._Tenant, nameof(PostSegmentMediaAsset), nameof(this.Tenant)); }
		set { this._Tenant = value; }
	}

	[Column("post_id")]
	public required Guid PostId { get; set; }
	[JsonIgnore]
	public Post Post {
		get { return RequiredNavigation.Get(this._Post, nameof(PostSegmentMediaAsset), nameof(this.Post)); }
		set { this._Post = value; }
	}
	private Post? _Post;

	[Column("segment_id")]
	public required Guid SegmentId { get; set; }

	/// <summary>0-based display/publish order among the segment's live images.</summary>
	[Column("position")]
	public int Position { get; set; }

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
