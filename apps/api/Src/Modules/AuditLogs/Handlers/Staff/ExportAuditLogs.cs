using System.Text;
using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Services;

using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

public class ExportAuditLogsQuery {
	[FromQuery] public string? Format { get; set; }
	[FromQuery] public string? UserId { get; set; }
	[FromQuery] public string? Action { get; set; }
	[FromQuery] public string? TargetId { get; set; }
	[FromQuery] public string? StartDate { get; set; }
	[FromQuery] public string? EndDate { get; set; }

	public string? GetFormat() {
		if (Format is null) {
			return null;
		}

		if (string.Equals(Format, "csv", StringComparison.OrdinalIgnoreCase)) {
			return "csv";
		}
		if (string.Equals(Format, "json", StringComparison.OrdinalIgnoreCase)) {
			return "json";
		}

		return Format;
	}

	public Guid? GetUserId() {
		return QueryPredicates.ParseNullableGuid(
			UserId
		);
	}

	public Guid? GetTargetId() {
		return QueryPredicates.ParseNullableGuid(
			TargetId
		);
	}

	public DateTime? GetStartDate() {
		return QueryPredicates.ParseNullableDate(
			StartDate
		);
	}

	public DateTime? GetEndDate() {
		return QueryPredicates.ParseNullableDate(
			EndDate
		);
	}
}

public class ExportAuditLogsQueryValidator
	: AbstractValidator<ExportAuditLogsQuery> {
	public ExportAuditLogsQueryValidator() {
		RuleFor(x => x.Format)
			.NotEmpty()
			.WithMessage("Format is required")
			.Must(BeValidFormat)
			.WithMessage(
				"Format must be 'csv' or 'json'"
			);

		RuleFor(x => x.UserId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"UserId must be a valid GUID"
			);

		RuleFor(x => x.TargetId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"TargetId must be a valid GUID"
			);

		RuleFor(x => x.StartDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"StartDate must be a valid"
				+ " ISO 8601 date"
			);

		RuleFor(x => x.EndDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"EndDate must be a valid"
				+ " ISO 8601 date"
			);

		RuleFor(x => x)
			.Must(q => QueryPredicates.BeValidDateRange(
				q.StartDate, q.EndDate
			))
			.WithMessage(
				"StartDate must be before or equal"
				+ " to EndDate"
			)
			.When(x =>
				x.StartDate is not null
				&& x.EndDate is not null
				&& QueryPredicates.BeValidNullableDate(
					x.StartDate
				)
				&& QueryPredicates.BeValidNullableDate(
					x.EndDate
				)
			);
	}

	private static bool BeValidFormat(string? value) {
		if (value is null) {
			return false;
		}
		return value.Equals(
			"csv", StringComparison.OrdinalIgnoreCase
		) || value.Equals(
			"json", StringComparison.OrdinalIgnoreCase
		);
	}
}

public class ExportAuditLogs {
	public static async Task<IResult>
		HandleExportAuditLogs(
		[AsParameters] ExportAuditLogsQuery query,
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		HttpContext httpContext,
		CancellationToken cancellationToken = default
	) {
		var exportArgs = new ExportAuditLogsArgs(
			UserId: query.GetUserId(),
			Action: query.Action,
			TargetId: query.GetTargetId(),
			StartDate: query.GetStartDate(),
			EndDate: query.GetEndDate()
		);

		var exceedsLimit =
			await auditLogQueryService
				.ExportExceedsLimitAsync(
					exportArgs, cancellationToken
				);

		if (exceedsLimit) {
			return TypedProblems.BadRequest(
				"Export exceeds the maximum row limit."
				+ " Please narrow your filters.",
				ResponseKeys.BadRequest
			);
		}

		var format = query.GetFormat();
		if (format is null) {
			return TypedProblems.BadRequest(
				"Format is required",
				ResponseKeys.BadRequest
			);
		}
		var timestamp = DateTime.UtcNow
			.ToString("yyyyMMdd-HHmmss");
		var ext = format == "csv" ? "csv" : "json";
		var contentType = format == "csv"
			? "text/csv"
			: "application/json";
		var fileName =
			$"audit-logs-{timestamp}.{ext}";

		httpContext.Response.ContentType = contentType;
		httpContext.Response.Headers.ContentDisposition =
			$"attachment; filename=\"{fileName}\"";

		var items = auditLogQueryService.ExportAsync(
			exportArgs, cancellationToken
		);

		if (format == "csv") {
			await WriteCsvAsync(
				httpContext.Response.Body,
				items,
				cancellationToken
			);
		} else {
			await WriteJsonAsync(
				httpContext.Response.Body,
				items,
				cancellationToken
			);
		}

		return Results.Empty;
	}

	private static async Task WriteCsvAsync(
		Stream stream,
		IAsyncEnumerable<AuditLogExportItem> items,
		CancellationToken cancellationToken
	) {
		await using var writer = new StreamWriter(
			stream, Encoding.UTF8, leaveOpen: true
		);

		await writer.WriteLineAsync(
			"Id,UserName,UserEmail,Action,"
			+ "TargetId,Details,IpAddress,"
			+ "UserAgent,CreatedAt"
		);

		await foreach (var item in items
			.WithCancellation(cancellationToken)
		) {
			var line = string.Join(",",
				EscapeCsv(item.Id.ToString()),
				EscapeCsv(item.UserName),
				EscapeCsv(item.UserEmail),
				EscapeCsv(item.Action),
				EscapeCsv(
					item.TargetId?.ToString() ?? ""
				),
				EscapeCsv(item.Details ?? ""),
				EscapeCsv(item.IpAddress ?? ""),
				EscapeCsv(item.UserAgent ?? ""),
				EscapeCsv(
					item.CreatedAt.ToString("o")
				)
			);
			await writer.WriteLineAsync(line);
		}

		await writer.FlushAsync(cancellationToken);
	}

	private static async Task WriteJsonAsync(
		Stream stream,
		IAsyncEnumerable<AuditLogExportItem> items,
		CancellationToken cancellationToken
	) {
		await using var writer = new Utf8JsonWriter(
			stream,
			new JsonWriterOptions {
				Indented = false
			}
		);

		writer.WriteStartArray();

		await foreach (var item in items
			.WithCancellation(cancellationToken)
		) {
			writer.WriteStartObject();
			writer.WriteString("id", item.Id);
			writer.WriteString(
				"userName", item.UserName
			);
			writer.WriteString(
				"userEmail", item.UserEmail
			);
			writer.WriteString(
				"action", item.Action
			);

			if (item.TargetId.HasValue) {
				writer.WriteString(
					"targetId", item.TargetId.Value
				);
			} else {
				writer.WriteNull("targetId");
			}

			if (item.Details is not null) {
				writer.WriteString(
					"details", item.Details
				);
			} else {
				writer.WriteNull("details");
			}

			if (item.IpAddress is not null) {
				writer.WriteString(
					"ipAddress", item.IpAddress
				);
			} else {
				writer.WriteNull("ipAddress");
			}

			if (item.UserAgent is not null) {
				writer.WriteString(
					"userAgent", item.UserAgent
				);
			} else {
				writer.WriteNull("userAgent");
			}

			writer.WriteString(
				"createdAt",
				item.CreatedAt.ToString("o")
			);
			writer.WriteEndObject();
		}

		writer.WriteEndArray();
		await writer.FlushAsync(cancellationToken);
	}

	private static string EscapeCsv(string value) {
		// Neutralize formula injection: prefix with
		// single quote if the first non-whitespace /
		// non-control character is a formula trigger.
		// This prevents bypass via leading \t, \r, \n,
		// spaces, or other control characters.
		if (StartsWithFormulaTrigger(value)) {
			value = "'" + value;
		}

		if (value.Contains('"')
			|| value.Contains(',')
			|| value.Contains('\n')
			|| value.Contains('\r')
		) {
			return "\""
				+ value.Replace("\"", "\"\"")
				+ "\"";
		}
		return value;
	}

	private static bool StartsWithFormulaTrigger(
		string value
	) {
		foreach (var c in value) {
			if (c is '=' or '+' or '-' or '@') {
				return true;
			}
			if (!char.IsWhiteSpace(c)
				&& !char.IsControl(c)
			) {
				return false;
			}
		}
		return false;
	}
}
