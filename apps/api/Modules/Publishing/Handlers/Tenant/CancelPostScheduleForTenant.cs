using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public sealed class CancelPostScheduleForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublicationService publicationService,
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

		if (!Guid.TryParse(postId, out var postIdGuid)) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.NotFound
			);
		}

		var result = await publicationService.CancelScheduleAsync(
			new CancelPostScheduleArgs(
				tenantId,
				postIdGuid,
				account.UserId
			),
			cancellationToken
		);

		if (result is null) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.NotFound
			);
		}

		if (result.DeletedCount == 0) {
			return TypedResults.Ok(ApiResponse.Create(
				"No scheduled publications to cancel",
				ResponseKeys.PostScheduleCancelNoop
			));
		}

		var message = result.KeptCount > 0
			? $"Cancelled {result.DeletedCount} scheduled publication(s); "
				+ $"{result.KeptCount} kept (publishing or already published)."
			: $"Cancelled {result.DeletedCount} scheduled publication(s).";

		return TypedResults.Ok(ApiResponse.Create(
			message,
			ResponseKeys.PostScheduleCancelledSuccess
		));
	}
}
