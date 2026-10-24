using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// Resets a destination to the shared post (#2172): deletes its rendition row. Idempotent
/// (200 when nothing was customized, and then no audit row). 404 absent/foreign; 409 when
/// published, parked for review, replaced by a newer publication or being published right now; 422 when a segment it already published was
/// customized (that text is locked) or the shared content no longer fits the destination.
/// </summary>
public sealed class ResetPublicationRenditionForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string publicationId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IRenditionService renditionService,
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

		var result = await renditionService.ResetAsync(
			new ResetRenditionArgs(tenantId, publicationIdGuid), cancellationToken
		);
		if (result is RenditionResult.NotFound) {
			return TypedProblems.NotFound("Publication not found", ResponseKeys.NotFound);
		}

		if (result is RenditionResult.Locked locked) {
			return TypedProblems.Conflict(
				locked.Cause,
				locked.NeedsReview
					? ResponseKeys.PublicationRenditionNeedsReview
					: ResponseKeys.PublicationRenditionLocked
			);
		}

		if (result is RenditionResult.InProgress) {
			return TypedProblems.Conflict(
				"This publication is being published right now. Wait for it to finish, "
					+ "then reset it.",
				ResponseKeys.PublicationScheduleInProgress
			);
		}

		if (result is RenditionResult.Superseded) {
			return TypedProblems.Conflict(
				"A newer publication replaced this one for the same post and account. "
					+ "Customize the newer publication instead.",
				ResponseKeys.PublicationRenditionSuperseded
			);
		}

		if (result is RenditionResult.ConcurrentUpdate) {
			return TypedProblems.Conflict(
				"This publication's content was changed at the same time. Reload it and try again.",
				ResponseKeys.PublicationRenditionConflict
			);
		}

		if (result is RenditionResult.SegmentsLocked) {
			return SetPublicationRenditionForTenant.SegmentsLockedProblem();
		}

		if (result is RenditionResult.ContentInvalid contentInvalid) {
			return PublishContentProblems.ToProblem(contentInvalid.Failure);
		}

		if (result is not RenditionResult.Found found) {
			throw new InvalidOperationException("Unexpected rendition result kind");
		}

		// Idempotent: resetting a destination that was never customized changed nothing,
		// so it leaves no audit row.
		if (found.WasCustomized) {
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.RenditionReset,
					TargetId: publicationIdGuid,
					Details: new { TenantId = tenantId, PublicationId = publicationIdGuid }
				),
				cancellationToken
			);
		}

		return TypedResults.Ok(
			ApiResponse.Create(
				"Content reset to the shared post",
				ResponseKeys.PublicationRenditionResetSuccess
			)
		);
	}
}
