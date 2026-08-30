using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
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

public sealed record MarkPublicationScheduledArgs(Guid PublicationId, Guid TenantId);

/// <summary>D3 Task 2: replace the schedule pair on a Scheduled/Paused publication.</summary>
public sealed record ReschedulePublicationToFutureArgs(
	Guid PublicationId,
	Guid TenantId,
	PublicationSchedule Schedule
);

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

	public Task<bool> MarkScheduledAsync(
		MarkPublicationScheduledArgs args,
		CancellationToken cancellationToken
	);

	public Task<bool> RescheduleToFutureAsync(
		ReschedulePublicationToFutureArgs args,
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
			[PublicationStatus.Paused] = [
				PublicationStatus.InProgress,
				PublicationStatus.Scheduled, // C4: pause-on-account-failure before first run
				PublicationStatus.Paused, // C4: cause refresh (mirrors the Scheduled/Scheduled precedent)
			],
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
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(_db);
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
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(_db);
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
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(_db);
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
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(_db);
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	/// <summary>
	/// Stages the future-schedule move shared by the reschedule methods: validates
	/// the transition, sets the new instant/zone pair, and clears the external
	/// publish state. Callers keep their own stamp/save policy (#1446).
	/// </summary>
	private static void StageReschedule(
		Publication publication,
		DateTime scheduledAtUtc,
		string scheduledTimeZone
	) {
		TransitionOrThrow(publication.Status, PublicationStatus.Scheduled);
		publication.Status = PublicationStatus.Scheduled;
		publication.ScheduledAtUtc = scheduledAtUtc;
		publication.ScheduledTimeZone = scheduledTimeZone;
		publication.LastError = null;
		publication.ExternalRecordId = null;
		publication.ExternalUrl = null;
	}

	public async Task<bool> RescheduleToNowAsync(
		ReschedulePublicationToNowArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		StageReschedule(
			publication,
			DateTime.UtcNow,
			publication.ScheduledTimeZone
		);
		// IdempotencyKey is deliberately NOT regenerated: the same publication keeps
		// its key across retries so Bluesky dedup survives a reschedule.
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(_db);
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	/// <summary>
	/// Resume a paused publication back to <see cref="PublicationStatus.Scheduled"/>
	/// keeping its original instant — unlike <see cref="RescheduleToNowAsync"/>, no
	/// stamp and no external-field wipe, so resumed work never fires late (Epic C4).
	/// </summary>
	public async Task<bool> MarkScheduledAsync(
		MarkPublicationScheduledArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		// Resume is exclusively the paused → scheduled move (C4): the map keeps
		// Scheduled → Scheduled legal for RescheduleToNowAsync, so an
		// already-scheduled row handed here is a caller bug and must be loud.
		if (publication.Status is PublicationStatus.Scheduled) {
			throw new InvalidOperationException(
				"MarkScheduledAsync resumes a paused publication; an already scheduled "
					+ "publication must go through RescheduleToNowAsync instead."
			);
		}

		TransitionOrThrow(publication.Status, PublicationStatus.Scheduled);
		publication.Status = PublicationStatus.Scheduled;
		publication.LastError = null;
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(_db);
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	/// <summary>D3 Task 2: replace the schedule pair on a Scheduled/Paused publication.</summary>
	public async Task<bool> RescheduleToFutureAsync(
		ReschedulePublicationToFutureArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		StageReschedule(
			publication,
			args.Schedule.ScheduledAtUtc,
			args.Schedule.ScheduledTimeZone
		);
		// Same doctrine as RescheduleToNowAsync: IdempotencyKey is preserved so the
		// remote dedup key survives the reschedule.
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
