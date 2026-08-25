using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;

namespace PublyApp.Api.Modules.Publishing.Services;

/// <summary>
/// Contract of the single legal writer of <see cref="Publication.Status"/>.
/// </summary>
public sealed record MarkPublicationInProgressArgs(Guid PublicationId, Guid TenantId);

public sealed record MarkPublicationPublishedArgs(
	Guid PublicationId,
	Guid TenantId,
	string ExternalRecordId,
	string ExternalUrl
);

public sealed record MarkPublicationFailedArgs(
	Guid PublicationId,
	Guid TenantId,
	string Cause
);

public sealed record MarkPublicationPausedArgs(Guid PublicationId, Guid TenantId, string Cause);

public sealed record ReschedulePublicationToNowArgs(Guid PublicationId, Guid TenantId);

/// <summary>
/// Contract of the single legal writer of <see cref="Publication.Status"/>.
/// </summary>
public interface IPublicationStatusTransitionService {
	public Task<bool> MarkInProgressAsync(
		MarkPublicationInProgressArgs args,
		CancellationToken cancellationToken
	);

	public Task<bool> MarkPublishedAsync(
		MarkPublicationPublishedArgs args,
		CancellationToken cancellationToken
	);

	public Task<bool> MarkFailedAsync(
		MarkPublicationFailedArgs args,
		CancellationToken cancellationToken
	);

	public Task<bool> MarkPausedAsync(
		MarkPublicationPausedArgs args,
		CancellationToken cancellationToken
	);

	public Task<bool> RescheduleToNowAsync(
		ReschedulePublicationToNowArgs args,
		CancellationToken cancellationToken
	);
}

/// <summary>
/// The ONLY writer of <see cref="Publication.Status"/> (Epic D §2; enforced by
/// PublicationArchitecture.Spec). Every legal move is a method here; anything else
/// throws. Loads are always tenant-scoped so a foreign tenant's row is invisible,
/// never a 403-style leak. Causes pass through LastErrorSanitiser before storage.
/// </summary>
[Service(ServiceLifetime.Scoped)]
public sealed class PublicationStatusTransitionService : IPublicationStatusTransitionService {
	// Rows of the map: statuses a publication may legally move FROM, keyed by target.
	private static readonly Dictionary<PublicationStatus, PublicationStatus[]> AllowedSources =
		new() {
			[PublicationStatus.InProgress] = [
				PublicationStatus.Scheduled,
				PublicationStatus.InProgress,
				PublicationStatus.Paused,
			],
			[PublicationStatus.Published] = [PublicationStatus.InProgress],
			[PublicationStatus.Failed] = [PublicationStatus.InProgress],
			[PublicationStatus.Paused] = [PublicationStatus.InProgress],
			[PublicationStatus.Scheduled] = [
				PublicationStatus.Scheduled,
				PublicationStatus.Paused,
				PublicationStatus.Failed,
			],
		};

	private readonly AppDbContext _db;

	public PublicationStatusTransitionService(AppDbContext db) {
		_db = db;
	}

	public async Task<bool> MarkInProgressAsync(
		MarkPublicationInProgressArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		TransitionOrThrow(publication.Status, PublicationStatus.InProgress);
		publication.Attempts += 1;
		publication.Status = PublicationStatus.InProgress;
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task<bool> MarkPublishedAsync(
		MarkPublicationPublishedArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		TransitionOrThrow(publication.Status, PublicationStatus.Published);
		publication.Status = PublicationStatus.Published;
		publication.ExternalRecordId = args.ExternalRecordId;
		publication.ExternalUrl = args.ExternalUrl;
		publication.LastError = null;
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task<bool> MarkFailedAsync(
		MarkPublicationFailedArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		TransitionOrThrow(publication.Status, PublicationStatus.Failed);
		publication.Status = PublicationStatus.Failed;
		publication.LastError = LastErrorSanitiser.Sanitize(args.Cause);
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task<bool> MarkPausedAsync(
		MarkPublicationPausedArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		TransitionOrThrow(publication.Status, PublicationStatus.Paused);
		publication.Status = PublicationStatus.Paused;
		publication.LastError = LastErrorSanitiser.Sanitize(args.Cause);
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task<bool> RescheduleToNowAsync(
		ReschedulePublicationToNowArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		TransitionOrThrow(publication.Status, PublicationStatus.Scheduled);
		publication.Status = PublicationStatus.Scheduled;
		publication.ScheduledAtUtc = DateTime.UtcNow;
		publication.LastError = null;
		publication.ExternalRecordId = null;
		publication.ExternalUrl = null;
		// IdempotencyKey is deliberately NOT regenerated: the same publication keeps
		// its key across retries so Bluesky dedup survives a reschedule.
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	private async Task<Publication?> LoadAsync(
		Guid publicationId,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		return await _db.Publication.SingleOrDefaultAsync(
			publication => publication.Id == publicationId
				&& publication.TenantId == tenantId
				&& !publication.IsDeleted,
			cancellationToken
		);
	}

	private static void TransitionOrThrow(
		PublicationStatus from,
		PublicationStatus to
	) {
		if (!AllowedSources.TryGetValue(to, out var sources)
			|| !sources.Contains(from)) {
			throw new InvalidOperationException(
				$"Illegal publication transition {from} → {to}; status changes must go "
					+ "through PublicationStatusTransitionService."
			);
		}
	}
}
