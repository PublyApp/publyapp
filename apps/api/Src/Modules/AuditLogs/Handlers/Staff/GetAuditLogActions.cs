using MainApi.Src.Modules.AuditLogs.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

public record GetAuditLogActionsResponse {
	public required IReadOnlyList<string> Actions {
		get; init;
	}
}

public static class GetAuditLogActions {
	public static async Task<Ok<GetAuditLogActionsResponse>>
		HandleGetAuditLogActions(
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
