using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed record GetRenditionArgs(Guid TenantId, Guid PublicationId);

public sealed record SetRenditionArgs(
	Guid TenantId,
	Guid PublicationId,
	RenditionOverrides Overrides
);

public sealed record ResetRenditionArgs(Guid TenantId, Guid PublicationId);

/// <summary>A publication's overrides next to the content they produce.</summary>
public sealed record RenditionView(
	Guid PublicationId,
	RenditionOverrides Overrides,
	EffectiveContent Effective
);

public abstract record RenditionResult {
	// WasCustomized: a rendition row existed before this call (a reset of nothing is a no-op).
	public sealed record Found(RenditionView View, bool WasCustomized) : RenditionResult;

	// Unknown id, soft-deleted publication or another tenant's row: all 404.
	public sealed record NotFound : RenditionResult;

	// Published, or parked for review because a write may already be on the provider:
	// the content is read-only. Cause is plain words for the problem response.
	public sealed record Locked(string Cause, bool NeedsReview = false) : RenditionResult;

	public sealed record InProgress : RenditionResult;

	// A Failed publication a newer one replaced is history: customize the newer one.
	public sealed record Superseded : RenditionResult;

	// Two writers raced to insert the same rendition row; nothing was written (defensive).
	public sealed record ConcurrentUpdate : RenditionResult;

	// Segments already published by this publication cannot change (#2171).
	public sealed record SegmentsLocked : RenditionResult;

	public sealed record OverridesInvalid(RenditionOverrideFailure Failure) : RenditionResult;

	public sealed record ContentInvalid(PublishContentFailure Failure) : RenditionResult;
}

/// <summary>
/// Reads, sets and resets the per-destination overrides of ONE publication (#2172).
/// Editable while the publication is Scheduled, Paused or Failed (a failed one is fixed
/// by customizing it, then retried); Published is locked and InProgress is refused.
/// Segments the publication already published are locked: their overrides, the media
/// override must stay exactly as stored; a Failed publication a newer one replaced is
/// refused. Writes take the publication row lock (<c>FOR UPDATE</c>) before checking its
/// status, so they serialize with each other and with a retry. A re-issue of the publication
/// locks its source row <c>FOR SHARE</c> before copying the rendition: an edit either lands
/// before the copy or waits and then finds the publication superseded. Nothing here writes status.
/// </summary>
public interface IRenditionService {
	Task<RenditionResult> GetAsync(GetRenditionArgs args, CancellationToken cancellationToken);

	Task<RenditionResult> SetAsync(SetRenditionArgs args, CancellationToken cancellationToken);

	Task<RenditionResult> ResetAsync(ResetRenditionArgs args, CancellationToken cancellationToken);
}

[Service(ServiceLifetime.Scoped)]
public sealed class RenditionService : IRenditionService {
	private readonly AppDbContext _Db;

	public RenditionService(AppDbContext db) {
		this._Db = db;
	}

	public async Task<RenditionResult> GetAsync(
		GetRenditionArgs args,
		CancellationToken cancellationToken
	) {
		var publication = await this._LoadAsync(args.TenantId, args.PublicationId, cancellationToken);
		if (publication is null) {
			return new RenditionResult.NotFound();
		}

		var overrides = await RenditionResolver.LoadOverridesAsync(
			this._Db, args.TenantId, args.PublicationId, cancellationToken
		);
		return await this._FoundAsync(publication, overrides, overrides is not null, cancellationToken);
	}

	public async Task<RenditionResult> SetAsync(
		SetRenditionArgs args,
		CancellationToken cancellationToken
	) {
		await using var transaction =
			await this._Db.Database.BeginTransactionAsync(cancellationToken);
		try {
			// Lock BEFORE reading the status, like PublicationStatusTransitionService.RetryAsync:
			// the status check and the write below then see one consistent publication.
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
				return new RenditionResult.NotFound();
			}

			var publication = await this._LoadAsync(tenantId, publicationId, cancellationToken);
			if (publication is null) {
				return new RenditionResult.NotFound();
			}

			var blocked = await this._BlockedAsync(publication, cancellationToken);
			if (blocked is not null) {
				return blocked;
			}

			var result = await this._ValidateAndWriteAsync(publication, args, cancellationToken);
			if (result is RenditionResult.Found) {
				await transaction.CommitAsync(cancellationToken);
			}

			return result;
		} catch (DbUpdateException ex) when (
			ex.InnerException is Npgsql.PostgresException {
				SqlState: "23505",
				ConstraintName: "ux_renditions_publication_id",
			}
		) {
			// Defensive fallback only: every writer of a rendition row holds the publication
			// row lock, so two first writes cannot race to the insert. If one ever does,
			// nothing was written and the caller is told to reload instead of retrying.
			await transaction.RollbackAsync(cancellationToken);
			this._Db.ChangeTracker.Clear();
			return new RenditionResult.ConcurrentUpdate();
		}
	}

	private async Task<RenditionResult> _ValidateAndWriteAsync(
		Publication publication,
		SetRenditionArgs args,
		CancellationToken cancellationToken
	) {
		var post = await this._Db.Post.SingleAsync(
			candidate => candidate.Id == publication.PostId, cancellationToken
		);
		var source = await RenditionResolver.LoadSourceAsync(this._Db, post, cancellationToken);
		var account = await this._Db.SocialAccount
			.AsNoTracking()
			.FirstOrDefaultAsync(
				candidate => candidate.Id == publication.SocialAccountId, cancellationToken
			);

		var overrideFailure = RenditionWire.Validate(source, args.Overrides);
		if (overrideFailure is not null) {
			return new RenditionResult.OverridesInvalid(overrideFailure with {
				Destination = account?.DisplayHandle,
				SocialAccountId = publication.SocialAccountId,
			});
		}

		if (account is not null) {
			var contentFailure = PublishValidationService.ValidateDestination(
				RenditionResolver.Resolve(source, args.Overrides), account
			);
			if (contentFailure is not null) {
				return new RenditionResult.ContentInvalid(contentFailure);
			}
		}

		var row = await this._Db.Rendition.FirstOrDefaultAsync(
			candidate => candidate.PublicationId == args.PublicationId, cancellationToken
		);
		var wasCustomized = row is not null;
		var current = row is null ? RenditionOverrides.None : RenditionOverrides.FromRow(row);
		var published = await RenditionService._PublishedCountAsync(
			this._Db, args.PublicationId, cancellationToken
		);
		if (current.ChangesPublishedSegments(args.Overrides, published)) {
			return new RenditionResult.SegmentsLocked();
		}

		if (args.Overrides.IsEmpty) {
			// Nothing is overridden any more: no row means "inherit everything".
			if (row is not null) {
				_ = await this._DeleteRowAsync(args.TenantId, args.PublicationId, cancellationToken);
			}

			return await this._FoundAsync(publication, null, wasCustomized, cancellationToken);
		}

		if (row is null) {
			row = new Rendition { TenantId = args.TenantId, PublicationId = args.PublicationId };
			this._Db.Rendition.Add(row);
		}

		args.Overrides.WriteTo(row);
		await this._Db.SaveChangesAsync(cancellationToken);
		return await this._FoundAsync(publication, args.Overrides, wasCustomized, cancellationToken);
	}

	public async Task<RenditionResult> ResetAsync(
		ResetRenditionArgs args,
		CancellationToken cancellationToken
	) {
		// Same checks as a PUT of nothing: the shared content must still fit the destination.
		return await this.SetAsync(
			new SetRenditionArgs(args.TenantId, args.PublicationId, RenditionOverrides.None),
			cancellationToken
		);
	}

	private async Task<Publication?> _LoadAsync(
		Guid tenantId,
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		return await this._Db.Publication
			.AsNoTracking()
			.FirstOrDefaultAsync(
				candidate => candidate.Id == publicationId
					&& candidate.TenantId == tenantId
					&& !candidate.IsDeleted,
				cancellationToken
			);
	}

	private async Task<RenditionResult?> _BlockedAsync(
		Publication publication,
		CancellationToken cancellationToken
	) {
		if (publication.FailureCategory == PublicationFailureCategory.NeedsReview) {
			return new RenditionResult.Locked(
				"This publication may already be on the provider, so its content cannot "
				+ "change. Check the profile, then mark it published or retry.",
				NeedsReview: true
			);
		}

		if (publication.Status == PublicationStatus.Published) {
			return new RenditionResult.Locked(
				"This publication is already published; its content can no longer be customized."
			);
		}

		if (publication.Status == PublicationStatus.InProgress) {
			return new RenditionResult.InProgress();
		}

		// Only a Failed row can be replaced by a newer one for the same post and account.
		if (publication.Status == PublicationStatus.Failed
			&& await this._Db.Publication.AsNoTracking().AnyAsync(
				PublicationSupersession.Supersedes(publication), cancellationToken
			)) {
			return new RenditionResult.Superseded();
		}

		return null;
	}

	// A rendition row is hard-deleted (never soft-deleted), so the unique index holds.
	private async Task<int> _DeleteRowAsync(
		Guid tenantId,
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		return await this._Db.Rendition
			.Where(candidate => candidate.PublicationId == publicationId
				&& candidate.TenantId == tenantId)
			.ExecuteDeleteAsync(cancellationToken);
	}

	private static async Task<int> _PublishedCountAsync(
		AppDbContext db,
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		return await db.PublicationSegmentResult.CountAsync(
			result => result.PublicationId == publicationId && !result.IsDeleted,
			cancellationToken
		);
	}

	private async Task<RenditionResult> _FoundAsync(
		Publication publication,
		RenditionOverrides? overrides,
		bool wasCustomized,
		CancellationToken cancellationToken
	) {
		var post = await this._Db.Post.AsNoTracking().SingleAsync(
			candidate => candidate.Id == publication.PostId, cancellationToken
		);
		var source = await RenditionResolver.LoadSourceAsync(this._Db, post, cancellationToken);
		return new RenditionResult.Found(new RenditionView(
			publication.GetRequiredId(),
			overrides ?? RenditionOverrides.None,
			RenditionResolver.Resolve(source, overrides)
		), wasCustomized);
	}
}
