using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
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
	public JsonElement? ExpiresAt { get; init; }
}

public record SystemNoticeUpdated {
	public required Guid Id { get; init; }
	public required string Title { get; init; }
	public required string Severity { get; init; }
	public required DateTime StartsAt { get; init; }
	public DateTime? ExpiresAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public class UpdateSystemNoticeBodyValidator : AbstractValidator<UpdateSystemNoticeBody> {
	private static readonly string[] ValidSeverities = ["info", "warning", "critical"];

	public UpdateSystemNoticeBodyValidator() {
		RuleFor(x => x.Severity)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Severity must be a string or null")
			.Must(BeValidSeverityOrNull)
			.WithMessage("Severity must be one of: info, warning, critical");

		RuleFor(x => x.Title)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Title must be a string or null")
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| (e.Value.GetString()?.Length ?? 0) <= 200)
			.WithMessage("Title must be 200 characters or less");

		RuleFor(x => x.Message)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Message must be a string or null")
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| (e.Value.GetString()?.Length ?? 0) <= 2000)
			.WithMessage("Message must be 2000 characters or less");

		RuleFor(x => x.StartsAt)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("StartsAt must be a string or null")
			.Must(BeValidDateTimeOrNull)
			.WithMessage("StartsAt must be a valid ISO 8601 date");

		RuleFor(x => x.ExpiresAt)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("ExpiresAt must be a string or null")
			.Must(BeValidDateTimeOrNull)
			.WithMessage("ExpiresAt must be a valid ISO 8601 date");
	}

	private bool BeValidSeverityOrNull(JsonElement? element) {
		if (element is null || element.Value.ValueKind == JsonValueKind.Null) return true;
		if (element.Value.ValueKind != JsonValueKind.String) return false;
		var value = element.Value.GetString()?.ToLowerInvariant();
		return ValidSeverities.Contains(value);
	}

	private bool BeValidDateTimeOrNull(JsonElement? element) {
		if (element is null || element.Value.ValueKind == JsonValueKind.Null) return true;
		if (element.Value.ValueKind != JsonValueKind.String) return false;
		return DateTime.TryParse(element.Value.GetString(), out _);
	}
}

public static class UpdateSystemNotice {
	public static async Task<Results<
		Ok<SystemNoticeUpdated>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
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
			return TypedProblems.Forbidden(
				"User does not have the necessary permissions",
				ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
			);
		}

		// Parse optional fields
		NoticeSeverity? severity = null;
		if (body.Severity is not null && body.Severity.Value.ValueKind == JsonValueKind.String) {
			var severityStr = body.Severity.Value.GetString()?.ToLowerInvariant();
			severity = severityStr switch {
				"info" => NoticeSeverity.Info,
				"warning" => NoticeSeverity.Warning,
				"critical" => NoticeSeverity.Critical,
				_ => null
			};
		}

		string? title = null;
		if (body.Title is not null && body.Title.Value.ValueKind == JsonValueKind.String) {
			title = body.Title.Value.GetString();
		}

		string? message = null;
		if (body.Message is not null && body.Message.Value.ValueKind == JsonValueKind.String) {
			message = body.Message.Value.GetString();
		}

		DateTime? startsAt = null;
		if (body.StartsAt is not null && body.StartsAt.Value.ValueKind == JsonValueKind.String) {
			startsAt = DateTime.Parse(body.StartsAt.Value.GetString()!).ToUniversalTime();
		}

		DateTime? expiresAt = null;
		if (body.ExpiresAt is not null && body.ExpiresAt.Value.ValueKind == JsonValueKind.String) {
			expiresAt = DateTime.Parse(body.ExpiresAt.Value.GetString()!).ToUniversalTime();
		}

		var notice = await systemNoticeService.UpdateAsync(
			noticeId,
			severity,
			title,
			message,
			startsAt,
			expiresAt,
			cancellationToken
		);

		if (notice is null) {
			return TypedProblems.NotFound(
				"System notice not found",
				ResponseKeys.NotFound
			);
		}

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.SystemNoticeUpdated,
			noticeId,
			new {
				Severity = severity?.ToString().ToLowerInvariant(),
				Title = title,
				StartsAt = startsAt,
				ExpiresAt = expiresAt
			},
			cancellationToken
		);

		return TypedResults.Ok(new SystemNoticeUpdated {
			Id = notice.Id!.Value,
			Title = notice.Title,
			Severity = notice.Severity.ToString().ToLowerInvariant(),
			StartsAt = notice.StartsAt,
			ExpiresAt = notice.ExpiresAt,
			UpdatedAt = notice.UpdatedAt
		});
	}
}
