using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// Resolves a needs-review publication (#2176): the user checked the provider
/// profile and confirms the post is there. 404 for an absent or foreign row, 409
/// when the publication is not waiting for review.
/// </summary>
public sealed class MarkPublicationPublishedForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		[FromRoute] string publicationId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublicationStatusTransitionService transitions,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		if (!Guid.TryParse(publicationId, out var publicationIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid publicationId",
				ResponseKeys.MalformedId
			);
		}

		var result = await transitions.MarkReviewedPublishedAsync(
			new MarkPublicationReviewedPublishedArgs(publicationIdGuid, tenantId),
			cancellationToken
		);

		if (result == ReviewedPublishedResult.NotFound) {
			return TypedProblems.NotFound(
				"Publication not found",
				ResponseKeys.NotFound
			);
		}

		if (result == ReviewedPublishedResult.NotNeedsReview) {
			return TypedProblems.Conflict(
				"Only a publication that needs review can be marked as published",
				ResponseKeys.PublicationMarkPublishedNotAllowed
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PublicationMarkedPublished,
				TargetId: publicationIdGuid,
				Details: new { TenantId = tenantId, PublicationId = publicationIdGuid }
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Marked as published",
				ResponseKeys.PublicationMarkPublishedSuccess
			)
		);
	}
}
