using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public record BulkSuspendTenantsAsStaffBody {
	public JsonElement TenantIds { get; init; }
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
			.Cascade(CascadeMode.Stop)
			.MustBeRequiredGuidArray("TenantIds", "tenant ID", 100);

		RuleFor(x => x.Reason)
			.MustBeNullableStringWithMaxLength("Reason", 500);
	}
}

public sealed class BulkSuspendTenantsAsStaff {
	public static async Task<Results<
		Ok<BulkSuspendTenantsResult>,
		AppBadRequestHttpResult
	>> Handle(
		[FromBody] BulkSuspendTenantsAsStaffBody body,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<BulkSuspendTenantsAsStaff> logger,
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
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantBulkSuspended,
					TargetId: account.UserId, // Use actor as target since multiple tenants
					Details: new {
						Count = result.SucceededCount,
						FailedCount = result.FailedCount,
						Reason = reason
					}
				),
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
