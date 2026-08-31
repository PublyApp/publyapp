using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Posts.Entities;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// One (post, social account) delivery with its own lifecycle (Epic D §2). Status is
/// written ONLY by PublicationStatusTransitionService — the architecture guard fails
/// on any other writer. The idempotency key is derived deterministically from the row
/// id and rides the row so retries and the Bluesky record key can never disagree.
/// </summary>
[Table("publications")]
public class Publication : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(_tenant, nameof(Publication), nameof(Tenant)); }
		set { _tenant = value; }
	}

	[Column("post_id")]
	public required Guid PostId { get; set; }

	[Column("social_account_id")]
	public required Guid SocialAccountId { get; set; }

	[Column("status")]
	public PublicationStatus Status { get; set; } = PublicationStatus.Scheduled;

	// Schedule value object, mapped as two columns: the exact instant the scheduler
	// claims on and the IANA zone every screen shows.
	[Column("scheduled_at_utc")]
	public DateTime ScheduledAtUtc { get; set; }

	[Column("scheduled_time_zone")]
	public required string ScheduledTimeZone { get; set; }

	// Populated once from the Bluesky create-record response (Epic D §2).
	[Column("external_record_id")]
	public string? ExternalRecordId { get; set; }

	[Column("external_url")]
	public string? ExternalUrl { get; set; }

	// Sanitised, ≤ 2 KB, human-readable failure cause — never empty on Failed/Paused,
	// never a secret, never a stack trace (transparent-failure rule).
	[Column("last_error")]
	public string? LastError { get; set; }

	[Column("attempts")]
	public int Attempts { get; set; }

	// Deterministic from Id (PublicationIdempotencyKey); used as the job enqueue
	// dedup key AND as the Bluesky record key suffix so a retry after a timeout
	// collides instead of duplicating.
	[Column("idempotency_key")]
	public required string IdempotencyKey { get; set; }

	[JsonIgnore]
	public Post Post {
		get { return RequiredNavigation.Get(_post, nameof(Publication), nameof(Post)); }
		set { _post = value; }
	}
	private Post? _post;

	[JsonIgnore]
	public Modules.SocialAccounts.Entities.SocialAccount SocialAccount {
		get {
			return RequiredNavigation.Get(
				_socialAccount, nameof(Publication), nameof(SocialAccount)
			);
		}
		set { _socialAccount = value; }
	}
	private Modules.SocialAccounts.Entities.SocialAccount? _socialAccount;
}

/// <summary>
/// Wire formatting for publication status (snake_case wire values per repo rule).
/// </summary>
public static class PublicationWire {
	/// <summary>
	/// Maps a domain <see cref="PublicationStatus"/> to its contract enum shape.
	/// The contract enum's C# member names match the wire snake_case values exactly,
	/// so the per-enum JsonStringEnumConverter serializes them correctly (#1521).
	/// </summary>
	public static PublicationContractStatus ToContract(PublicationStatus status) {
		return status switch {
			PublicationStatus.Scheduled => PublicationContractStatus.scheduled,
			PublicationStatus.InProgress => PublicationContractStatus.in_progress,
			PublicationStatus.Published => PublicationContractStatus.published,
			PublicationStatus.Failed => PublicationContractStatus.failed,
			PublicationStatus.Paused => PublicationContractStatus.paused,
			_ => throw new ArgumentOutOfRangeException(
				nameof(status), status, "Unhandled PublicationStatus"
			),
		};
	}

	public static string FormatStatus(PublicationStatus status) {
		return status switch {
			PublicationStatus.Scheduled => "scheduled",
			PublicationStatus.InProgress => "in_progress",
			PublicationStatus.Published => "published",
			PublicationStatus.Failed => "failed",
			PublicationStatus.Paused => "paused",
			_ => throw new ArgumentOutOfRangeException(
				nameof(status), status, "Unhandled PublicationStatus"
			),
		};
	}
}
