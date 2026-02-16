using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.SystemNotices.Entities;
using MainApi.Src.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

public record UpdateSystemNoticeBody {
	public JsonElement? Severity { get; init; }
	public JsonElement? Title { get; init; }
	public JsonElement? Message { get; init; }
	public JsonElement? StartsAt { get; init; }
	public JsonElement ExpiresAt { get; init; }

	public string? GetSeverity() =>
		Severity.GetValueAsStringOrNull();

	public string? GetTitle() =>
		Title.GetValueAsStringOrNull();

	public string? GetMessage() =>
		Message.GetValueAsStringOrNull();

	public DateTime? GetStartsAt() =>
		StartsAt.GetValueAsDateTimeOrNull();

	public PatchField<DateTime?> GetExpiresAt() =>
		ExpiresAt.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<DateTime?>.Absent(),
			JsonValueKind.Null =>
				PatchField<DateTime?>.Set(null),
			JsonValueKind.String =>
				PatchField<DateTime?>.Set(
					ExpiresAt.GetValueAsDateTime()
				),
			_ => throw new InvalidOperationException(
				"ExpiresAt must be an ISO 8601 string, "
				+ "null, or omitted"
			),
		};
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
	private static readonly string[] ValidSeverities =
		["info", "warning", "critical"];

	public UpdateSystemNoticeBodyValidator() {
		RuleFor(x => x.Severity)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Severity must be a string or null")
			.Must(BeValidSeverityOrNull)
			.WithMessage(
				"Severity must be one of: info, warning, critical"
			);

		RuleFor(x => x.Title)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Title must be a string or null")
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| (e.Value.GetString()?.Length ?? 0) <= 200)
			.WithMessage(
				"Title must be 200 characters or less"
			);

		RuleFor(x => x.Message)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Message must be a string or null")
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| (e.Value.GetString()?.Length ?? 0) <= 2000)
			.WithMessage(
				"Message must be 2000 characters or less"
			);

		RuleFor(x => x.StartsAt)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("StartsAt must be a string or null")
			.Must(BeValidDateTimeOrNull)
			.WithMessage(
				"StartsAt must be a valid ISO 8601 date"
			);

		RuleFor(x => x.ExpiresAt)
			.Must(e =>
				e.ValueKind == JsonValueKind.Undefined
				|| e.ValueKind == JsonValueKind.Null
				|| e.ValueKind == JsonValueKind.String)
			.WithMessage(
				"ExpiresAt must be a string, null, or omitted"
			)
			.Must(BeValidDateTimeOrUndefined)
			.WithMessage(
				"ExpiresAt must be a valid ISO 8601 date"
			);
	}

	private bool BeValidSeverityOrNull(JsonElement? element) {
		if (element is null
			|| element.Value.ValueKind
				== JsonValueKind.Null) {
			return true;
		}
		if (element.Value.ValueKind
			!= JsonValueKind.String) {
			return false;
		}
		var value = element.Value.GetString()
			?.ToLowerInvariant();
		return ValidSeverities.Contains(value);
	}

	private bool BeValidDateTimeOrNull(JsonElement? element) {
		if (element is null
			|| element.Value.ValueKind
				== JsonValueKind.Null) {
			return true;
		}
		if (element.Value.ValueKind
			!= JsonValueKind.String) {
			return false;
		}
		return DateUtils.TryParseIsoUtc(
			element.Value.GetString(), out _
		);
	}

	private bool BeValidDateTimeOrUndefined(
		JsonElement element
	) {
		if (element.ValueKind == JsonValueKind.Undefined
			|| element.ValueKind
				== JsonValueKind.Null) {
			return true;
		}
		if (element.ValueKind != JsonValueKind.String) {
			return false;
		}
		return DateUtils.TryParseIsoUtc(
			element.GetString(), out _
		);
	}
}

public static class UpdateSystemNotice {
	public static async Task<Results<
		Ok<SystemNoticeUpdated>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult
	>> HandleUpdateSystemNotice(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromServices] IAuditLogService auditLogService,
		[FromRoute] Guid noticeId,
		[FromBody] UpdateSystemNoticeBody body,
		CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithPermission() middleware."
			);
		}

		var severityStr = body.GetSeverity();
		NoticeSeverity? severity = null;
		if (severityStr is not null) {
			severity =
				SystemNotice.ParseSeverity(severityStr)
				?? throw new InvalidOperationException(
					"Severity parser rejected validated "
					+ $"value '{severityStr}'."
				);
		}

		var args = new UpdateSystemNoticeArgs(
			Severity: severity,
			Title: body.GetTitle(),
			Message: body.GetMessage(),
			StartsAt: body.GetStartsAt(),
			ExpiresAt: body.GetExpiresAt()
		);

		var notice = await systemNoticeService.UpdateAsync(
			noticeId, args, cancellationToken
		);

		if (notice is null) {
			return TypedProblems.NotFound(
				"System notice not found",
				ResponseKeys.SystemNoticeNotFound
			);
		}

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.SystemNoticeUpdated,
			noticeId,
			new {
				Severity = severity?.ToString()
					.ToLowerInvariant(),
				Title = args.Title,
				StartsAt = args.StartsAt,
				ExpiresAt = args.ExpiresAt.IsPresent
					? args.ExpiresAt.Value
					: null,
			},
			cancellationToken
		);

		return TypedResults.Ok(new SystemNoticeUpdated {
			Id = notice.Id!.Value,
			Title = notice.Title,
			Severity = notice.Severity.ToString()
				.ToLowerInvariant(),
			StartsAt = notice.StartsAt,
			ExpiresAt = notice.ExpiresAt,
			UpdatedAt = notice.UpdatedAt
		});
	}
}
