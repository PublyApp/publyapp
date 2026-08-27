using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Uploads.Services;
using PublyApp.Api.Modules.Uploads.Entities;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Attaches ONE image to a post (multipart <c>file</c> field). Type and
/// dimensions come from server-side header parsing (never client claims);
/// bytes pass the durable upload-admission pipeline (#807 F1). The blob
/// reference is acquired HERE before the post-owned asset row commits, and a
/// replaced image's reference is released HERE after that commit (#807 F5) —
/// the handler owns the coordination, the service only persists rows.
/// Replacing an existing image releases the old reference in the same unit of
/// work — no orphans. A post owns at most one live image (partial unique index).
/// </summary>
public sealed class AttachPostImageForTenant {
	public static async Task<Results<
		Created<PostImageAttached>,
		AppBadRequestHttpResult,
		AppValidationProblemHttpResult,
		AppNotFoundHttpResult,
		AppPayloadTooLargeHttpResult,
		AppTooManyRequestsHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostMediaAssetService assetService,
		[FromServices] IUploadAssetReferenceService uploadReferences,
		[FromServices] IUploadAdmissionService uploadAdmissionService,
		[FromServices] IFileStorage fileStorage,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<AttachPostImageForTenant> logger,
		IFormFile? file,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		if (!Guid.TryParse(postId, out var postIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid postId",
				ResponseKeys.MalformedId
			);
		}

		// Tenant-scoped ownership read: a foreign-tenant post is invisible
		// (404), never forbidden — the isolation point the mutation proof
		// targets by removing the TenantId filter.
		var post = await assetService.FindOwnedPostAsync(
			tenantId, postIdGuid, cancellationToken
		);
		if (post is null) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.PostNotFound
			);
		}

		if (file is null || file.Length == 0) {
			return ValidationFailure(
				"An image file is required",
				ResponseKeys.PostImageRequired
			);
		}
		var maxBytes = AppEnvironment.Instance.UPLOAD_MAX_BYTES;
		if (file.Length > maxBytes) {
			return TypedProblems.PayloadTooLarge(
				$"Image exceeds the maximum size of {maxBytes} bytes",
				ResponseKeys.PostImageTooLarge
			);
		}

		// file.OpenReadStream() is seekable (ASP.NET Core buffers the multipart
		// section before the handler runs): inspect headers, then rewind so the
		// storage writer sees the full payload.
		await using var uploadStream = file.OpenReadStream();
		var inspection = ImageInspector.Inspect(uploadStream);
		if (inspection is ImageInspector.UnknownType) {
			return ValidationFailure(
				"File must be a PNG, JPEG, WEBP, or GIF image",
				ResponseKeys.PostImageUnsupportedType
			);
		}
		if (inspection is ImageInspector.DegenerateDimensions) {
			// A recognized image type declaring a zero/negative canvas: name the
			// DIMENSIONS as the cause, not the (known) type.
			return ValidationFailure(
				"Image dimensions are invalid",
				ResponseKeys.PostImageDimensionsInvalid
			);
		}
		var inspected =
			(ImageInspector.Inspected)inspection;
		uploadStream.Position = 0;

		// Durable admission (#807 F1): reserve bytes and create the Reserved
		// asset row in ONE transaction BEFORE opening the destination file.
		await using var admissionScope = await uploadAdmissionService
			.BeginReservationAsync(
				account.UserId,
				file.Length,
				UploadAdmissionService.StaffUploadPurpose,
				cancellationToken
			);

		if (admissionScope.Admission is UploadAdmissionResult.Rejected rejected) {
			// Transparent failure cause (owner product rule): name which budget
			// ran out and by how much, in plain words.
			var scopeName = rejected.ExhaustedScope switch {
				UploadBudgetScope.Global => "the shared storage budget",
				UploadBudgetScope.CreatorUser => "your personal storage budget",
				_ => throw new ArgumentOutOfRangeException(
					nameof(rejected), rejected.ExhaustedScope, "Unhandled UploadBudgetScope"
				),
			};
			var humanRequested = FormatBytes(rejected.RequestedBytes);
			var humanAvailable = FormatBytes(Math.Max(0, rejected.AvailableBytes));
			return TypedProblems.TooManyRequests(
				$"Image refused: {scopeName} has {humanAvailable} free, which is less "
				+ $"than this file's {humanRequested}. Remove unused images or wait "
				+ "for capacity to free up.",
				ResponseKeys.UploadBudgetExhausted
			);
		}

		var admitted = (UploadAdmissionResult.Accepted)admissionScope.Admission;
		var asset = admitted.Asset;

		string relativePath;
		try {
			relativePath = await fileStorage.SaveAsync(
				uploadStream, inspected.Extension, cancellationToken
			);
			asset.RelativePath = relativePath;
			asset.ContentType = inspected.ContentType;
			admissionScope.MarkCommitPending();
		} catch (Exception exception) {
			var cleanupConfirmed = exception is StorageWriteException {
				CleanupConfirmed: true
			};
			string? attemptedPath = relativePathOrNull(asset.RelativePath);
			if (exception is StorageWriteException storageWriteException) {
				attemptedPath = storageWriteException.RelativePath;
				asset.RelativePath = storageWriteException.RelativePath;
				// A destination write was ATTEMPTED: the blob's fate is unknown
				// until cleanup confirms otherwise — keep bytes accounted for.
				admissionScope.MarkCommitPending();
			}
			if (attemptedPath is not null && !cleanupConfirmed) {
				try {
					cleanupConfirmed = await fileStorage.DeleteAsync(
						attemptedPath, CancellationToken.None
					);
				} catch (Exception cleanupException) {
					logger.LogWarning(
						cleanupException,
						"Failed to clean up post image blob {Path} after a failed attach",
						attemptedPath
					);
				}
			}

			await admissionScope.FailAsync(
				releaseBudget: cleanupConfirmed, CancellationToken.None
			);
			throw;
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.UploadCreated,
				TargetId: null,
				Details: new {
					PostId = postIdGuid,
					Path = relativePath,
					SizeBytes = file.Length,
					ContentType = inspected.ContentType,
				}
			),
			cancellationToken
		);

		// Reserved → Stored: flips the asset state and commits the budget move.
		await admissionScope.CommitAsync(cancellationToken);

		// #1461 + #1616: the HANDLER owns the reference discipline (#807 F5).
		// Acquire the new blob's reference BEFORE the entity write so the URL can
		// never commit while its asset still reads zero references. The REPLACED
		// path is captured ATOMICALLY with the row purge INSIDE the service's
		// AttachAsync (returned below), so no concurrent attach can hard-delete a
		// row whose path we never observed. If the entity write LOSES the race
		// (a parallel attach commits first and ux_post_media_assets_live_post_id
		// rejects this insert), AttachAsync throws and the new blob never becomes
		// the post's live image — its reference must then be released, or it
		// leaks (#1616). Releasing exactly the paths the service actually removed
		// after its commit leaves no leaked reference for the winning caller.
		await uploadReferences.TryAddReferenceAsync(
			relativePath, cancellationToken
		);

		// The try covers ONLY the entity write, on purpose: its failure is the one
		// event that means "this blob never became the live image". Widening it to
		// the release loop below would force a committed/not-committed flag, and a
		// flag can only ever be this handler's ASSUMPTION about what the database
		// did — the guard inside the compensation asks the database instead.
		IReadOnlyList<string> replacedPaths;
		try {
			// Persist the post-owned asset row; the service selects and purges the
			// replaced row(s) in one unit of work and returns the paths it removed.
			replacedPaths = await assetService.AttachAsync(
				new AttachPostMediaArgs(
					TenantId: tenantId,
					PostId: postIdGuid,
					RelativePath: relativePath,
					ContentType: inspected.ContentType,
					WidthPx: inspected.WidthPx,
					HeightPx: inspected.HeightPx,
					SizeBytes: file.Length,
					UploadedByUserId: account.UserId
				),
				cancellationToken
			);
		} catch {
			await ReleaseUnattachedReferenceAsync(
				assetService,
				uploadReferences,
				logger,
				tenantId,
				postIdGuid,
				relativePath
			);
			throw;
		}

		// Reached ONLY when AttachAsync returned: the row is committed and this
		// blob IS the post's live image, so its own reference stays acquired and
		// only the paths this commit actually removed are released.
		foreach (var replacedPath in replacedPaths) {
			await uploadReferences.TryReleaseReferenceAsync(
				replacedPath, cancellationToken
			);
		}

		return TypedResults.Created(
			(string?)null,
			new PostImageAttached {
				Url = $"/files/{relativePath}",
				Path = relativePath,
				ContentType = inspected.ContentType,
				WidthPx = inspected.WidthPx,
				HeightPx = inspected.HeightPx,
				AltText = null,
			}
		);
	}

	private static string? relativePathOrNull(string? candidate) {
		return string.IsNullOrEmpty(candidate) ? null : candidate;
	}

	/// <summary>
	/// Compensates a FAILED entity write by releasing the reference acquired for
	/// <paramref name="relativePath"/> just before it. In a parallel attach storm
	/// the loser's insert is rejected by <c>ux_post_media_assets_live_post_id</c>:
	/// its blob never becomes the post's live image, so nothing else will ever
	/// release the reference it took, and that reference is the #1616 leak.
	/// Never throws — see the catch below for why.
	/// </summary>
	private static async Task ReleaseUnattachedReferenceAsync(
		IPostMediaAssetService assetService,
		IUploadAssetReferenceService uploadReferences,
		ILogger logger,
		Guid tenantId,
		Guid postId,
		string relativePath
	) {
		// CancellationToken.None throughout: compensation must still run when the
		// caller's token is ALREADY cancelled, which is the most ordinary way to
		// reach this path (client disconnect mid-attach). Reusing the cancelled
		// token would abort the release and leak the reference all over again.
		try {
			// Ask the database instead of assuming the write did not land:
			// SaveChangesAsync can commit server-side and STILL throw (connection
			// loss, or a cancellation observed after the command was sent).
			// Releasing on that ambiguity would strip the LIVE image's only
			// reference and hand a displayed blob to the sweeper — the exact
			// inverse bug. A live row holding OUR path therefore means "keep it";
			// whenever a later attach replaces that row, THAT attach releases this
			// reference from its own replacedPaths, so releasing here as well
			// would double-release.
			var liveAsset = await assetService.FindByPostAsync(
				tenantId, postId, CancellationToken.None
			);
			if (liveAsset is not null && string.Equals(
				liveAsset.RelativePath, relativePath, StringComparison.Ordinal
			)) {
				return;
			}

			await uploadReferences.TryReleaseReferenceAsync(
				relativePath, CancellationToken.None
			);
		} catch (Exception releaseException) {
			// Swallowed on purpose: letting this escape would replace the ORIGINAL
			// attach failure with a compensation failure and erase the real cause
			// from the logs. Transparent failure cause instead (owner product
			// rule) — name the blob whose reference could not be released so the
			// leak is visible and reconcilable rather than silent.
			logger.LogWarning(
				releaseException,
				"Failed to release the upload reference for post image blob "
				+ "{Path} after a failed attach; its reference may leak until "
				+ "reconciled",
				relativePath
			);
		}
	}

	private static string FormatBytes(long bytes) {
		if (bytes >= 1_000_000_000) {
			return $"{bytes / 1_000_000_000.0:0.#} GB";
		}
		if (bytes >= 1_000_000) {
			return $"{bytes / 1_000_000.0:0.#} MB";
		}
		if (bytes >= 1_000) {
			return $"{bytes / 1_000.0:0.#} kB";
		}
		return $"{bytes} B";
	}

	private static AppValidationProblemHttpResult ValidationFailure(
		string message,
		TranslationKey translationKey
	) {
		return TypedProblems.ValidationProblem(
			message,
			translationKey,
			new Dictionary<string, string[]> {
				{ "file", [message] }
			}
		);
	}
}

public record PostImageAttached {
	public required string Url { get; init; }
	public required string Path { get; init; }
	public required string ContentType { get; init; }
	public required int WidthPx { get; init; }
	public required int HeightPx { get; init; }
	public string? AltText { get; init; }
}
