using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed record FindPublicationsArgs(
	Guid TenantId,
	string? Cursor,
	int? Limit,
	IReadOnlyList<PublicationStatus>? Statuses
);

/// <summary>History row: one publication with the context History renders.</summary>
public record PublicationListItem {
	public required Guid Id { get; init; }
	public required Guid PostId { get; init; }
	public required string PostExcerpt { get; init; }
	public required string Status { get; init; }
	public required Guid SocialAccountId { get; init; }
	public required string AccountLabel { get; init; }
	public string? ExternalUrl { get; init; }
	public string? LastError { get; init; }
	public required DateTime UpdatedAt { get; init; }
	/// <summary>Failure category wire value on Failed/Paused rows, else null (#647).</summary>
	public string? FailureCategory { get; init; }
	/// <summary>Delivery attempts since the last retry (#647).</summary>
	public int Attempts { get; init; }
	/// <summary>True while the publication's account is Active and usable (#647).</summary>
	public bool AccountUsable { get; init; }
	/// <summary>True when a newer publication exists for the same post and account (#647).</summary>
	public bool Superseded { get; init; }
	/// <summary>Thread segments published so far (0 for a plain post, #2171).</summary>
	public int SegmentsPublished { get; init; }
	/// <summary>Total segments of the post (1 for a plain post).</summary>
	public int SegmentsTotal { get; init; } = 1;
}

public abstract record FindPublicationsResult {
	public sealed record Success(CursorPaginatedResult<PublicationListItem> Data)
		: FindPublicationsResult;

	public sealed record CursorNotFound(string Cursor) : FindPublicationsResult;
}

/// <summary>
/// Keyset (newest-first) history read over publications, joined to post excerpt and
/// account label. Read-only: no status writes — the transition service stays the ONLY
/// writer of Publication.Status.
/// </summary>
public interface IPublicationListService {
	Task<FindPublicationsResult> FindForTenantAsync(
		FindPublicationsArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PublicationListService : IPublicationListService {
	private const int _ExcerptLength = 280;

	private readonly AppDbContext _Db;

	public PublicationListService(AppDbContext db) {
		this._Db = db;
	}

	public async Task<FindPublicationsResult> FindForTenantAsync(
		FindPublicationsArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

		var query = this._Db.Publication
			.AsNoTracking()
			.Where(publication => publication.TenantId == args.TenantId
				&& !publication.IsDeleted);

		if (!string.IsNullOrEmpty(args.Cursor)) {
			if (!Guid.TryParse(args.Cursor, out var cursorId)) {
				return new FindPublicationsResult.CursorNotFound(args.Cursor);
			}

			var cursorRow = await this._Db.Publication
				.AsNoTracking()
				.Where(publication => publication.Id == cursorId
					&& publication.TenantId == args.TenantId)
				.Select(publication => new { publication.UpdatedAt })
				.FirstOrDefaultAsync(cancellationToken);
			if (cursorRow is null) {
				return new FindPublicationsResult.CursorNotFound(args.Cursor);
			}

			var cursorUpdatedAt = cursorRow.UpdatedAt;
			query = query.Where(publication =>
				publication.UpdatedAt < cursorUpdatedAt
				|| (publication.UpdatedAt == cursorUpdatedAt
					&& publication.Id < cursorId));
		}

		if (args.Statuses is not null && args.Statuses.Count > 0) {
			query = query.Where(publication =>
				args.Statuses.Contains(publication.Status));
		}

		var rows = await query
			.OrderByDescending(publication => publication.UpdatedAt)
			.ThenByDescending(publication => publication.Id)
			.Take(effectiveLimit + 1)
			.Select(publication => new PublicationRow {
				Publication = publication,
				PostBody = publication.Post.Body,
				AccountHandle = publication.SocialAccount.DisplayHandle,
				AccountUsable =
					publication.SocialAccount.Status == SocialAccountStatus.Active
					&& !publication.SocialAccount.IsDeleted,
				Superseded = this._Db.Publication.Any(other =>
					other.TenantId == publication.TenantId
					&& other.PostId == publication.PostId
					&& other.SocialAccountId == publication.SocialAccountId
					&& other.Id != publication.Id
					&& other.CreatedAt > publication.CreatedAt),
				SegmentsPublished = this._Db.PublicationSegmentResult.Count(result =>
					result.PublicationId == publication.Id && !result.IsDeleted),
				FollowUpCount = this._Db.PostSegment.Count(segment =>
					segment.PostId == publication.PostId && !segment.IsDeleted),
			})
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (rows.Count > effectiveLimit) {
			rows.RemoveAt(rows.Count - 1);
			nextCursor = rows[^1]
				.Publication
				.GetRequiredId()
				.ToString();
		}

		return new FindPublicationsResult.Success(
			new CursorPaginatedResult<PublicationListItem> {
				Data = rows.Select(PublicationListService.ToListItem).ToList(),
				NextCursor = nextCursor,
			}
		);
	}

	// Rows that failed before categories existed read as Reconnect (Paused) or
	// Unknown (Failed) (#647).
	private static PublicationFailureCategory _EffectiveCategory(Publication publication) {
		return publication.FailureCategory ?? (
			publication.Status == PublicationStatus.Paused
				? PublicationFailureCategory.Reconnect
				: PublicationFailureCategory.Unknown
		);
	}

	private static bool _IsFailureStatus(Publication publication) {
		return publication.Status is PublicationStatus.Failed or PublicationStatus.Paused;
	}

	private static string? _CategoryFor(Publication publication) {
		return PublicationListService._IsFailureStatus(publication)
			? PublicationFailureCategoryWire.Format(PublicationListService._EffectiveCategory(publication))
			: null;
	}

	// Failed/Paused rows never show a blank cause (#2013), even legacy ones.
	private static string? _CauseFor(Publication publication) {
		return PublicationListService._IsFailureStatus(publication)
			? PublicationFailureCategoryWire.CauseOrGeneric(
				publication.LastError, PublicationListService._EffectiveCategory(publication))
			: publication.LastError;
	}

	internal static PublicationListItem ToListItem(PublicationRow row) {
		return new PublicationListItem {
			Id = row.Publication.GetRequiredId(),
			PostId = row.Publication.PostId,
			PostExcerpt = row.PostBody.Length <= PublicationListService._ExcerptLength
				? row.PostBody
				: row.PostBody[..PublicationListService._ExcerptLength],
			Status = PublicationWire.FormatStatus(row.Publication.Status),
			SocialAccountId = row.Publication.SocialAccountId,
			AccountLabel = row.AccountHandle,
			ExternalUrl = row.Publication.ExternalUrl,
			LastError = PublicationListService._CauseFor(row.Publication),
			FailureCategory = PublicationListService._CategoryFor(row.Publication),
			Attempts = row.Publication.Attempts,
			AccountUsable = row.AccountUsable,
			Superseded = row.Superseded,
			UpdatedAt = row.Publication.UpdatedAt,
			SegmentsPublished = row.SegmentsPublished,
			SegmentsTotal = row.FollowUpCount + 1,
		};
	}
}

internal sealed class PublicationRow {
	public bool AccountUsable { get; init; }
	public bool Superseded { get; init; }
	public required Publication Publication { get; init; }
	public required string PostBody { get; init; }
	public required string AccountHandle { get; init; }
	public int SegmentsPublished { get; init; }
	public int FollowUpCount { get; init; }
}
