using System.Security.Cryptography;
using System.Text;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed record BeginPublishAttemptArgs(
	Guid TenantId,
	Guid PublicationId,
	int SegmentPosition,
	int AttemptNumber,
	string ContentFingerprint,
	string IdempotencyKey
);

public sealed record ResolvePublishAttemptArgs(
	Guid AttemptId,
	SubmissionState State,
	string? RecordId,
	string? RecordUrl
);

/// <summary>
/// The write that may have been applied: the newest unresolved journal row of a
/// publication plus when its position was FIRST attempted (a provider's dedupe
/// window runs from the first send, not from the latest one).
/// </summary>
public sealed record UnresolvedAttempt(
	Guid Id,
	int SegmentPosition,
	string IdempotencyKey,
	DateTime FirstAttemptAtUtc
);

/// <summary>
/// The write-attempt journal (#2176). <see cref="BeginAsync"/> COMMITS the row before
/// the provider is called, so a crash mid-call leaves proof of the attempt.
/// </summary>
public interface IPublishAttemptJournal {
	Task<Guid> BeginAsync(BeginPublishAttemptArgs args, CancellationToken cancellationToken);

	Task ResolveAsync(ResolvePublishAttemptArgs args, CancellationToken cancellationToken);

	Task<UnresolvedAttempt?> FindUnresolvedAsync(
		Guid publicationId,
		CancellationToken cancellationToken
	);

	/// <summary>Closes every unresolved row (reconciled absent, or the user chose to retry).</summary>
	Task SupersedeUnresolvedAsync(Guid publicationId, CancellationToken cancellationToken);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PublishAttemptJournal : IPublishAttemptJournal {
	private readonly AppDbContext _Db;

	public PublishAttemptJournal(AppDbContext db) {
		this._Db = db;
	}

	/// <summary>Hash of the effective text and media ids; the text itself is never kept.</summary>
	public static string Fingerprint(string text, IEnumerable<Guid> mediaIds) {
		var material = text + "\n" + string.Join(",", mediaIds);
		return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material)))
			.ToLowerInvariant();
	}

	public async Task<Guid> BeginAsync(
		BeginPublishAttemptArgs args,
		CancellationToken cancellationToken
	) {
		var attempt = new PublishAttempt {
			TenantId = args.TenantId,
			PublicationId = args.PublicationId,
			SegmentPosition = args.SegmentPosition,
			AttemptNumber = args.AttemptNumber,
			Operation = args.SegmentPosition == 0 ? "create_post" : "create_reply",
			ContentFingerprint = args.ContentFingerprint,
			IdempotencyKey = args.IdempotencyKey,
		};
		this._Db.PublishAttempt.Add(attempt);
		await this._Db.SaveChangesAsync(cancellationToken);
		return attempt.GetRequiredId();
	}

	public async Task ResolveAsync(
		ResolvePublishAttemptArgs args,
		CancellationToken cancellationToken
	) {
		var attempt = await this._Db.PublishAttempt.SingleOrDefaultAsync(
			candidate => candidate.Id == args.AttemptId && !candidate.IsDeleted,
			cancellationToken
		);
		if (attempt is null) {
			return;
		}

		attempt.SubmissionState = args.State;
		attempt.ExternalRecordId = args.RecordId;
		attempt.ExternalUrl = args.RecordUrl;
		await this._Db.SaveChangesAsync(cancellationToken);
	}

	public async Task<UnresolvedAttempt?> FindUnresolvedAsync(
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		var latest = await this._Db.PublishAttempt
			.AsNoTracking()
			.Where(attempt => attempt.PublicationId == publicationId
				&& !attempt.IsDeleted
				&& (attempt.SubmissionState == SubmissionState.NotSent
					|| attempt.SubmissionState == SubmissionState.Unknown))
			.OrderByDescending(attempt => attempt.CreatedAt)
			.FirstOrDefaultAsync(cancellationToken);
		if (latest is null) {
			return null;
		}

		var first = await this._Db.PublishAttempt
			.AsNoTracking()
			.Where(attempt => attempt.PublicationId == publicationId
				&& attempt.SegmentPosition == latest.SegmentPosition
				&& !attempt.IsDeleted)
			.MinAsync(attempt => attempt.CreatedAt, cancellationToken);
		return new UnresolvedAttempt(
			latest.GetRequiredId(), latest.SegmentPosition, latest.IdempotencyKey, first
		);
	}

	public async Task SupersedeUnresolvedAsync(
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		var open = await this._Db.PublishAttempt
			.Where(attempt => attempt.PublicationId == publicationId
				&& !attempt.IsDeleted
				&& (attempt.SubmissionState == SubmissionState.NotSent
					|| attempt.SubmissionState == SubmissionState.Unknown))
			.ToListAsync(cancellationToken);
		foreach (var attempt in open) {
			attempt.SubmissionState = SubmissionState.Superseded;
		}

		await this._Db.SaveChangesAsync(cancellationToken);
	}
}
