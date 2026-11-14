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
	// THE rule, written once: `other` replaces `publication`. Every other form below derives
	// from it by substitution, so no SQL or in-memory copy can drift.
	private static readonly Expression<Func<Publication, Publication, bool>> _Replaces =
		(other, publication) => other.TenantId == publication.TenantId
			&& other.PostId == publication.PostId
			&& other.SocialAccountId == publication.SocialAccountId
			&& other.Id != publication.Id
			&& other.CreatedAt > publication.CreatedAt;

	private static readonly Func<Publication, Publication, bool> _ReplacesCompiled =
		PublicationSupersession._Replaces.Compile();

	/// <summary>
	/// The predicate over the OTHER rows, for a loaded <paramref name="publication"/>: true
	/// when that row supersedes it. Translatable by EF (<c>Any(Supersedes(publication))</c>).
	/// </summary>
	public static Expression<Func<Publication, bool>> Supersedes(Publication publication) {
		var other = PublicationSupersession._Replaces.Parameters[0];
		var body = new Substitute(
			PublicationSupersession._Replaces.Parameters[1],
			Expression.Constant(publication)
		).Visit(PublicationSupersession._Replaces.Body);
		return Expression.Lambda<Func<Publication, bool>>(body, other);
	}

	/// <summary>
	/// For a query over <paramref name="rows"/>: true when some row of the same pair
	/// supersedes the candidate (a correlated EXISTS). EF cannot call
	/// <see cref="Supersedes"/> inside a nested lambda over the range variable, so the
	/// outer predicate is assembled here from the same expression.
	/// </summary>
	public static Expression<Func<Publication, bool>> IsSupersededIn(IQueryable<Publication> rows) {
		var candidate = Expression.Parameter(typeof(Publication), "candidate");
		var other = PublicationSupersession._Replaces.Parameters[0];
		var body = new Substitute(PublicationSupersession._Replaces.Parameters[1], candidate)
			.Visit(PublicationSupersession._Replaces.Body);
		var any = Expression.Call(
			typeof(Queryable),
			nameof(Queryable.Any),
			[typeof(Publication)],
			rows.Expression,
			Expression.Quote(Expression.Lambda<Func<Publication, bool>>(body, other))
		);
		return Expression.Lambda<Func<Publication, bool>>(any, candidate);
	}

	/// <summary>The negation of <see cref="IsSupersededIn"/>, for <c>Where</c>.</summary>
	public static Expression<Func<Publication, bool>> IsNotSupersededIn(IQueryable<Publication> rows) {
		var superseded = PublicationSupersession.IsSupersededIn(rows);
		return Expression.Lambda<Func<Publication, bool>>(
			Expression.Not(superseded.Body), superseded.Parameters
		);
	}

	/// <summary>In-memory form over every row of the post (soft-deleted included).</summary>
	public static bool IsSuperseded(
		Publication publication,
		IEnumerable<Publication> rowsOfPost
	) {
		return rowsOfPost.Any(other =>
			PublicationSupersession._ReplacesCompiled(other, publication));
	}

	private sealed class Substitute(ParameterExpression from, Expression to) : ExpressionVisitor {
		protected override Expression VisitParameter(ParameterExpression node) {
			return node == from ? to : node;
		}
	}
}
