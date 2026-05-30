using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Modules.AuditLogs.Services;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

public record GetAuditLogActionsResponse {
	public required IReadOnlyList<string> Actions {
		get; init;
	}
}

public sealed class GetAuditLogActions {
	public static async Task<Ok<GetAuditLogActionsResponse>>
		Handle(
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		CancellationToken cancellationToken = default
	) {
		var actions =
			await auditLogQueryService
				.GetDistinctActionsAsync(
					cancellationToken
				);

		return TypedResults.Ok(
			new GetAuditLogActionsResponse {
				Actions = actions
			}
		);
	}
}
