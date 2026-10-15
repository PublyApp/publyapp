using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Tenants.Entities;

namespace PublyApp.Api.Modules.Posts.Entities;

/// <summary>
/// One FOLLOW-UP segment of a thread post (#2171). Segment 1 is always
/// <see cref="Post.Body"/> (plus the post's images), so a post without rows here
/// is a plain single-segment post and nothing about it changes. A row at
/// <see cref="Position"/> p (1-based among the follow-ups) is segment p + 1 and
/// publishes as a reply to the segment before it. Text only in v1: images belong
/// to the first segment.
/// </summary>
[Table("post_segments")]
public class PostSegment : BaseAttributes, ITenantEntity {
	private Tenant? _Tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public Tenant Tenant {
		get { return RequiredNavigation.Get(this._Tenant, nameof(PostSegment), nameof(this.Tenant)); }
		set { this._Tenant = value; }
	}

	[Column("post_id")]
	public required Guid PostId { get; set; }
	[JsonIgnore]
	public Post Post {
		get { return RequiredNavigation.Get(this._Post, nameof(PostSegment), nameof(this.Post)); }
		set { this._Post = value; }
	}
	private Post? _Post;

	/// <summary>1-based order among the follow-up segments (segment number - 1).</summary>
	[Column("position")]
	public int Position { get; set; }

	[Column("body")]
	public required string Body { get; set; }
}
