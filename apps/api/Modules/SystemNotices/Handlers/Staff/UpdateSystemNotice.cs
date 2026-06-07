using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.SystemNotices.Entities;
using PublyApp.Api.Modules.SystemNotices.Services;
using PublyApp.Api.Modules.SystemNotices.Validation;

namespace PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

public record UpdateSystemNoticeBody {
	public JsonElement? Severity { get; init; }
	public JsonElement? Title { get; init; }
	public JsonElement? Message { get; init; }
	public JsonElement? StartsAt { get; init; }
	public JsonElement ExpiresAt { get; init; }

	public string? GetSeverity() {
		return Severity.GetValueAsStringOrNull();
	}

	public string? GetTitle() {
		return Title.GetValueAsStringOrNull();
	}

	public string? GetMessage() {
		return Message.GetValueAsStringOrNull();
	}

	public DateTime? GetStartsAt() {
		return StartsAt.GetValueAsDateTimeOrNull();
	}

	public PatchField<DateTime?> GetExpiresAt() {
		return ExpiresAt.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<DateTime?>.Absent(),
			JsonValueKind.Null =>
				PatchField<DateTime?>.Set(null),
			JsonValueKind.String =>
				PatchField<DateTime?>.Set(
					ExpiresAt.GetValueAsDateTime()
				),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
				"ExpiresAt must be an ISO 8601 string, "
				+ "null, or omitted"
			),
			_ => throw new ArgumentOutOfRangeException(
				nameof(ExpiresAt),
				ExpiresAt.ValueKind,
				$"Unhandled JsonValueKind: {ExpiresAt.ValueKind}"
			),
		};
	}
}

public record SystemNoticeUpdated {
	public required Guid Id { get; init; }
	public required string Title { get; init; }
	public required string Severity { get; init; }
	public required DateTime StartsAt { get; init; }
	public DateTime? ExpiresAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public class UpdateSystemNoticeBodyValidator
	: AbstractValidator<UpdateSystemNoticeBody> {
	public UpdateSystemNoticeBodyValidator() {
		RuleFor(x => x.Severity)
			.MustBeNullableSeverity();

		RuleFor(x => x.Title)
			.MustBeNullableStringWithMaxLength("Title", 200);

		RuleFor(x => x.Message)
			.MustBeNullableStringWithMaxLength("Message", 2000);

		RuleFor(x => x.StartsAt)
			.MustBeNullableIsoDateTime("StartsAt");

		RuleFor(x => x.ExpiresAt)
			.MustBePatchFieldIsoDateTime("ExpiresAt");
	}
}

public sealed class UpdateSystemNotice {
	public static async Task<Results<
		Ok<SystemNoticeUpdated>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult
	>> Handle(
		[FromRoute] string noticeId,
		[FromBody] UpdateSystemNoticeBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// IMPOSSIBLE STATE: Staff endpoint without staff account
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		// Validate noticeId format
		if (!Guid.TryParse(noticeId, out var noticeIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid noticeId",
				ResponseKeys.MalformedId
			);
		}

		// Cache body getters to avoid repeated calls
		var severityStr = body.GetSeverity();
		var title = body.GetTitle();
		var message = body.GetMessage();
		var startsAt = body.GetStartsAt();
		var expiresAt = body.GetExpiresAt();

		// Guard against empty PATCH body
		if (severityStr is null
			&& title is null
			&& message is null
			&& startsAt is null
			&& !expiresAt.IsPresent) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		NoticeSeverity? severity = null;
		if (severityStr is not null) {
			var parsedSeverity =
				SystemNotice.ParseSeverity(severityStr);
			if (parsedSeverity is null) {
				throw new InvalidOperationException(
					"Severity parser rejected validated "
					+ $"value '{severityStr}'."
				);
			}
			severity = parsedSeverity.Value;
		}

		var args = new UpdateSystemNoticeArgs(
			Severity: severity,
			Title: title,
			Message: message,
			StartsAt: startsAt,
			ExpiresAt: expiresAt
		);

		var notice = await systemNoticeService.UpdateAsync(
			noticeIdGuid, args, cancellationToken
		);

		if (notice is null) {
			return TypedProblems.NotFound(
				"System notice not found",
				ResponseKeys.SystemNoticeNotFound
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.SystemNoticeUpdated,
				TargetId: noticeIdGuid,
				Details: new {
					Severity = severity?.ToString()
						.ToLowerInvariant(),
					Title = args.Title,
					StartsAt = args.StartsAt,
					ExpiresAt = args.ExpiresAt.IsPresent
						? args.ExpiresAt.Value
						: null,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new SystemNoticeUpdated {
			Id = notice.GetRequiredId(),
			Title = notice.Title,
			Severity = notice.Severity.ToString()
				.ToLowerInvariant(),
			StartsAt = notice.StartsAt,
			ExpiresAt = notice.ExpiresAt,
			UpdatedAt = notice.UpdatedAt
		});
	}
}
