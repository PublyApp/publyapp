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

		// #1461: the HANDLER owns the reference discipline (#807 F5), same
		// ordering as before the move: capture the REPLACED image's path before
		// the attach purges its row, acquire the new blob's reference BEFORE the
		// entity write so the URL can never commit while its asset still reads
		// zero references, then release the old reference AFTER the service's
		// commit below. Physical deletion stays exclusively sweeper's.
		var replacedImage = await assetService.FindByPostAsync(
			tenantId, postIdGuid, cancellationToken
		);
		var replacedPath = replacedImage?.RelativePath;
		await uploadReferences.TryAddReferenceAsync(
			relativePath, cancellationToken
		);

		// Persist the post-owned asset row; the service commits the insert and
		// any replacement purge in one unit of work.
		await assetService.AttachAsync(
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

		if (replacedPath is not null) {
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
