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

public record BulkDeleteTenantsAsStaffBody {
	public JsonElement TenantIds { get; init; }
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
			.Cascade(CascadeMode.Stop)
			.MustBeRequiredGuidArray("TenantIds", "tenant ID", 100);
	}
}

public sealed class BulkDeleteTenantsAsStaff {
	public static async Task<Results<
		Ok<BulkDeleteTenantsResult>,
		AppBadRequestHttpResult
	>> Handle(
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

		// The bulk delete already committed above; audit persistence is
		// best-effort from here so it never turns an already-successful mutation
		// into a 500 (round-5 API F2 — sweep of every post-commit side effect).
		var account = authContext.AccountStaff;
		if (account is not null) {
			try {
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
			} catch (Exception ex) {
				logger.LogWarning(
					ex,
					"Failed to write audit log for tenant bulk delete by staff user {UserId}",
					account.UserId
				);
			}
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
