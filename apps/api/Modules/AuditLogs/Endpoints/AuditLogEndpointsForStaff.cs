using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

namespace PublyApp.Api.Modules.AuditLogs.Endpoints;

public static class AuditLogEndpointsForStaff {
	public static IEndpointRouteBuilder
		MapAuditLogEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes
			.MapGroup(
				Routes.AuditLogs.ForStaff.Root
			)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff Audit Logs");

		group.MapGet(
				Routes.AuditLogs.ForStaff.Find,
				FindAuditLogs.Handle
			)
			.WithName("FindAuditLogs")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary(
				"List audit logs with pagination"
				+ " and filters"
			)
			.WithReqQueryValidation<
				FindAuditLogsQuery>()
			.WithPermission([
				AppPermissions.Staff.AuditLogs.LIST
			]);

		group.MapGet(
				Routes.AuditLogs.ForStaff.Actions,
				GetAuditLogActions
					.Handle
			)
			.WithName("GetAuditLogActions")
			.WithSummary(
				"Get all available audit log"
				+ " action keys"
			)
			.WithPermission([
				AppPermissions.Staff.AuditLogs.LIST
			]);

		group.MapGet(
				Routes.AuditLogs.ForStaff.Export,
				ExportAuditLogs.Handle
			)
			.WithName("ExportAuditLogs")
			.RequireRateLimiting(
				ApiRateLimitPolicies.Export
			)
			.WithSummary(
				"Export audit logs as CSV or JSON"
			)
			// The handler streams CSV/JSON directly to
			// Response.Body; this metadata exists only to
			// publish both export media types in OpenAPI/Kiota.
			.Produces<byte[]>(
				StatusCodes.Status200OK,
				"text/csv",
				"application/json"
			)
			.ProducesAppProblem(
				StatusCodes.Status400BadRequest
			)
			.WithReqQueryValidation<
				ExportAuditLogsQuery>()
			.WithPermission([
				AppPermissions.Staff.AuditLogs.EXPORT
			]);

		group.MapGet(
				Routes.AuditLogs.ForStaff.GetById,
				GetAuditLogById
					.Handle
			)
			.WithName("GetAuditLogById")
			.WithSummary(
				"Get an audit log entry by ID"
			)
			.WithPermission([
				AppPermissions.Staff.AuditLogs.GET
			]);

		return routes;
	}
}
