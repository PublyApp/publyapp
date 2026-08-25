using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record SetSocialAccountProjectsBody {
	public required JsonElement ProjectIds { get; init; }

	/// <summary>Empty array is valid: the account becomes visible everywhere.</summary>
	public IReadOnlyList<Guid> GetProjectIds() {
		return [.. ProjectIds.EnumerateArray().Select(e => e.GetGuid())];
	}
}

public class SetSocialAccountProjectsBodyValidator
	: AbstractValidator<SetSocialAccountProjectsBody> {
	public SetSocialAccountProjectsBodyValidator() {
		RuleFor(x => x.ProjectIds)
			.MustBeRequiredGuidArrayAllowingEmpty(
				"ProjectIds", "projectIds", 100
			);
	}
}

public sealed class SetSocialAccountProjectsForTenant {
	public static async Task<Results<
		Ok<SocialAccountCreated>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string socialAccountId,
		[FromBody] SetSocialAccountProjectsBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] SocialAccountService socialAccountService,
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

		if (!Guid.TryParse(socialAccountId, out var accountId)) {
			return TypedProblems.BadRequest(
				"Invalid socialAccountId",
				ResponseKeys.MalformedId
			);
		}

		var projectIds = body.GetProjectIds();

		var serviceResult = await socialAccountService.SetProjectsForTenantAsync(
			tenantId, accountId, projectIds, cancellationToken
		);

		if (serviceResult is SetSocialAccountProjectsResult.NotFound) {
			return TypedProblems.NotFound(
				"Social account not found",
				ResponseKeys.SocialAccountNotFound
			);
		}

		if (serviceResult
			is SetSocialAccountProjectsResult.InvalidProject invalid) {
			return TypedProblems.ValidationProblem(
				"One of the projects does not exist in this tenant",
				ResponseKeys.ProjectNotFound,
				new Dictionary<string, string[]> {
					["projectIds"] = [
						$"Project {invalid.ProjectId} does not exist in this tenant.",
					],
				}
			);
		}

		if (serviceResult is SetSocialAccountProjectsResult.Applied applied) {
			var item = SocialAccountService.ToListItem(applied.Account);

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.SocialAccountProjectsSet,
					TargetId: accountId,
					Details: new {
						TenantId = tenantId,
						item.ProjectIds,
						applied.AttachedCount,
						applied.DetachedCount,
					}
				),
				cancellationToken
			);

			return TypedResults.Ok(new SocialAccountCreated {
				Id = item.Id,
				Provider = item.Provider,
				ExternalAccountId = item.ExternalAccountId,
				DisplayHandle = item.DisplayHandle,
				Status = item.Status,
				CredentialType = item.CredentialType,
				LastSuccessAt = item.LastSuccessAt,
				LastError = item.LastError,
				ProjectIds = item.ProjectIds,
			});
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
