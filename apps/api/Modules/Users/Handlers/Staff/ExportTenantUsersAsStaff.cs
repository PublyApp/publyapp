using System.Globalization;
using System.Text;

using FluentValidation;

using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class ExportTenantUsersAsStaffQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery(Name = "status")]
	public string? Status { get; set; }

	[FromQuery(Name = "level")]
	public string? Level { get; set; }

	[FromQuery(Name = "ids")]
	public string? Ids { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public IReadOnlySet<TenantUserStatus>? GetStatusesOrNull() {
		if (Status is null) {
			return null;
		}

		var trimmed = Status.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var statuses = new HashSet<TenantUserStatus>();
		foreach (var part in parts) {
			TenantUserStatus? parsed = UserAccount.ParseTenantStatus(part);
			if (parsed is { } status) {
				statuses.Add(status);
			}
		}

		return statuses.Count > 0 ? statuses : null;
	}

	public IReadOnlySet<AccountLevel>? GetLevelsOrNull() {
		if (Level is null) {
			return null;
		}

		var trimmed = Level.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var levels = new HashSet<AccountLevel>();
		foreach (var part in parts) {
			AccountLevel? parsed = UserAccount.ParseLevel(part);
			if (parsed is { } level) {
				levels.Add(level);
			}
		}

		return levels.Count > 0 ? levels : null;
	}

	public IReadOnlySet<Guid>? GetIdsOrNull() {
		if (Ids is null) {
			return null;
		}

		var trimmed = Ids.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var ids = new HashSet<Guid>();
		foreach (var part in parts) {
			if (Guid.TryParse(part, out var id)) {
				ids.Add(id);
			}
		}

		return ids.Count > 0 ? ids : null;
	}
}

public class ExportTenantUsersAsStaffQueryValidator
	: AbstractValidator<ExportTenantUsersAsStaffQuery> {
	// Reuse the same allowed wire tokens as FindTenantUsersAsStaffQueryValidator so the
	// export endpoint accepts exactly the filters the list page can produce.
	private static readonly HashSet<string> AllowedStatusSet = new(
		StringComparer.OrdinalIgnoreCase
	) {
		"active",
		"suspended",
		"globally_suspended",
	};

	private static readonly HashSet<string> AllowedLevelSet = new(
		StringComparer.OrdinalIgnoreCase
	) {
		"admin",
		"user",
	};

	public ExportTenantUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200)
			.WithMessage("q must be at most 200 characters");

		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				return parts.Length > 0
					&& parts.All(p => p.Length > 0 && AllowedStatusSet.Contains(p));
			})
			.WithMessage("status must be one of: active, suspended, globally_suspended");

		RuleFor(x => x.Level)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				return parts.Length > 0
					&& parts.All(p => p.Length > 0 && AllowedLevelSet.Contains(p));
			})
			.WithMessage("level must be one of: admin, user");

		RuleFor(x => x.Ids)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				// Bounded like every other bulk-id surface; keeps export-by-selection
				// consistent with BULK_ACTION_MAX_COUNT.
				return parts.Length > 0
					&& parts.Length <= 100
					&& parts.All(p => p.Length > 0 && Guid.TryParse(p, out _));
			})
			.WithMessage("ids must be a comma-separated list of at most 100 valid GUIDs");
	}
}

public sealed class ExportTenantUsersAsStaff {
	public static async Task<IResult> Handle(
		[FromRoute] string tenantId,
		[AsParameters] ExportTenantUsersAsStaffQuery query,
		[FromServices] ITenantUserQueryService tenantUserQueryService,
		HttpContext httpContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest("Invalid tenant ID", ResponseKeys.MalformedId);
		}

		var exportArgs = new ExportTenantUsersArgs(
			Search: query.GetSearchNormalized(),
			Status: query.GetStatusesOrNull(),
			Level: query.GetLevelsOrNull(),
			Ids: query.GetIdsOrNull()
		);

		var exceedsLimit = await tenantUserQueryService.ExportExceedsLimitAsync(
			tenantIdGuid,
			exportArgs,
			cancellationToken
		);

		if (exceedsLimit) {
			return TypedProblems.BadRequest(
				"Export exceeds the maximum row limit. Please narrow your filters.",
				ResponseKeys.BadRequest
			);
		}

		var timestamp = DateTime.UtcNow
			.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
		var fileName = $"tenant-users-{timestamp}.csv";

		// This endpoint streams the body itself instead of returning
		// FileContentResult, so endpoint metadata in UserEndpointsForTenantAsStaff
		// must stay in sync with this content type.
		httpContext.Response.ContentType = "text/csv";
		httpContext.Response.Headers.ContentDisposition =
			$"attachment; filename=\"{fileName}\"";

		var items = tenantUserQueryService.ExportAsync(
			tenantIdGuid,
			exportArgs,
			cancellationToken
		);

		await WriteCsvAsync(httpContext.Response.Body, items, cancellationToken);

		return Results.Empty;
	}

	private static async Task WriteCsvAsync(
		Stream stream,
		IAsyncEnumerable<TenantUserExportItem> items,
		CancellationToken cancellationToken
	) {
		await using var writer = new StreamWriter(stream, Encoding.UTF8, leaveOpen: true);

		await writer.WriteLineAsync("Email,FirstName,LastName,Level,Status,CreatedAt");

		await foreach (var item in items.WithCancellation(cancellationToken)) {
			var line = string.Join(",",
				EscapeCsv(item.Email),
				EscapeCsv(item.FirstName ?? ""),
				EscapeCsv(item.LastName ?? ""),
				EscapeCsv(item.Level),
				EscapeCsv(item.Status),
				EscapeCsv(item.CreatedAt.ToString("o"))
			);
			await writer.WriteLineAsync(line);
		}

		await writer.FlushAsync(cancellationToken);
	}

	private static string EscapeCsv(string value) {
		// Neutralize formula injection: prefix with single quote if the first
		// non-whitespace/non-control character is a formula trigger. This
		// prevents bypass via leading \t, \r, \n, spaces, or other control chars.
		if (StartsWithFormulaTrigger(value)) {
			value = "'" + value;
		}

		if (value.Contains('"') || value.Contains(',') || value.Contains('\n') || value.Contains('\r')) {
			return "\"" + value.Replace("\"", "\"\"") + "\"";
		}
		return value;
	}

	private static bool StartsWithFormulaTrigger(string value) {
		foreach (var c in value) {
			if (c is '=' or '+' or '-' or '@') {
				return true;
			}
			if (!char.IsWhiteSpace(c) && !char.IsControl(c)) {
				return false;
			}
		}
		return false;
	}
}
