using MainApi.Lib;
using MainApi.Lib.Extensions;
using MainApi.Lib.Filters;
using MainApi.Lib.Routes;
using MainApi.Modules.AuditLogs.Handlers.Staff;

namespace MainApi.Modules.AuditLogs.Endpoints;

public static class AuditLogEndpointsForStaff {
	public static IEndpointRouteBuilder
		MapAuditLogEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes
			.MapGroup(
				Routes.AuditLogs.ForStaff.Root
			)
			.WithTags("Staff Audit Logs");

		group.MapGet(
				Routes.AuditLogs.ForStaff.Find,
				FindAuditLogs.HandleFindAuditLogs
			)
			.WithName("FindAuditLogs")
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
					.HandleGetAuditLogActions
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
				ExportAuditLogs.HandleExportAuditLogs
			)
			.WithName("ExportAuditLogs")
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
					.HandleGetAuditLogById
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
