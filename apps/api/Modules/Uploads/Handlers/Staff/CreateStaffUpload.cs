using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Uploads.Entities;

namespace PublyApp.Api.Modules.Uploads.Handlers.Staff;

public record StaffUploadCreated {
	public required string Url { get; init; }
	public required string Path { get; init; }
	public required long SizeBytes { get; init; }
	public required string ContentType { get; init; }
}

/// <summary>
/// Uploads a single image and returns a served URL under <c>/files</c>. The
/// permission required is <c>uploads:create</c> — a generic, purpose-agnostic
/// bucket, not <c>tenants:logo:upload</c> — because this endpoint is not
/// tenant-logo-specific despite being the only current caller. The returned URL
/// is served <b>anonymously</b>, from the API origin, with no tenant scoping and
/// no expiry (see <c>Program.cs</c>'s anonymous <c>UseStaticFiles</c> mapping for
/// <c>/files</c>): anything saved here is world-readable by URL forever. Never
/// upload anything not intended to be public. If a private-asset tier becomes
/// necessary, prefix server-generated paths by purpose (e.g.
/// <c>uploads/public/...</c>) before that need arrives, so URLs already
/// persisted in <c>tenants.logo_url</c> keep working unchanged.
/// </summary>
public sealed class CreateStaffUpload {
	// Longest magic-byte prefix needed to sniff any supported image type (WEBP: "RIFF"+size(4)+"WEBP").
	private const int SniffBufferLength = 12;

	public static async Task<Results<
		Created<StaffUploadCreated>,
		AppValidationProblemHttpResult,
		AppPayloadTooLargeHttpResult,
		AppTooManyRequestsHttpResult
	>> Handle(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IFileStorage fileStorage,
		[FromServices] IUploadAdmissionService uploadAdmissionService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<CreateStaffUpload> logger,
		IFormFile? file,
		CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		if (file is null || file.Length == 0) {
			return ValidationFailure(
				"A file is required",
				ResponseKeys.UploadFileRequired
			);
		}

		var maxBytes = AppEnvironment.Instance.UPLOAD_MAX_BYTES;
		if (file.Length > maxBytes) {
			return TypedProblems.PayloadTooLarge(
				$"File exceeds the maximum size of {maxBytes} bytes",
				ResponseKeys.UploadFileTooLarge
			);
		}

		// file.OpenReadStream() is already seekable (ASP.NET Core buffers the
		// multipart section to memory or a temp file before the handler runs), so
		// sniff directly off it and rewind — no intermediate MemoryStream copy.
		await using var uploadStream = file.OpenReadStream();
		var sniffed = SniffImageType(uploadStream);
		if (sniffed is null) {
			return ValidationFailure(
				"File must be a PNG, JPEG, WEBP, or GIF image",
				ResponseKeys.UploadFileUnsupportedType
			);
		}
		uploadStream.Position = 0;

		var (contentType, extension) = sniffed.Value;

		// Durable admission (#807 F1): reserve bytes and create the Reserved asset
		// row in ONE transaction BEFORE opening the destination file. Concurrent
		// admissions serialise on the budget rows inside Postgres, so bursts of
		// individually-valid uploads can no longer over-admit.
		await using var admissionScope = await uploadAdmissionService
			.BeginReservationAsync(
				account.UserId, file.Length, UploadAdmissionService.StaffUploadPurpose,
				cancellationToken
			);

		if (admissionScope.Admission is UploadAdmissionResult.Rejected rejected) {
			// Transparent failure cause (owner product rule): name which budget ran
			// out and by how much, in plain words, instead of a generic refusal.
			var scopeName = rejected.ExhaustedScope switch {
				UploadBudgetScope.Global => "the shared storage budget",
				UploadBudgetScope.CreatorUser => "your personal storage budget",
				UploadBudgetScope.Purpose => $"the '{UploadAdmissionService.StaffUploadPurpose}' purpose budget",
				_ => throw new ArgumentOutOfRangeException(
					nameof(rejected), rejected.ExhaustedScope, "Unhandled UploadBudgetScope"
				),
			};
			var humanRequested = FormatBytes(rejected.RequestedBytes);
			var humanAvailable = FormatBytes(Math.Max(0, rejected.AvailableBytes));
			return TypedProblems.TooManyRequests(
				$"Upload refused: {scopeName} has {humanAvailable} free, which is less "
				+ $"than this file's {humanRequested}. Delete unused files or wait for "
				+ "capacity to free up.",
				ResponseKeys.UploadBudgetExhausted
			);
		}

		var asset = ((UploadAdmissionResult.Accepted)admissionScope.Admission).Asset;

		try {
			var relativePath = await fileStorage.SaveAsync(
				uploadStream, extension, cancellationToken
			);
			asset.RelativePath = relativePath;
			asset.ContentType = contentType;
			admissionScope.MarkCommitPending();

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.UploadCreated,
					TargetId: null,
					Details: new {
						Path = relativePath,
						SizeBytes = file.Length,
						ContentType = contentType
					}
				),
				cancellationToken
			);

			await admissionScope.CommitAsync(cancellationToken);
			return TypedResults.Created((string?)null, new StaffUploadCreated {
				Url = $"/files/{relativePath}",
				Path = relativePath,
				SizeBytes = file.Length,
				ContentType = contentType
			});
		} catch (Exception exception) {
			var cleanupConfirmed = exception is StorageWriteException {
				CleanupConfirmed: true
			};
			if (exception is StorageWriteException storageWriteException) {
				asset.RelativePath = storageWriteException.RelativePath;
				// A StorageWriteException means a destination write was ATTEMPTED:
				// the blob's fate is unknown until cleanup confirms otherwise. Stamp
				// commit-pending so FailAsync keeps the bytes accounted for (Stored
				// orphan) instead of rolling the reservation away while bytes may
				// still exist on disk.
				admissionScope.MarkCommitPending();
			}
			var hasPath = !string.IsNullOrEmpty(asset.RelativePath);
			if (hasPath && !cleanupConfirmed) {
				try {
					cleanupConfirmed = await fileStorage.DeleteAsync(
						asset.RelativePath,
						CancellationToken.None
					);
				} catch (Exception cleanupException) {
					logger.LogWarning(
						cleanupException,
						"Failed to clean up upload blob {Path} after a failed upload operation",
						asset.RelativePath
					);
				}
			}

			// A confirmed-cleanup failure releases the bytes back to every budget;
			// an unconfirmed one keeps them accounted for via a Stored orphan row —
			// never admitting more storage than this deployment can bound.
			await admissionScope.FailAsync(releaseBudget: cleanupConfirmed, CancellationToken.None);

			throw;
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

	// Sniffs the leading bytes of the stream to determine the real image type,
	// never trusting the client-supplied file name or Content-Type header.
	// Leaves the stream position unspecified on return; callers must reset it.
	//
	// Known gap (round-5 API F5): this only inspects the magic-byte header and
	// never decodes the body, so a valid signature followed by arbitrary
	// non-image data still passes. The extension rewrite + `nosniff` on served
	// uploads block the HTML/SVG stored-XSS vector this would otherwise open,
	// but nothing here guarantees the accepted content is a usable/safe image.
	// Closing that gap needs a hardened image-decode library plus
	// dimension/pixel-count bounds, not another magic-byte check.
	private static (string ContentType, string Extension)? SniffImageType(Stream stream) {
		// Stream.Read is contractually allowed to return fewer bytes than requested
		// even when more are available; ReadAtLeast loops until the buffer is full
		// or the stream truly ends, so a short read never misclassifies a valid image.
		Span<byte> header = stackalloc byte[SniffBufferLength];
		var read = stream.ReadAtLeast(header, SniffBufferLength, throwOnEndOfStream: false);

		if (read >= 8 && IsPng(header)) {
			return ("image/png", ".png");
		}
		if (read >= 3 && IsJpeg(header)) {
			return ("image/jpeg", ".jpg");
		}
		if (read >= 10 && IsGif(header)) {
			return ("image/gif", ".gif");
		}
		if (read >= 12 && IsWebP(header)) {
			return ("image/webp", ".webp");
		}

		return null;
	}

	private static bool IsPng(ReadOnlySpan<byte> header) {
		ReadOnlySpan<byte> signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
		return header[..8].SequenceEqual(signature);
	}

	private static bool IsJpeg(ReadOnlySpan<byte> header) {
		return header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF;
	}

	private static bool IsGif(ReadOnlySpan<byte> header) {
		ReadOnlySpan<byte> gif87A = "GIF87a"u8;
		ReadOnlySpan<byte> gif89A = "GIF89a"u8;
		if (!(header[..6].SequenceEqual(gif87A) || header[..6].SequenceEqual(gif89A))) {
			return false;
		}

		// Logical screen descriptor immediately follows the signature: width then
		// height, both little-endian uint16 (GIF89a spec section 18). A zero-sized
		// canvas cannot be a real image, so reject rather than certify a degenerate
		// payload as a valid GIF (round-5 API F5).
		var width = header[6] | (header[7] << 8);
		var height = header[8] | (header[9] << 8);
		return width > 0 && height > 0;
	}

	private static bool IsWebP(ReadOnlySpan<byte> header) {
		ReadOnlySpan<byte> riff = "RIFF"u8;
		ReadOnlySpan<byte> webP = "WEBP"u8;
		return header[..4].SequenceEqual(riff) && header[8..12].SequenceEqual(webP);
	}
}
