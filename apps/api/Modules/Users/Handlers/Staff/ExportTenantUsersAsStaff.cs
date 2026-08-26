using System.Globalization;
using System.Text;

using FluentValidation;

using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
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
		return TenantUserFilterQuery.NormalizeSearch(Search);
	}

	public IReadOnlySet<TenantUserStatus>? GetStatusesOrNull() {
		return TenantUserFilterQuery.ParseStatuses(Status);
	}

	public IReadOnlySet<AccountLevel>? GetLevelsOrNull() {
		return TenantUserFilterQuery.ParseLevels(Level);
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
	public ExportTenantUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200)
			.WithMessage("q must be at most 200 characters");

		// Shares TenantUserFilterQuery.AllowedStatusSet/AllowedLevelSet with
		// FindTenantUsersAsStaffQueryValidator so the export endpoint accepts
		// exactly the filters the list page can produce — a new enum member
		// added there is automatically accepted here too.
		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrWhiteSpace(raw)) {
					return true;
				}

				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				return parts.Length > 0
					&& parts.All(p => p.Length > 0 && TenantUserFilterQuery.AllowedStatusSet.Contains(p));
			})
			.WithMessage($"status must be one of: {TenantUserFilterQuery.AllowedStatusesDisplay}");

		RuleFor(x => x.Level)
			.Must(raw => {
				if (string.IsNullOrWhiteSpace(raw)) {
					return true;
				}

				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				return parts.Length > 0
					&& parts.All(p => p.Length > 0 && TenantUserFilterQuery.AllowedLevelSet.Contains(p));
			})
			.WithMessage($"level must be one of: {TenantUserFilterQuery.AllowedLevelsDisplay}");

		RuleFor(x => x.Ids)
			.Must(raw => {
				if (string.IsNullOrWhiteSpace(raw)) {
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
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<ExportTenantUsersAsStaff> logger,
		HttpContext httpContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest("Invalid tenant ID", ResponseKeys.MalformedId);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		var maxRows = AppEnvironment.Instance.TENANT_USER_EXPORT_MAX_ROWS;
		var exportArgs = new ExportTenantUsersArgs(
			Search: query.GetSearchNormalized(),
			Status: query.GetStatusesOrNull(),
			Level: query.GetLevelsOrNull(),
			Ids: query.GetIdsOrNull(),
			Limit: maxRows + 1
		);

		var items = await tenantUserQueryService.FindExportRowsAsync(
			tenantIdGuid,
			exportArgs,
			cancellationToken
		);

		if (items.Count > maxRows) {
			return TypedProblems.BadRequest(
				"Export exceeds the maximum row limit. Please narrow your filters.",
				ResponseKeys.BadRequest
			);
		}

		var rowCount = items.Count;

		// Exporting emails/names/etc. for every matching user is a PII bulk-read;
		// audit it before streaming starts. A failed audit write must never block
		// an otherwise-authorized export, so this is a logged, non-fatal try/catch.
		try {
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantUserExported,
					TargetId: tenantIdGuid,
					Details: new {
						TenantId = tenantIdGuid,
						exportArgs.Search,
						Status = exportArgs.Status,
						Level = exportArgs.Level,
						Ids = exportArgs.Ids,
						RowCount = rowCount
					}
				),
				cancellationToken
			);
		} catch (Exception ex) {
			logger.LogWarning(ex, "Failed to write audit log for tenant user export");
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

		await WriteCsvAsync(httpContext, items, cancellationToken);

		return Results.Empty;
	}

	// Public (not private) so the response-write failure abort path can be
	// exercised directly with a throwing enumerable and a fake
	// IHttpRequestLifetimeFeature.
	public static async Task WriteCsvAsync(
		HttpContext httpContext,
		IEnumerable<TenantUserExportItem> items,
		CancellationToken cancellationToken
	) {
		await using var writer = new StreamWriter(httpContext.Response.Body, Encoding.UTF8, leaveOpen: true);

		try {
			await writer.WriteLineAsync("Email,FirstName,LastName,Level,Status,CreatedAt");

			foreach (var item in items) {
				cancellationToken.ThrowIfCancellationRequested();
				var line = string.Join(",",
					EscapeCsv(item.Email),
					EscapeCsv(item.FirstName ?? ""),
					EscapeCsv(item.LastName ?? ""),
					EscapeCsv(item.Level.ToString()),
					EscapeCsv(item.Status.ToString()),
					EscapeCsv(item.CreatedAt.ToString("o"))
				);
				await writer.WriteLineAsync(line);
			}

			await writer.FlushAsync(cancellationToken);
		} catch (Exception) when (!cancellationToken.IsCancellationRequested) {
			// The response may already be partially written and committed, so the
			// global exception handler cannot turn this into a problem+json body —
			// abort the connection so the client observes a failed transfer instead
			// of a truncated CSV that looks like a complete, successful export.
			httpContext.Abort();
			throw;
		}
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
