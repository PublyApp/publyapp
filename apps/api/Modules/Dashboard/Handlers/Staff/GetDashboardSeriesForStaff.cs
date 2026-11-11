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
	public const string Members = "members";
	public const string PendingInvitations = "pending_invitations";

	/// <summary>The metrics the endpoint actually serves.</summary>
	public static readonly string[] Available = [
		DashboardMetrics.AuditEvents,
		DashboardMetrics.SignIns,
		DashboardMetrics.FailedSignIns,
		DashboardMetrics.ActiveTenants,
		DashboardMetrics.Members,
		DashboardMetrics.PendingInvitations,
	];
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

	/// <summary>
	/// The first day the series is measured from (the earliest recorded
	/// transition), for the metrics backed by a recorded history
	/// (<c>active_tenants</c>). The days before it are not measured values and
	/// must not be shown as 0 (#2349). <c>null</c> for the audit-log metrics and
	/// for <c>members</c> / <c>pending_invitations</c> (rebuilt from the rows'
	/// own timestamps, exact back to the first row), which cover the whole window.
	/// </summary>
	public string? RecordedSince { get; init; }

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

		IReadOnlyList<DashboardSeriesPoint> points;
		string? recordedSince = null;
		switch (metric) {
			case DashboardMetrics.SignIns:
				points = await dashboardQueryService.GetSignInSeriesAsync(
					args,
					cancellationToken
				);
				break;
			case DashboardMetrics.FailedSignIns:
				points = await dashboardQueryService.GetFailedSignInSeriesAsync(
					args,
					cancellationToken
				);
				break;
			case DashboardMetrics.ActiveTenants: {
					var series =
						await dashboardQueryService.GetActiveTenantSeriesAsync(
							args,
							cancellationToken
						);
					points = series.Points;
					recordedSince = series.RecordedSince?.ToString(
						"yyyy-MM-dd",
						CultureInfo.InvariantCulture
					);
					break;
				}
			case DashboardMetrics.Members:
				points = await dashboardQueryService.GetMemberSeriesAsync(
					args,
					cancellationToken
				);
				break;
			case DashboardMetrics.PendingInvitations:
				points = await dashboardQueryService
					.GetPendingInvitationSeriesAsync(args, cancellationToken);
				break;
			default:
				points = await dashboardQueryService.GetAuditEventSeriesAsync(
					args,
					cancellationToken
				);
				break;
		}

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
				RecordedSince = recordedSince,
				Points = points,
			}
		);
	}
}
