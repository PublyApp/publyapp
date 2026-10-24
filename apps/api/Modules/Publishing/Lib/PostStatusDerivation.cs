using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Post status DERIVED from its publications (Epic D §2): draft if none; failed if
/// any failed; published if all published; scheduled if all scheduled; partial if
/// mixed. Deliberately a SEPARATE enum from Posts' stored PostStatus: B2 stores
/// Post.Status and D1 changes nothing about it — D2 switches the read paths to this
/// derivation and retires the stored column writes (stated in the PR body).
/// </summary>
public static class PostStatusDerivation {
	/// <summary>
	/// The post's destinations: its live (not soft-deleted) publications, minus Failed
	/// publications a newer one replaced (<see cref="PublicationSupersession"/>) — a
	/// re-issued pair counts once, as its newest row. <paramref name="publications"/> is
	/// EVERY row of the post, soft-deleted included, because a soft-deleted row still
	/// supersedes an older failure.
	/// </summary>
	public static IReadOnlyList<Publication> Destinations(
		IReadOnlyCollection<Publication> publications
	) {
		return publications
			.Where(publication => !publication.IsDeleted)
			.Where(publication => publication.Status != PublicationStatus.Failed
				|| !PublicationSupersession.IsSuperseded(publication, publications))
			.ToList();
	}

	/// <summary>
	/// Derived status plus the published/destination counts, all over
	/// <see cref="Destinations"/>. The status stays <c>failed</c> when any destination
	/// failed, even if others published: the counts carry the detail ("1/2 published").
	/// </summary>
	public static PostStatusSummary Summarize(IReadOnlyCollection<Publication> publications) {
		var destinations = PostStatusDerivation.Destinations(publications);
		return new PostStatusSummary(
			PostStatusDerivation.Derive(destinations),
			destinations.Count(publication => publication.Status == PublicationStatus.Published),
			destinations.Count
		);
	}

	public static DerivedPostStatus Derive(IReadOnlyCollection<Publication> publications) {
		if (publications.Count == 0) {
			return DerivedPostStatus.Draft;
		}

		if (publications.Any(p => p.Status == PublicationStatus.Failed)) {
			return DerivedPostStatus.Failed;
		}

		if (publications.All(p => p.Status == PublicationStatus.Published)) {
			return DerivedPostStatus.Published;
		}

		if (publications.All(p => p.Status == PublicationStatus.Scheduled)) {
			return DerivedPostStatus.Scheduled;
		}

		return DerivedPostStatus.Partial;
	}

	/// <summary>
	/// Wire formatting for the DERIVED post status (snake_case wire values per
	/// repo rule). Closed switch: a new <see cref="DerivedPostStatus"/> member
	/// without a wire value fails loudly at runtime instead of emitting a
	/// <c>ToString().ToLowerInvariant()</c> guess (round-2 finding: the queue
	/// contract carried a PascalCase <c>partial</c> beside the snake_case
	/// publication <c>status</c>).
	/// </summary>
	public static string FormatPostStatus(DerivedPostStatus status) {
		return status switch {
			DerivedPostStatus.Draft => "draft",
			DerivedPostStatus.Scheduled => "scheduled",
			DerivedPostStatus.Published => "published",
			DerivedPostStatus.Partial => "partial",
			DerivedPostStatus.Failed => "failed",
			_ => throw new ArgumentOutOfRangeException(
				nameof(status), status, "Unhandled DerivedPostStatus"
			),
		};
	}
}

/// <summary>A post's derived status with its published/destination counts.</summary>
public sealed record PostStatusSummary(
	DerivedPostStatus Status,
	int PublishedCount,
	int DestinationCount
);

public enum DerivedPostStatus {
	Draft = 10,
	Scheduled = 20,
	Published = 30,
	Partial = 40,
	Failed = 50,
}
