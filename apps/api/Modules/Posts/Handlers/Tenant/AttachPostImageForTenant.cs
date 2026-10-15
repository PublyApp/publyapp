using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Npgsql;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.Uploads.Entities;
using PublyApp.Api.Modules.Uploads.Services;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Appends ONE image to a post's ordered list (multipart <c>file</c> field; at
/// most four, a fifth is a typed 422; GIF and animated images are refused). Type and
/// dimensions come from server-side header parsing (never client claims);
/// bytes pass the durable upload-admission pipeline (#807 F1). The blob
/// reference is acquired HERE before the post-owned asset row commits and
/// released HERE if the row never lands (#807 F5) — the handler owns the
/// coordination, the service only persists rows.
/// </summary>
public sealed class AttachPostImageForTenant {
	public static async Task<IResult> Handle(
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
			return AttachPostImageForTenant._ValidationFailure(
				"An image file is required",
				ResponseKeys.PostImageRequired
			);
		}

		// Cheap early refusal so a fifth image never reaches storage; the asset
		// service re-checks authoritatively at insert time.
		var existingImages = await assetService.ListByPostAsync(
			tenantId, postIdGuid, cancellationToken
		);
		if (existingImages.Count >= ProviderLimits.MaxImagesPerPost) {
			return AttachPostImageForTenant._LimitReached();
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
			return AttachPostImageForTenant._ValidationFailure(
				"File must be a PNG, JPEG, or WEBP image",
				ResponseKeys.PostImageUnsupportedType
			);
		}
		if (inspection is ImageInspector.DegenerateDimensions) {
			// A recognized image type declaring a zero/negative canvas: name the
			// DIMENSIONS as the cause, not the (known) type.
			return AttachPostImageForTenant._ValidationFailure(
				"Image dimensions are invalid",
				ResponseKeys.PostImageDimensionsInvalid
			);
		}
		var inspected =
			(ImageInspector.Inspected)inspection;

		// Publishing carries static JPEG/PNG/WebP only (ProviderLimits): refuse
		// GIF and animated WebP here with a clear message instead of failing
		// at publish time.
		if (!ProviderLimits.Bluesky.AcceptedImageContentTypes.Contains(inspected.ContentType)
			|| AttachPostImageForTenant._IsAnimatedWebP(uploadStream, inspected)) {
			return AttachPostImageForTenant._ValidationFailure(
				"Animated and GIF images are not supported; use a JPEG, PNG, or static WebP image",
				ResponseKeys.PostImageAnimatedUnsupported
			);
		}
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
			var humanRequested = AttachPostImageForTenant._FormatBytes(rejected.RequestedBytes);
			var humanAvailable = AttachPostImageForTenant._FormatBytes(Math.Max(0, rejected.AvailableBytes));
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
			string? attemptedPath = AttachPostImageForTenant._RelativePathOrNull(asset.RelativePath);
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

		// #807 F5 reference discipline, owned by this HANDLER (#1461): acquire the
		// NEW blob's reference BEFORE the entity write so the URL can never commit
		// while its asset still reads zero references. If the row never lands
		// (limit reached, lost append race, any failure) the reference is released
		// below, or the blob leaks forever (#1616). Physical deletion stays
		// exclusively sweeper's.
		await uploadReferences.TryAddReferenceAsync(
			relativePath, cancellationToken
		);

		// The try covers ONLY the entity write, on purpose: its failure is the one
		// event that means "this blob never became one of the post's images". The
		// inner catch handles the known 409 loser race (two appends claiming the
		// same position) deterministically; the outer catch covers any other
		// AttachAsync failure via a database re-check rather than an assumption
		// about what committed.
		AttachPostMediaResult attachResult;
		try {
			attachResult = await assetService.AttachAsync(
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
		} catch (DbUpdateException ex) when (AttachPostImageForTenant._IsPostImageUniqueViolation(ex)) {
			// Loser of the concurrent-append race: another attach just took this
			// position. Release the reference we acquired so its blob is not left
			// stuck at reference_count = 1 (#1616), and tell the client to retry.
			await uploadReferences.TryReleaseReferenceAsync(
				relativePath,
				cancellationToken
			);
			return TypedProblems.Conflict(
				"Another image attach for this post just took the next image slot; "
				+ "no row was written for this request. Re-fetch the post to see "
				+ "its images, then retry.",
				ResponseKeys.PostImageConflict
			);
		} catch {
			// Any other failure of the entity write: this blob never became one of
			// the post's images, so its acquired reference must be released or it
			// leaks (#1616). The compensation asks the database whether our blob is
			// now attached (rather than assuming the write landed or not).
			await AttachPostImageForTenant._ReleaseUnattachedReferenceAsync(
				assetService,
				uploadReferences,
				logger,
				tenantId,
				postIdGuid,
				relativePath
			);
			throw;
		}

		if (attachResult is AttachPostMediaResult.LimitReached) {
			await uploadReferences.TryReleaseReferenceAsync(
				relativePath,
				cancellationToken
			);
			return AttachPostImageForTenant._LimitReached();
		}

		var attached = ((AttachPostMediaResult.Attached)attachResult).Asset;
		return TypedResults.Created(
			(string?)null,
			new PostImageAttached {
				Id = attached.GetRequiredId(),
				Position = attached.Position,
				Url = $"/files/{relativePath}",
				Path = relativePath,
				ContentType = inspected.ContentType,
				WidthPx = inspected.WidthPx,
				HeightPx = inspected.HeightPx,
				AltText = null,
			}
		);
	}

	private static AppValidationProblemHttpResult _LimitReached() {
		var message = $"A post can have at most {ProviderLimits.MaxImagesPerPost} images";
		return TypedProblems.ValidationProblem(
			message,
			ResponseKeys.PostImageLimitReached,
			new Dictionary<string, string[]> {
				{ "file", [message] }
			},
			new Dictionary<string, object?> {
				["limit"] = ProviderLimits.MaxImagesPerPost,
			}
		);
	}

	// WebP animation flag: RIFF....WEBP then a VP8X chunk whose flags byte
	// (offset 20) carries the animation bit 0x02. Leaves the stream position
	// unspecified; the caller rewinds.
	private static bool _IsAnimatedWebP(Stream stream, ImageInspector.Inspected inspected) {
		if (inspected.ContentType != "image/webp") {
			return false;
		}

		stream.Position = 0;
		Span<byte> header = stackalloc byte[21];
		var read = stream.ReadAtLeast(header, header.Length, throwOnEndOfStream: false);
		return read == header.Length
			&& header[12..16].SequenceEqual("VP8X"u8)
			&& (header[20] & 0x02) != 0;
	}

	private static string? _RelativePathOrNull(string? candidate) {
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
	private static async Task _ReleaseUnattachedReferenceAsync(
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
			// removing that row later releases this reference, so releasing here
			// as well would double-release.
			var liveAssets = await assetService.ListByPostAsync(
				tenantId, postId, CancellationToken.None
			);
			if (liveAssets.Any(liveAsset => string.Equals(
				liveAsset.RelativePath, relativePath, StringComparison.Ordinal
			))) {
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

	private static string _FormatBytes(long bytes) {
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

	private static AppValidationProblemHttpResult _ValidationFailure(
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

	/// <summary>
	/// True when the failure is a unique-constraint violation on the
	/// post_media_assets (post, position) index. Concurrent attaches to the same
	/// post claim the same next position and the loser(s) hit this — they must
	/// release the blob reference they already acquired instead of leaking it
	/// (#1616).
	/// </summary>
	private static bool _IsPostImageUniqueViolation(DbUpdateException ex) {
		if (ex.InnerException is not PostgresException pgEx) {
			return false;
		}
		return pgEx.SqlState == PostgresErrorCodes.UniqueViolation
			&& pgEx.TableName is not null
			&& pgEx.TableName.Equals(
				"post_media_assets",
				StringComparison.OrdinalIgnoreCase
			);
	}
}

public record PostImageAttached {
	public required Guid Id { get; init; }
	public required int Position { get; init; }
	public required string Url { get; init; }
	public required string Path { get; init; }
	public required string ContentType { get; init; }
	public required int WidthPx { get; init; }
	public required int HeightPx { get; init; }
	public string? AltText { get; init; }
}
