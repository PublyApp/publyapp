using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;

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

/// <summary><paramref name="Category"/> defaults to Unknown when omitted (#647).</summary>
public sealed record MarkPublicationFailedArgs(
	Guid PublicationId,
	Guid TenantId,
	string Cause,
	PublicationFailureCategory? Category = null
);

/// <summary><paramref name="Category"/> defaults to Reconnect when omitted (#647).</summary>
public sealed record MarkPublicationPausedArgs(
	Guid PublicationId,
	Guid TenantId,
	string Cause,
	PublicationFailureCategory? Category = null
);

/// <summary>#647: re-queue a Failed/Paused publication under its existing idempotency key.</summary>
/// <param name="SupersedeUnresolvedAttempts">
/// The user reviewed a needs-review publication and chose to retry (#2176): the
/// unresolved journal rows are closed in the SAME transaction as the move to Scheduled,
/// so no job can see the row re-queued while the journal still blocks it.
/// </param>
public sealed record RetryPublicationArgs(
	Guid PublicationId,
	Guid TenantId,
	bool SupersedeUnresolvedAttempts = false
);

public enum RetryTransitionResult {
	/// <summary>Re-queued: Scheduled, due now, attempt counter reset.</summary>
	Retried,
	/// <summary>Absent, soft-deleted or in another tenant.</summary>
	NotFound,
	/// <summary>Not Failed/Paused (e.g. a concurrent retry already re-queued it).</summary>
	NotRetryable,
	/// <summary>A newer live publication already holds the (post, account) pair.</summary>
	PairOccupied,
}

/// <summary>#2176: the user confirmed a needs-review publication is on the provider.</summary>
public sealed record MarkPublicationReviewedPublishedArgs(Guid PublicationId, Guid TenantId);

public enum ReviewedPublishedResult {
	Published,
	NotFound,
	/// <summary>Not a Paused needs-review publication (already resolved or never ambiguous).</summary>
	NotNeedsReview,
}

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

	public Task<ReviewedPublishedResult> MarkReviewedPublishedAsync(
		MarkPublicationReviewedPublishedArgs args,
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

	public Task<RetryTransitionResult> RetryAsync(
		RetryPublicationArgs args,
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
	private static readonly Dictionary<PublicationStatus, PublicationStatus[]> _AllowedSources =
		new() {
			[PublicationStatus.InProgress] = [
				PublicationStatus.Scheduled,
				PublicationStatus.InProgress,
				PublicationStatus.Paused,
			],
			// Paused: the user resolved a needs-review publication as published (#2176).
			[PublicationStatus.Published] = [PublicationStatus.InProgress, PublicationStatus.Paused],
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

	private readonly AppDbContext _Db;

	public PublicationStatusTransitionService(AppDbContext db) {
		this._Db = db;
	}

	public async Task<bool> MarkInProgressAsync(
		MarkPublicationInProgressArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await this._LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.InProgress);
		publication.Attempts += 1;
		publication.Status = PublicationStatus.InProgress;
		publication.LastError = null;
		publication.FailureCategory = null;
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
		await this._Db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task<bool> MarkPublishedAsync(
		MarkPublicationPublishedArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await this._LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.Published);
		publication.Status = PublicationStatus.Published;
		publication.ExternalRecordId = args.ExternalRecordId;
		publication.ExternalUrl = args.ExternalUrl;
		publication.LastError = null;
		publication.FailureCategory = null;
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
		await this._Db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task<ReviewedPublishedResult> MarkReviewedPublishedAsync(
		MarkPublicationReviewedPublishedArgs args,
		CancellationToken cancellationToken
	) {
		// Locked FOR UPDATE like retry: of a concurrent Retry and Mark exactly one wins.
		await using var transaction =
			await this._Db.Database.BeginTransactionAsync(cancellationToken);
		var (publicationId, tenantId) = (args.PublicationId, args.TenantId);
		var locked = await this._Db.Database
			.SqlQuery<Guid>($"""
				SELECT id AS "Value" FROM publications
				WHERE id = {publicationId} AND tenant_id = {tenantId}
					AND is_deleted = false
				FOR UPDATE
				""")
			.ToListAsync(cancellationToken);
		var publication = locked.Count == 0
			? null
			: await this._LoadAsync(publicationId, tenantId, cancellationToken);
		if (publication is null) {
			await transaction.RollbackAsync(cancellationToken);
			return ReviewedPublishedResult.NotFound;
		}

		if (publication.Status != PublicationStatus.Paused
			|| publication.FailureCategory != PublicationFailureCategory.NeedsReview) {
			await transaction.RollbackAsync(cancellationToken);
			return ReviewedPublishedResult.NotNeedsReview;
		}

		PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.Published);
		publication.Status = PublicationStatus.Published;
		publication.LastError = null;
		publication.FailureCategory = null;
		// The user confirmed the write landed: the journal rows are delivered.
		await PublicationStatusTransitionService._CloseOpenAttemptsAsync(
			this._Db, publicationId, SubmissionState.Accepted, cancellationToken
		);
		PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
		await this._Db.SaveChangesAsync(cancellationToken);
		await transaction.CommitAsync(cancellationToken);
		return ReviewedPublishedResult.Published;
	}

	// Stages (does not save) the resolution of every unresolved journal row.
	private static async Task _CloseOpenAttemptsAsync(
		AppDbContext db,
		Guid publicationId,
		SubmissionState state,
		CancellationToken cancellationToken
	) {
		var open = await db.PublishAttempt
			.Where(attempt => attempt.PublicationId == publicationId
				&& !attempt.IsDeleted
				&& (attempt.SubmissionState == SubmissionState.NotSent
					|| attempt.SubmissionState == SubmissionState.Unknown))
			.ToListAsync(cancellationToken);
		foreach (var attempt in open) {
			attempt.SubmissionState = state;
		}
	}

	public async Task<bool> MarkFailedAsync(
		MarkPublicationFailedArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await this._LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.Failed);
		var category = args.Category ?? PublicationFailureCategory.Unknown;
		publication.Status = PublicationStatus.Failed;
		publication.FailureCategory = category;
		publication.LastError = PublicationFailureCategoryWire.CauseOrGeneric(args.Cause, category);
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
		await this._Db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task<bool> MarkPausedAsync(
		MarkPublicationPausedArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await this._LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.Paused);
		var category = args.Category ?? PublicationFailureCategory.Reconnect;
		publication.Status = PublicationStatus.Paused;
		publication.FailureCategory = category;
		publication.LastError = PublicationFailureCategoryWire.CauseOrGeneric(args.Cause, category);
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
		await this._Db.SaveChangesAsync(cancellationToken);
		return true;
	}

	/// <summary>
	/// Stages the future-schedule move shared by the reschedule methods: validates
	/// the transition, sets the new instant/zone pair, and clears the external
	/// publish state. Callers keep their own stamp/save policy (#1446).
	/// </summary>
	private static void _StageReschedule(
		Publication publication,
		DateTime scheduledAtUtc,
		string scheduledTimeZone
	) {
		PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.Scheduled);
		publication.Status = PublicationStatus.Scheduled;
		publication.ScheduledAtUtc = scheduledAtUtc;
		publication.ScheduledTimeZone = scheduledTimeZone;
		publication.LastError = null;
		publication.FailureCategory = null;
		publication.ExternalRecordId = null;
		publication.ExternalUrl = null;
	}

	public async Task<bool> RescheduleToNowAsync(
		ReschedulePublicationToNowArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await this._LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		PublicationStatusTransitionService._StageReschedule(
			publication,
			DateTime.UtcNow,
			publication.ScheduledTimeZone
		);
		// IdempotencyKey is deliberately NOT regenerated: the same publication keeps
		// its key across retries so Bluesky dedup survives a reschedule.
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
		await this._Db.SaveChangesAsync(cancellationToken);
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
		var publication = await this._LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
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

		PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.Scheduled);
		publication.Status = PublicationStatus.Scheduled;
		publication.LastError = null;
		publication.FailureCategory = null;
		// #1446: legalise exactly this save's Status writes (one grant, one save).
		PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
		await this._Db.SaveChangesAsync(cancellationToken);
		return true;
	}

	/// <summary>
	/// #647 retry: Failed/Paused → Scheduled due now, attempt counter reset, the
	/// IdempotencyKey and any stored segment results untouched (a provider that
	/// already accepted the first attempt dedups instead of double-posting). The
	/// previous cause and category stay until the new attempt starts
	/// (<see cref="MarkInProgressAsync"/> clears them). The row is locked FOR UPDATE
	/// first, so of two concurrent retries exactly one wins and the other reads the
	/// re-queued status and is refused.
	/// </summary>
	public async Task<RetryTransitionResult> RetryAsync(
		RetryPublicationArgs args,
		CancellationToken cancellationToken
	) {
		await using var transaction =
			await this._Db.Database.BeginTransactionAsync(cancellationToken);
		try {
			var (publicationId, tenantId) = (args.PublicationId, args.TenantId);
			var locked = await this._Db.Database
				.SqlQuery<Guid>($"""
					SELECT id AS "Value" FROM publications
					WHERE id = {publicationId} AND tenant_id = {tenantId}
						AND is_deleted = false
					FOR UPDATE
					""")
				.ToListAsync(cancellationToken);
			if (locked.Count == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return RetryTransitionResult.NotFound;
			}

			var publication = await this._LoadAsync(publicationId, tenantId, cancellationToken);
			if (publication is null) {
				await transaction.RollbackAsync(cancellationToken);
				return RetryTransitionResult.NotFound;
			}

			if (publication.Status is not (PublicationStatus.Failed or PublicationStatus.Paused)) {
				await transaction.RollbackAsync(cancellationToken);
				return RetryTransitionResult.NotRetryable;
			}

			PublicationStatusTransitionService._TransitionOrThrow(publication.Status, PublicationStatus.Scheduled);
			publication.Status = PublicationStatus.Scheduled;
			publication.ScheduledAtUtc = DateTime.UtcNow;
			publication.Attempts = 0;
			if (args.SupersedeUnresolvedAttempts) {
				await PublicationStatusTransitionService._CloseOpenAttemptsAsync(
					this._Db, publicationId, SubmissionState.Superseded, cancellationToken
				);
			}

			// #1446: legalise exactly this save's Status writes (one grant, one save).
			PublicationStatusWriteGuard.StampForStatusWrite(this._Db);
			await this._Db.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			return RetryTransitionResult.Retried;
		} catch (DbUpdateException ex) when (
			ex.InnerException is Npgsql.PostgresException {
				SqlState: "23505",
				ConstraintName: "ux_publications_post_account",
			}
		) {
			// A fresh publish-now took the pair while this row sat Failed (Failed
			// rows release the partial unique index).
			await transaction.RollbackAsync(cancellationToken);
			this._Db.ChangeTracker.Clear();
			return RetryTransitionResult.PairOccupied;
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	/// <summary>D3 Task 2: replace the schedule pair on a Scheduled/Paused publication.</summary>
	public async Task<bool> RescheduleToFutureAsync(
		ReschedulePublicationToFutureArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await this._LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
		if (publication is null) {
			return false;
		}

		PublicationStatusTransitionService._StageReschedule(
			publication,
			args.Schedule.ScheduledAtUtc,
			args.Schedule.ScheduledTimeZone
		);
		// Same doctrine as RescheduleToNowAsync: IdempotencyKey is preserved so the
		// remote dedup key survives the reschedule.
		await this._Db.SaveChangesAsync(cancellationToken);
		return true;
	}

	private async Task<Publication?> _LoadAsync(
		Guid publicationId,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		return await this._Db.Publication.SingleOrDefaultAsync(
			publication => publication.Id == publicationId
				&& publication.TenantId == tenantId
				&& !publication.IsDeleted,
			cancellationToken
		);
	}

	private static void _TransitionOrThrow(
		PublicationStatus from,
		PublicationStatus to
	) {
		if (!PublicationStatusTransitionService._AllowedSources.TryGetValue(to, out var sources)
			|| !sources.Contains(from)) {
			throw new InvalidOperationException(
				$"Illegal publication transition {from} → {to}; status changes must go "
					+ "through PublicationStatusTransitionService."
			);
		}
	}
}
