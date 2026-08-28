using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public sealed class PublishNowBody {
	[Required]
	public JsonElement AccountIds { get; init; }

	public List<Guid> GetAccountIds() {
		var accountIds = new List<Guid>();

		foreach (var accountIdElement in AccountIds.EnumerateArray()) {
			accountIds.Add(accountIdElement.GetValueAsGuid());
		}

		return accountIds;
	}
}

public sealed class PublishNowBodyValidator
	: AbstractValidator<PublishNowBody> {
	public PublishNowBodyValidator() {
		RuleFor(x => x.AccountIds)
			.MustBeRequiredGuidArray(
				fieldName: "accountIds",
				itemName: "accountId",
				maxCount: 20
			);
	}
}

/// <summary>
/// Publishes a post NOW through the chosen connected accounts (D2 Task 2):
/// the handler orchestrates only — publications + job enqueues live in
/// <see cref="PublishNowService"/> behind the trusted enqueue boundary, and
/// every refusal names its cause in plain words under a stable errors key.
/// </summary>
public sealed class PublishNowForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromBody] PublishNowBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublishNowService publishNowService,
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

		if (!Guid.TryParse(postId, out var postIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid postId",
				ResponseKeys.MalformedId
			);
		}

		var requestedAccountIds = body.GetAccountIds();

		var result = await publishNowService.PublishNowAsync(
			new PublishNowArgs(
				TenantId: tenantId,
				PostId: postIdGuid,
				ActorUserId: account.UserId,
				SocialAccountIds: requestedAccountIds
			),
			cancellationToken
		);

		if (result is PublishNowResult.PostNotFound) {
			return TypedProblems.NotFound("Post not found", ResponseKeys.NotFound);
		}

		if (result is PublishNowResult.LivePublicationsExist overlap) {
			return TypedProblems.ValidationProblem(
				"Some accounts already hold a live publication for this post",
				ResponseKeys.RequestBodyValidationFailed,
				new Dictionary<string, string[]> {
					["accountIds"] = [.. overlap.AccountIds.Select(id => id.ToString())],
				}
			);
		}

		if (result is PublishNowResult.AccountsNotFound unknownAccounts) {
			return TypedProblems.ValidationProblem(
				"Some accounts were not found in this tenant",
				ResponseKeys.RequestBodyValidationFailed,
				new Dictionary<string, string[]> {
					["accountIds"] = [.. unknownAccounts.AccountIds.Select(id => id.ToString())],
				}
			);
		}

		if (result is not PublishNowResult.Created created) {
			throw new InvalidOperationException("Unexpected publish-now result kind");
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PublishNowStarted,
				TargetId: postIdGuid,
				Details: new {
					TenantId = tenantId,
					PostId = postIdGuid,
					AccountIds = requestedAccountIds,
					PublicationIds = created.PublicationIds,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Publishing started",
				ResponseKeys.PublishNowSuccess
			)
		);
	}
}
