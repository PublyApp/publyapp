using System.Linq.Expressions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// SQL form of <see cref="PostStatusDerivation.Summarize"/> and
/// <see cref="PublicationSupersession"/>, so list surfaces never load every historical row
/// of a post. Same rules: destinations are the post's live publications minus Failed ones a
/// newer row of the same account replaced (soft-deleted newer rows still replace).
/// </summary>
internal static class PostStatusSummaryQuery {
	public static async Task<Dictionary<Guid, PostStatusSummary>> SummarizeAsync(
		AppDbContext db,
		Guid tenantId,
		List<Guid> postIds,
		CancellationToken cancellationToken
	) {
		// Destinations: live rows, minus Failed ones a newer row replaced.
		var notReplaced = PublicationSupersession.IsNotSupersededIn(db.Publication);
		var failed = Expression.Constant(PublicationStatus.Failed);
		var destination = Expression.Lambda<Func<Publication, bool>>(
			Expression.OrElse(
				Expression.NotEqual(
					Expression.Property(notReplaced.Parameters[0], nameof(Publication.Status)),
					failed
				),
				notReplaced.Body
			),
			notReplaced.Parameters
		);

		var groups = await db.Publication
			.AsNoTracking()
			.Where(publication => publication.TenantId == tenantId
				&& postIds.Contains(publication.PostId)
				&& !publication.IsDeleted)
			.Where(destination)
			.GroupBy(publication => publication.PostId)
			.Select(group => new {
				PostId = group.Key,
				Total = group.Count(),
				Failed = group.Count(p => p.Status == PublicationStatus.Failed),
				Published = group.Count(p => p.Status == PublicationStatus.Published),
				Scheduled = group.Count(p => p.Status == PublicationStatus.Scheduled),
			})
			.ToListAsync(cancellationToken);

		return groups.ToDictionary(
			group => group.PostId,
			group => new PostStatusSummary(
				PostStatusDerivation.FromCounts(group.Total, group.Failed, group.Published, group.Scheduled),
				group.Published,
				group.Total
			)
		);
	}

	/// <summary>A post with no destination left: Draft, 0 of 0.</summary>
	public static readonly PostStatusSummary Empty = new(DerivedPostStatus.Draft, 0, 0);

	public static async Task<HashSet<Guid>> SupersededIdsAsync(
		AppDbContext db,
		Guid tenantId,
		List<Guid> publicationIds,
		CancellationToken cancellationToken
	) {
		var ids = await db.Publication
			.AsNoTracking()
			.Where(publication => publication.TenantId == tenantId
				&& publication.Id.HasValue
				&& publicationIds.Contains(publication.Id.Value))
			.Where(PublicationSupersession.IsSupersededIn(db.Publication))
			.Select(publication => publication.Id)
			.ToListAsync(cancellationToken);
		return ids.OfType<Guid>().ToHashSet();
	}
}
