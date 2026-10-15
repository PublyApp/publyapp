using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// Retries one Failed or Paused publication (#647). The service owns the lock,
/// the transition and the enqueue; this handler maps each refusal onto a typed
/// problem — 404 for an absent or foreign row, 409 for everything else.
/// </summary>
public sealed class RetryPublicationForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		[FromRoute] string publicationId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublicationRetryService retryService,
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

		var eligibility = await retryService.CheckAsync(
			tenantId, publicationIdGuid, cancellationToken
		);

		if (eligibility is RetryEligibility.NotFound) {
			return TypedProblems.NotFound(
				"Publication not found",
				ResponseKeys.NotFound
			);
		}

		if (eligibility is RetryEligibility.NotRetryable notRetryable) {
			return RetryPublicationForTenant._NotRetryable(notRetryable.Status);
		}

		if (eligibility is RetryEligibility.ReconnectFirst) {
			return TypedProblems.Conflict(
				"Reconnect the account first, then retry",
				ResponseKeys.PublicationRetryReconnectFirst
			);
		}

		if (eligibility is not RetryEligibility.Eligible eligible) {
			throw new InvalidOperationException("Unexpected retry eligibility kind");
		}

		var moved = await transitions.RetryAsync(
			new RetryPublicationArgs(publicationIdGuid, tenantId),
			cancellationToken
		);

		if (moved == RetryTransitionResult.NotFound) {
			return TypedProblems.NotFound(
				"Publication not found",
				ResponseKeys.NotFound
			);
		}

		if (moved == RetryTransitionResult.NotRetryable) {
			// Lost the race to a concurrent retry (or the worker): already re-queued.
			return RetryPublicationForTenant._NotRetryable(PublicationStatus.Scheduled);
		}

		if (moved == RetryTransitionResult.PairOccupied) {
			return TypedProblems.Conflict(
				"A newer publication for this post and account is already live",
				ResponseKeys.PublicationRetryPairOccupied
			);
		}

		await retryService.EnqueueAsync(
			publicationIdGuid, eligible.IdempotencyKey, cancellationToken
		);

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PublicationRetried,
				TargetId: publicationIdGuid,
				Details: new { TenantId = tenantId, PublicationId = publicationIdGuid }
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Retry started",
				ResponseKeys.PublicationRetrySuccess
			)
		);
	}

	private static AppConflictHttpResult _NotRetryable(PublicationStatus status) {
		return TypedProblems.Conflict(
			"Only a failed or paused publication can be retried; this one is "
				+ status.ToString().ToLowerInvariant(),
			ResponseKeys.PublicationRetryNotAllowed
		);
	}
}
