using System.Text.Json;

using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public record BulkDeleteTenantsAsStaffBody {
	public required JsonElement TenantIds { get; init; }
}

public record BulkDeleteTenantsResult {
	public required int SucceededCount { get; init; }
	public required int FailedCount { get; init; }
	public required List<BulkDeleteFailedItem> FailedItems { get; init; }
}

public record BulkDeleteFailedItem {
	public required Guid TenantId { get; init; }
	public required string Error { get; init; }
}

public class BulkDeleteTenantsAsStaffBodyValidator : AbstractValidator<BulkDeleteTenantsAsStaffBody> {
	public BulkDeleteTenantsAsStaffBodyValidator() {
		RuleFor(x => x.TenantIds)
			.Must(x => x.ValueKind == JsonValueKind.Array)
			.WithMessage("TenantIds must be an array")
			.Must(x => x.EnumerateArray().Any())
			.WithMessage("At least one tenant ID is required")
			.Must(x => x.EnumerateArray().Count() <= 100)
			.WithMessage("Maximum 100 tenant IDs allowed")
			.Must(x => x.EnumerateArray().All(item => item.TryGetGuid(out _)))
			.WithMessage("Every tenantId must be a valid GUID");
	}
}

public class BulkDeleteTenantsAsStaff {
	public static async Task<Results<
		Ok<BulkDeleteTenantsResult>,
		AppBadRequestHttpResult
	>> HandleBulkDeleteTenantsAsStaff(
		[FromBody] BulkDeleteTenantsAsStaffBody body,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<BulkDeleteTenantsAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
#pragma warning disable CA1873 // Logging arguments are evaluated before checking if logging is enabled
		// Parse tenant IDs (validated to be GUIDs by the validator)
		var validIds = body.TenantIds.EnumerateArray()
			.Select(id => id.GetGuid())
			.ToList();

		var result = await tenantService.BulkDeleteAsync(
			validIds,
			cancellationToken
		);

		var succeededCount = result.SucceededCount;
		var failedCount = result.FailedCount;
		logger.LogInformation(
			"Bulk delete completed: {Succeeded} succeeded, {Failed} failed",
			succeededCount,
			failedCount
		);

		// Log audit for bulk delete
		var account = authContext.AccountStaff;
		if (account is not null) {
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantBulkDeleted,
					TargetId: account.UserId,
					Details: new {
						Count = result.SucceededCount,
						FailedCount = result.FailedCount
					}
				),
				cancellationToken
			);
		}

		return TypedResults.Ok(new BulkDeleteTenantsResult {
			SucceededCount = result.SucceededCount,
			FailedCount = result.FailedCount,
			FailedItems = result.FailedItems
				.Select(f => new BulkDeleteFailedItem {
					TenantId = f.TenantId,
					Error = f.Error
				})
				.ToList()
		});
#pragma warning restore CA1873
	}
}
