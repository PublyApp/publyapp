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

	/// <summary>
	/// Maps a domain <see cref="DerivedPostStatus"/> to its contract enum shape.
	/// The contract enum's C# member names match the wire snake_case values exactly,
	/// so the per-enum JsonStringEnumConverter serializes them correctly (#1521).
	/// </summary>
	public static DerivedPostContractStatus ToContract(DerivedPostStatus status) {
		return status switch {
			DerivedPostStatus.Draft => DerivedPostContractStatus.draft,
			DerivedPostStatus.Scheduled => DerivedPostContractStatus.scheduled,
			DerivedPostStatus.Published => DerivedPostContractStatus.published,
			DerivedPostStatus.Partial => DerivedPostContractStatus.partial,
			DerivedPostStatus.Failed => DerivedPostContractStatus.failed,
			_ => throw new ArgumentOutOfRangeException(
				nameof(status), status, "Unhandled DerivedPostStatus"
			),
		};
	}
}

public enum DerivedPostStatus {
	Draft = 10,
	Scheduled = 20,
	Published = 30,
	Partial = 40,
	Failed = 50,
}
