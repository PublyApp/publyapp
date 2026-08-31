using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;

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
	public required PublicationContractStatus Status { get; init; }
	public required Guid SocialAccountId { get; init; }
	public required string AccountLabel { get; init; }
	public string? ExternalUrl { get; init; }
	public string? LastError { get; init; }
	public required DateTime UpdatedAt { get; init; }
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
	private const int ExcerptLength = 280;

	private readonly AppDbContext _db;

	public PublicationListService(AppDbContext db) {
		_db = db;
	}

	public async Task<FindPublicationsResult> FindForTenantAsync(
		FindPublicationsArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

		var query = _db.Publication
			.AsNoTracking()
			.Where(publication => publication.TenantId == args.TenantId
				&& !publication.IsDeleted);

		if (!string.IsNullOrEmpty(args.Cursor)) {
			if (!Guid.TryParse(args.Cursor, out var cursorId)) {
				return new FindPublicationsResult.CursorNotFound(args.Cursor);
			}

			var cursorRow = await _db.Publication
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
				Data = rows.Select(ToListItem).ToList(),
				NextCursor = nextCursor,
			}
		);
	}

	internal static PublicationListItem ToListItem(PublicationRow row) {
		return new PublicationListItem {
			Id = row.Publication.GetRequiredId(),
			PostId = row.Publication.PostId,
			PostExcerpt = row.PostBody.Length <= ExcerptLength
				? row.PostBody
				: row.PostBody[..ExcerptLength],
			Status = PublicationWire.ToContract(row.Publication.Status),
			SocialAccountId = row.Publication.SocialAccountId,
			AccountLabel = row.AccountHandle,
			ExternalUrl = row.Publication.ExternalUrl,
			LastError = row.Publication.LastError,
			UpdatedAt = row.Publication.UpdatedAt,
		};
	}
}

internal sealed class PublicationRow {
	public required Publication Publication { get; init; }
	public required string PostBody { get; init; }
	public required string AccountHandle { get; init; }
}
