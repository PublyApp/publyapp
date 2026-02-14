using System.Globalization;
using System.Text;
using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
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
			.Must(BeValidNullableGuid)
			.WithMessage(
				"UserId must be a valid GUID"
			);

		RuleFor(x => x.TargetId)
			.Must(BeValidNullableGuid)
			.WithMessage(
				"TargetId must be a valid GUID"
			);

		RuleFor(x => x.StartDate)
			.Must(BeValidNullableDate)
			.WithMessage(
				"StartDate must be a valid"
				+ " ISO 8601 date"
			);

		RuleFor(x => x.EndDate)
			.Must(BeValidNullableDate)
			.WithMessage(
				"EndDate must be a valid"
				+ " ISO 8601 date"
			);

		RuleFor(x => x)
			.Must(HaveValidDateRange)
			.WithMessage(
				"StartDate must be before or equal"
				+ " to EndDate"
			)
			.When(x =>
				x.StartDate is not null
				&& x.EndDate is not null
				&& BeValidNullableDate(x.StartDate)
				&& BeValidNullableDate(x.EndDate)
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

	private static bool BeValidNullableGuid(
		string? value
	) {
		if (value is null) {
			return true;
		}
		return Guid.TryParse(value, out _);
	}

	private static bool BeValidNullableDate(
		string? value
	) {
		if (value is null) {
			return true;
		}
		return DateTime.TryParse(
			value,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out _
		);
	}

	private static bool HaveValidDateRange(
		ExportAuditLogsQuery query
	) {
		if (query.StartDate is null
			|| query.EndDate is null
		) {
			return true;
		}

		var startParsed = DateTime.TryParse(
			query.StartDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var start
		);
		var endParsed = DateTime.TryParse(
			query.EndDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var end
		);

		if (!startParsed || !endParsed) {
			return true;
		}

		return start <= end;
	}
}

public static class ExportAuditLogs {
	public static async Task<IResult>
		HandleExportAuditLogs(
		[AsParameters] ExportAuditLogsQuery query,
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		HttpContext httpContext,
		CancellationToken cancellationToken = default
	) {
		var exportArgs = ParseExportArgs(query);

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

		var format = query.Format!.ToLowerInvariant();
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

	private static ExportAuditLogsArgs ParseExportArgs(
		ExportAuditLogsQuery query
	) {
		Guid? userId = null;
		if (query.UserId is not null) {
			if (Guid.TryParse(
				query.UserId, out var parsed
			)) {
				userId = parsed;
			}
		}

		Guid? targetId = null;
		if (query.TargetId is not null) {
			if (Guid.TryParse(
				query.TargetId, out var parsed
			)) {
				targetId = parsed;
			}
		}

		DateTime? startDate = null;
		if (query.StartDate is not null) {
			if (DateTime.TryParse(
				query.StartDate,
				CultureInfo.InvariantCulture,
				DateTimeStyles.RoundtripKind,
				out var parsed
			)) {
				startDate = parsed;
			}
		}

		DateTime? endDate = null;
		if (query.EndDate is not null) {
			if (DateTime.TryParse(
				query.EndDate,
				CultureInfo.InvariantCulture,
				DateTimeStyles.RoundtripKind,
				out var parsed
			)) {
				endDate = parsed;
			}
		}

		return new ExportAuditLogsArgs(
			UserId: userId,
			Action: query.Action,
			TargetId: targetId,
			StartDate: startDate,
			EndDate: endDate
		);
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
