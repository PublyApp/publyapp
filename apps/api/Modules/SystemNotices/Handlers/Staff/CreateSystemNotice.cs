using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.SystemNotices.Entities;
using PublyApp.Api.Modules.SystemNotices.Services;
using PublyApp.Api.Modules.SystemNotices.Validation;

namespace PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

public record CreateSystemNoticeBody {
	public required JsonElement Severity { get; init; }
	public required JsonElement Title { get; init; }
	public required JsonElement Message { get; init; }
	public required JsonElement StartsAt { get; init; }
	public JsonElement? ExpiresAt { get; init; }

	public string GetSeverity() {
		return Severity.GetValueAsString();
	}

	public string GetTitle() {
		return Title.GetValueAsString();
	}

	public string GetMessage() {
		return Message.GetValueAsString();
	}

	public DateTime GetStartsAt() {
		return StartsAt.GetValueAsDateTime();
	}

	public DateTime? GetExpiresAt() {
		return ExpiresAt.GetValueAsDateTimeOrNull();
	}
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
	public CreateSystemNoticeBodyValidator() {
		RuleFor(x => x.Severity)
			.MustBeRequiredSeverity();

		RuleFor(x => x.Title)
			.MustBeRequiredStringWithLength("Title", 1, 200);

		RuleFor(x => x.Message)
			.MustBeRequiredStringWithLength("Message", 1, 2000);

		RuleFor(x => x.StartsAt)
			.MustBeRequiredIsoDateTime("StartsAt");

		RuleFor(x => x.ExpiresAt)
			.MustBeNullableIsoDateTime("ExpiresAt");
	}
}

public sealed class CreateSystemNotice {
	public static async Task<Results<
		Created<SystemNoticeCreated>,
		AppBadRequestHttpResult
	>> Handle(
		[FromBody] CreateSystemNoticeBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromServices] IAuditLogService auditLogService,
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
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.SystemNoticeCreated,
				TargetId: notice.Id,
				Details: new {
					Severity = severityStr,
					Title = args.Title,
					StartsAt = args.StartsAt,
					ExpiresAt = args.ExpiresAt
				}
			),
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
