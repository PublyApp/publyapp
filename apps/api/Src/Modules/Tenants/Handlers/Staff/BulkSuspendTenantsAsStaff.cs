using System.Text.Json;

using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using ILogger = Microsoft.Extensions.Logging.ILogger;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public record BulkSuspendTenantsAsStaffBody {
	public required JsonElement TenantIds { get; init; }
	public JsonElement? Reason { get; init; }
}

public record BulkSuspendTenantsResult {
	public required int SucceededCount { get; init; }
	public required int FailedCount { get; init; }
	public required List<BulkSuspendFailedItem> FailedItems { get; init; }
}

public record BulkSuspendFailedItem {
	public required Guid TenantId { get; init; }
	public required string Error { get; init; }
}

public class BulkSuspendTenantsAsStaffBodyValidator : AbstractValidator<BulkSuspendTenantsAsStaffBody> {
	public BulkSuspendTenantsAsStaffBodyValidator() {
		RuleFor(x => x.TenantIds)
			.Must(x => x.ValueKind == JsonValueKind.Array)
			.WithMessage("TenantIds must be an array")
			.Must(x => x.EnumerateArray().Count() > 0)
			.WithMessage("At least one tenant ID is required")
			.Must(x => x.EnumerateArray().Count() <= 100)
			.WithMessage("Maximum 100 tenant IDs allowed")
			.Must(x => x.EnumerateArray().All(item => item.TryGetGuid(out _)))
			.WithMessage("Every tenantId must be a valid GUID");

		RuleFor(x => x.Reason)
			.Must(x => x is null ||
				x.Value.ValueKind == JsonValueKind.Null ||
				x.Value.ValueKind == JsonValueKind.Undefined ||
				x.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Reason must be a string")
			.DependentRules(() => {
				RuleFor(x => x.Reason)
					.Must(x => {
						if (x is null ||
							x.Value.ValueKind == JsonValueKind.Null ||
							x.Value.ValueKind == JsonValueKind.Undefined) {
							return true;
						}
						var reasonString = x.Value.GetString();
						return reasonString is null || reasonString.Length <= 500;
					})
					.WithMessage("Reason must be 500 characters or less");
			});
	}
}

public static class BulkSuspendTenantsAsStaff {
	public static async Task<Results<
		Ok<BulkSuspendTenantsResult>,
		AppBadRequestHttpResult
	>> HandleBulkSuspendTenantsAsStaff(
		[FromBody] BulkSuspendTenantsAsStaffBody body,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger logger,
		CancellationToken cancellationToken = default
	) {
#pragma warning disable CA1873 // Logging arguments are evaluated before checking if logging is enabled
		// Parse tenant IDs (validated to be GUIDs by the validator)
		var validIds = body.TenantIds.EnumerateArray()
			.Select(id => id.GetGuid())
			.ToList();

		var reason = body.Reason?.ValueKind == JsonValueKind.String
			? body.Reason.Value.GetString()
			: null;

		var result = await tenantService.BulkSuspendAsync(
			validIds,
			cancellationToken
		);

		logger.LogInformation(
			"Bulk suspend completed: {Succeeded} succeeded, {Failed} failed",
			result.SucceededCount,
			result.FailedCount);

		// Log audit for each successful suspension
		var account = authContext.AccountStaff;
		if (account is not null) {
			// We can't easily get individual tenant names in bulk without extra queries
			// Log a summary audit entry
			await auditLogService.LogAsync(
				account.UserId,
				AuditActions.TenantBulkSuspended,
				account.UserId, // Use actor as target since multiple tenants
				new {
					Count = result.SucceededCount,
					FailedCount = result.FailedCount,
					Reason = reason
				},
				cancellationToken
			);
		}

		return TypedResults.Ok(new BulkSuspendTenantsResult {
			SucceededCount = result.SucceededCount,
			FailedCount = result.FailedCount,
			FailedItems = result.FailedItems
				.Select(f => new BulkSuspendFailedItem {
					TenantId = f.TenantId,
					Error = f.Error
				})
				.ToList()
		});
#pragma warning restore CA1873
	}
}
