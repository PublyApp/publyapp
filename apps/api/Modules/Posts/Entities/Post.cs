using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Posts.Entities;

[Table("posts")]
public class Post : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(_tenant, nameof(Post), nameof(Tenant)); }
		set { _tenant = value; }
	}

	[Column("project_id")]
	public Guid? ProjectId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Projects.Entities.Project? Project { get; set; }

	[Column("body")]
	public required string Body { get; set; }

	[Column("status")]
	// Publishing/scheduling lifecycle. Removing a post uses soft-delete audit
	// fields, not a terminal status; scheduling/publishing flows ship later.
	public PostStatus Status { get; set; } = PostStatus.Draft;

	[Column("created_by_user_id")]
	public required Guid CreatedByUserId { get; set; }
	[JsonIgnore]
	public User CreatedByUser {
		get { return RequiredNavigation.Get(_createdByUser, nameof(Post), nameof(CreatedByUser)); }
		set { _createdByUser = value; }
	}
	private User? _createdByUser;
}

/// <summary>
/// Post lifecycle. Draft is the only state this packet writes; Scheduled and
/// Published exist so the model can carry the later publishing waves without a
/// second enum migration.
/// </summary>
public enum PostStatus {
	Draft = 10,
	Scheduled = 20,
	Published = 30,
}

public static class PostWire {
	public static string FormatStatus(PostStatus status) {
		return status switch {
			PostStatus.Draft => "draft",
			PostStatus.Scheduled => "scheduled",
			PostStatus.Published => "published",
			_ => throw new ArgumentOutOfRangeException(nameof(status), status, "Unhandled PostStatus"),
		};
	}

	/// <summary>
	/// Projects the live attached asset into the read-model image shape; null
	/// when the post has no image. URL follows the anonymously-served
	/// <c>/files</c> convention documented on CreateStaffUpload.
	/// </summary>
	public static PostImageReadModel? FormatImage(PostMediaAsset? asset) {
		if (asset is null) {
			return null;
		}
		return new PostImageReadModel {
			Url = $"/files/{asset.RelativePath}",
			AltText = asset.AltText,
			WidthPx = asset.WidthPx,
			HeightPx = asset.HeightPx,
		};
	}

	public static PostStatus? TryParseStatus(string? raw) {
		if (string.IsNullOrWhiteSpace(raw)) {
			return null;
		}
		if (string.Equals(raw, "draft", StringComparison.OrdinalIgnoreCase)) {
			return PostStatus.Draft;
		}
		if (string.Equals(raw, "scheduled", StringComparison.OrdinalIgnoreCase)) {
			return PostStatus.Scheduled;
		}
		if (string.Equals(raw, "published", StringComparison.OrdinalIgnoreCase)) {
			return PostStatus.Published;
		}
		return null;
	}
}
