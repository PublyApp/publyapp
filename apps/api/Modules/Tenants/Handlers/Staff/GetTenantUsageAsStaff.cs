using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public class GetTenantUsageAsStaffResult {
	public Guid TenantId { get; set; }
	public int UsersActive { get; set; }
	public int UsersTotal { get; set; }
	public int ProjectsCount { get; set; }
	public int ScheduledPublicationsCount { get; set; }

	/// <summary>
	/// Throttled tenant last-activity timestamp (lags real activity by design).
	/// </summary>
	public DateTime? LastActivityAt { get; set; }

	/// <summary>
	/// Freshness contract: the UTC instant this snapshot was computed at. The
	/// UI renders it next to the numbers so a stale payload never poses as
	/// fresh data (transparent-failure/honesty product rule).
	/// </summary>
	public DateTime ComputedAt { get; set; }
}

public sealed class GetTenantUsageAsStaff {
	public static async Task<
		Results<
			Ok<GetTenantUsageAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromServices] ITenantUsageService tenantUsageService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		var usage = await tenantUsageService.GetTenantUsageAsync(
			tenantIdGuid, cancellationToken
		);

		if (usage is null) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(new GetTenantUsageAsStaffResult {
			TenantId = usage.TenantId,
			UsersActive = usage.UsersActive,
			UsersTotal = usage.UsersTotal,
			ProjectsCount = usage.ProjectsCount,
			ScheduledPublicationsCount = usage.ScheduledPublicationsCount,
			LastActivityAt = usage.LastActivityAt,
			ComputedAt = usage.ComputedAt,
		});
	}
}
