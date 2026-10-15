using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Shared read/rule helpers for thread posts (#2171). Static over the context on
/// purpose: domain services never inject other domain services, and these are
/// plain queries the post, schedule and publish paths all need identically.
/// </summary>
public static class ThreadSegments {
	/// <summary>The post's follow-up segment texts (segments 2..N) in order.</summary>
	public static async Task<IReadOnlyList<string>> FollowUpBodiesAsync(
		AppDbContext db,
		Guid postId,
		CancellationToken cancellationToken
	) {
		return await (
			from segment in db.PostSegment.AsNoTracking()
			where segment.PostId == postId && !segment.IsDeleted
			orderby segment.Position
			select segment.Body
		).ToListAsync(cancellationToken);
	}

	/// <summary>
	/// How many leading segments of the post are already published by ANY of its
	/// publications: those are read-only in the editor (the remote records exist).
	/// </summary>
	public static async Task<int> PublishedSegmentCountAsync(
		AppDbContext db,
		Guid postId,
		CancellationToken cancellationToken
	) {
		var perPublication = await (
			from result in db.PublicationSegmentResult.AsNoTracking()
			join publication in db.Publication.AsNoTracking()
				on result.PublicationId equals publication.Id
			where publication.PostId == postId
				&& !publication.IsDeleted
				&& !result.IsDeleted
			group result by result.PublicationId into grouped
			select grouped.Count()
		).ToListAsync(cancellationToken);
		return perPublication.Count == 0 ? 0 : perPublication.Max();
	}

	/// <summary>
	/// Stages copies of the already-published segment results of the latest failed
	/// publication of each (post, account) onto the fresh publications, so
	/// re-issuing a failed thread continues after the last published segment
	/// instead of posting it all again. Nothing is saved here.
	/// </summary>
	public static async Task CarryOverFailedProgressAsync(
		AppDbContext db,
		Guid tenantId,
		Guid postId,
		IReadOnlyList<(Guid PublicationId, Guid SocialAccountId)> fresh,
		CancellationToken cancellationToken
	) {
		var accountIds = fresh.Select(entry => entry.SocialAccountId).ToList();
		var previous = await (
			from result in db.PublicationSegmentResult.AsNoTracking()
			join publication in db.Publication.AsNoTracking()
				on result.PublicationId equals publication.Id
			where publication.PostId == postId
				&& publication.TenantId == tenantId
				&& publication.Status == PublicationStatus.Failed
				&& !publication.IsDeleted
				&& !result.IsDeleted
				&& accountIds.Contains(publication.SocialAccountId)
			select new { publication.SocialAccountId, publication.Id, Result = result }
		).ToListAsync(cancellationToken);

		foreach (var entry in fresh) {
			var best = previous
				.Where(row => row.SocialAccountId == entry.SocialAccountId)
				.GroupBy(row => row.Id)
				.OrderByDescending(group => group.Count())
				.ThenByDescending(group => group.Key)
				.FirstOrDefault();
			if (best is null) {
				continue;
			}

			foreach (var row in best.OrderBy(item => item.Result.SegmentPosition)) {
				db.PublicationSegmentResult.Add(new PublicationSegmentResult {
					TenantId = tenantId,
					PublicationId = entry.PublicationId,
					SegmentPosition = row.Result.SegmentPosition,
					ExternalRecordId = row.Result.ExternalRecordId,
					ExternalCid = row.Result.ExternalCid,
					ExternalUrl = row.Result.ExternalUrl,
				});
			}
		}
	}
}
