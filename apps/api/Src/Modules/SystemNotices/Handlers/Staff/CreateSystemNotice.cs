using System.Text.Json;

using FluentValidation;

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

public record CreateSystemNoticeBody {
	public required JsonElement Severity { get; init; }
	public required JsonElement Title { get; init; }
	public required JsonElement Message { get; init; }
	public required JsonElement StartsAt { get; init; }
	public JsonElement? ExpiresAt { get; init; }

	public string GetSeverity() =>
		Severity.GetValueAsString();

	public string GetTitle() =>
		Title.GetValueAsString();

	public string GetMessage() =>
		Message.GetValueAsString();

	public DateTime GetStartsAt() =>
		StartsAt.GetValueAsDateTime();

	public DateTime? GetExpiresAt() =>
		ExpiresAt.GetValueAsDateTimeOrNull();
}

public record SystemNoticeCreated {
	public required Guid Id { get; init; }
	public required string Title { get; init; }
	public required string Severity { get; init; }
	public required DateTime StartsAt { get; init; }
	public DateTime? ExpiresAt { get; init; }
}

public class CreateSystemNoticeBodyValidator
	: AbstractValidator<CreateSystemNoticeBody> {
	private static readonly string[] ValidSeverities =
		["info", "warning", "critical"];

	public CreateSystemNoticeBodyValidator() {
		RuleFor(x => x.Severity)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Severity must be a string")
			.Must(BeValidSeverity)
			.WithMessage(
				"Severity must be one of: info, warning, critical"
			);

		RuleFor(x => x.Title)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Title must be a string")
			.Must(e =>
				!string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Title is required")
			.Must(e => e.GetString()?.Length <= 200)
			.WithMessage("Title must be 200 characters or less");

		RuleFor(x => x.Message)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Message must be a string")
			.Must(e =>
				!string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Message is required")
			.Must(e => e.GetString()?.Length <= 2000)
			.WithMessage(
				"Message must be 2000 characters or less"
			);

		RuleFor(x => x.StartsAt)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("StartsAt must be a string")
			.Must(BeValidDateTime)
			.WithMessage(
				"StartsAt must be a valid ISO 8601 date"
			);

		RuleFor(x => x.ExpiresAt)
			.Must(e => e is null
				|| e.Value.ValueKind == JsonValueKind.Null
				|| e.Value.ValueKind == JsonValueKind.String)
			.WithMessage("ExpiresAt must be a string or null")
			.Must(BeValidDateTimeOrNull)
			.WithMessage(
				"ExpiresAt must be a valid ISO 8601 date"
			);
	}

	private bool BeValidSeverity(JsonElement element) {
		if (element.ValueKind != JsonValueKind.String) {
			return false;
		}
		var value = element.GetString()?.ToLowerInvariant();
		return ValidSeverities.Contains(value);
	}

	private bool BeValidDateTime(JsonElement element) {
		if (element.ValueKind != JsonValueKind.String) {
			return false;
		}
		return DateUtils.TryParseIsoUtc(
			element.GetString(), out _
		);
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
}

public static class CreateSystemNotice {
	public static async Task<Results<
		Created<SystemNoticeCreated>,
		AppBadRequestHttpResult
	>> HandleCreateSystemNotice(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromServices] IAuditLogService auditLogService,
		[FromBody] CreateSystemNoticeBody body,
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
		var parsedSeverity =
			SystemNotice.ParseSeverity(severityStr);
		if (parsedSeverity is null) {
			throw new InvalidOperationException(
				"Severity parser rejected validated "
				+ $"value '{severityStr}'."
			);
		}
		var severity = parsedSeverity.Value;

		var args = new CreateSystemNoticeArgs(
			Severity: severity,
			Title: body.GetTitle(),
			Message: body.GetMessage(),
			StartsAt: body.GetStartsAt(),
			ExpiresAt: body.GetExpiresAt(),
			CreatedByStaffId: account.UserId
		);

		var notice = await systemNoticeService.CreateAsync(
			args, cancellationToken
		);

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.SystemNoticeCreated,
			notice.Id,
			new {
				Severity = severityStr,
				Title = args.Title,
				StartsAt = args.StartsAt,
				ExpiresAt = args.ExpiresAt
			},
			cancellationToken
		);

		return TypedResults.Created(
			(string?)null,
			new SystemNoticeCreated {
				Id = notice.GetRequiredId(),
				Title = notice.Title,
				Severity = severity.ToString()
					.ToLowerInvariant(),
				StartsAt = notice.StartsAt,
				ExpiresAt = notice.ExpiresAt
			}
		);
	}
}
