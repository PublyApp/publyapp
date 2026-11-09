using System.Globalization;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Modules.Dashboard.Services;
using PublyApp.Api.Modules.Dashboard.Validation;

namespace PublyApp.Api.Modules.Dashboard.Handlers.Staff;

public static class DashboardMetrics {
	public const string AuditEvents = "audit_events";
	public const string SignIns = "sign_ins";
	public const string FailedSignIns = "failed_sign_ins";
	public const string ActiveTenants = "active_tenants";

	/// <summary>The metrics the endpoint actually serves.</summary>
	public static readonly string[] Available = [
		DashboardMetrics.AuditEvents,
		DashboardMetrics.SignIns,
		DashboardMetrics.FailedSignIns,
	];

	public const string ActiveTenantsUnavailable =
		"active_tenants is not available: organisations store only their "
		+ "current status, activation is not audited, and lifecycle audit "
		+ "writes are best-effort, so a past daily count cannot be computed "
		+ "from stored data without inventing values. "
		+ "Use metric=audit_events, metric=sign_ins or "
		+ "metric=failed_sign_ins.";
}

public class GetDashboardSeriesForStaffQuery
	: IDashboardWindowQuery {
	[FromQuery(Name = "metric")] public string? Metric { get; set; }
	[FromQuery(Name = "start_date")] public string? StartDate { get; set; }
	[FromQuery(Name = "end_date")] public string? EndDate { get; set; }
}

public class GetDashboardSeriesForStaffQueryValidator
	: DashboardWindowQueryValidator<GetDashboardSeriesForStaffQuery> {
	public GetDashboardSeriesForStaffQueryValidator() {
		this.RuleFor(x => x.Metric)
			.Custom((metric, context) => {
				if (string.IsNullOrWhiteSpace(metric)) {
					context.AddFailure(
						"metric",
						"metric is required"
					);
					return;
				}

				var normalized = metric.Trim();
				foreach (var available in DashboardMetrics.Available) {
					if (string.Equals(
						normalized,
						available,
						StringComparison.OrdinalIgnoreCase
					)) {
						return;
					}
				}

				if (string.Equals(
					normalized,
					DashboardMetrics.ActiveTenants,
					StringComparison.OrdinalIgnoreCase
				)) {
					context.AddFailure(
						"metric",
						DashboardMetrics.ActiveTenantsUnavailable
					);
					return;
				}

				context.AddFailure(
					"metric",
					"metric must be one of: "
					+ string.Join(", ", DashboardMetrics.Available)
				);
			});
	}
}

public sealed class GetDashboardSeriesForStaffResponse {
	public required string Metric { get; init; }
	public required string StartDate { get; init; }
	public required string EndDate { get; init; }
	public required IReadOnlyList<DashboardSeriesPoint> Points {
		get; init;
	}
}

public sealed class GetDashboardSeriesForStaff {
	public static async Task<Ok<GetDashboardSeriesForStaffResponse>>
		Handle(
		[AsParameters]
		GetDashboardSeriesForStaffQuery query,
		[FromServices]
		IDashboardQueryService dashboardQueryService,
		CancellationToken cancellationToken = default
	) {
		if (!DashboardQueryRules.TryParseWindow(
			query.StartDate,
			query.EndDate,
			out var start,
			out var end
		)) {
			throw new InvalidOperationException(
				"Dashboard series window passed validation "
				+ "but could not be parsed."
			);
		}

		// The validator already restricted the value to a served metric.
		var metric = DashboardMetrics.Available.First(available =>
			string.Equals(
				available,
				query.Metric?.Trim(),
				StringComparison.OrdinalIgnoreCase
			)
		);
		var args = new GetDashboardSeriesArgs(start, end);

		var points = metric switch {
			DashboardMetrics.SignIns =>
				await dashboardQueryService.GetSignInSeriesAsync(
					args,
					cancellationToken
				),
			DashboardMetrics.FailedSignIns =>
				await dashboardQueryService.GetFailedSignInSeriesAsync(
					args,
					cancellationToken
				),
			_ => await dashboardQueryService.GetAuditEventSeriesAsync(
				args,
				cancellationToken
			),
		};

		return TypedResults.Ok(
			new GetDashboardSeriesForStaffResponse {
				Metric = metric,
				StartDate = start.ToString(
					"yyyy-MM-dd",
					CultureInfo.InvariantCulture
				),
				EndDate = end.ToString(
					"yyyy-MM-dd",
					CultureInfo.InvariantCulture
				),
				Points = points,
			}
		);
	}
}
