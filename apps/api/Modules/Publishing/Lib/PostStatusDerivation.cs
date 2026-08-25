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
}

public enum DerivedPostStatus {
	Draft = 10,
	Scheduled = 20,
	Published = 30,
	Partial = 40,
	Failed = 50,
}
