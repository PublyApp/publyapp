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
	[FromQuery(Name = "format")] public string? Format { get; set; }
	[FromQuery(Name = "user_id")] public string? UserId { get; set; }
	[FromQuery(Name = AuditLogActionsCsv.WireName)]
	public string? Actions { get; set; }
	[FromQuery(Name = "target_id")] public string? TargetId { get; set; }
	[FromQuery(Name = "start_date")] public string? StartDate { get; set; }
	[FromQuery(Name = "end_date")] public string? EndDate { get; set; }

	// CSV-encoded so the property remains primitive - required for
	// [AsParameters] binding and so the OpenAPI generator emits the
	// param (a List<string>? property forces a custom BindAsync,
	// which strips every query param from the OpenAPI doc and from
	// the generated Kiota client URI template).
	public IReadOnlyList<string>? GetActionsList() {
		return AuditLogActionsCsv.Parse(Actions);
	}

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
			.WithMessage("format is required")
			.Must(BeValidFormat)
			.WithMessage(
				"format must be 'csv' or 'json'"
			);

		RuleFor(x => x.UserId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"user_id must be a valid GUID"
			);

		RuleFor(x => x.Actions)
			.Custom((raw, context) => {
				var error =
					AuditLogActionsCsv.GetValidationError(raw);
				if (error is not null) {
					context.AddFailure(
						AuditLogActionsCsv.WireName,
						error
					);
				}
			});

		RuleFor(x => x.TargetId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"target_id must be a valid GUID"
			);

		RuleFor(x => x.StartDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"start_date must be a valid"
				+ " ISO 8601 date"
			);

		RuleFor(x => x.EndDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"end_date must be a valid"
				+ " ISO 8601 date"
			);

		RuleFor(x => x)
			.Custom((query, context) => {
				if (query.StartDate is null
					|| query.EndDate is null
					|| !QueryPredicates.BeValidNullableDate(
						query.StartDate
					)
					|| !QueryPredicates.BeValidNullableDate(
						query.EndDate
					)
					|| QueryPredicates.BeValidDateRange(
						query.StartDate,
						query.EndDate
					)
				) {
					return;
				}

				context.AddFailure(
					"start_date",
					"start_date must be before or equal"
					+ " to end_date"
				);
			});
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
		[AsParameters]
		ExportAuditLogsQuery query,
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		HttpContext httpContext,
		CancellationToken cancellationToken = default
	) {
		var exportArgs = new ExportAuditLogsArgs(
			UserId: query.GetUserId(),
			Actions: query.GetActionsList(),
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
				"format is required",
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

		// This endpoint streams the body itself instead of
		// returning FileContentResult, so endpoint metadata in
		// AuditLogEndpointsForStaff must stay in sync with these
		// content types.
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
		// Stream a top-level array so large exports do not need
		// to be buffered before the response starts.
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
