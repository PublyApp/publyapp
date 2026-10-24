using System.Linq.Expressions;

using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// The single definition of "a newer publication replaced this one". A publication is
/// superseded when another row for the same (post, account) was created after it.
/// Soft-deleted rows count too: a cancelled publication that already published thread
/// segments is soft-deleted (#2171/#2180), and treating the older row as live would let
/// it be retried or counted, reposting exactly those segments. Only a Failed row can
/// actually be superseded (a Scheduled/InProgress/Paused/Published row holds the pair
/// through the partial unique index), so callers apply it to Failed rows.
/// </summary>
public static class PublicationSupersession {
	/// <summary>
	/// The predicate over the OTHER rows of the pair, for a loaded
	/// <paramref name="publication"/>: true when that row supersedes it. Translatable by
	/// EF (<c>Any(Supersedes(publication))</c>) and compilable for in-memory use.
	/// </summary>
	public static Expression<Func<Publication, bool>> Supersedes(Publication publication) {
		return other => other.TenantId == publication.TenantId
			&& other.PostId == publication.PostId
			&& other.SocialAccountId == publication.SocialAccountId
			&& other.Id != publication.Id
			&& other.CreatedAt > publication.CreatedAt;
	}

	/// <summary>
	/// In-memory form over every row of the post (soft-deleted included).
	/// </summary>
	public static bool IsSuperseded(
		Publication publication,
		IEnumerable<Publication> rowsOfPost
	) {
		return rowsOfPost.Any(PublicationSupersession.Supersedes(publication).Compile());
	}
}
