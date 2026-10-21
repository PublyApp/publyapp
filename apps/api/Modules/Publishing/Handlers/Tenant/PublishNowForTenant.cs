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
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// Publish-now body. Two shapes: <c>accountIds</c>, or <c>destinations</c> (#2172):
/// <c>[{socialAccountId, overrides?}]</c> (no per-destination time: it publishes now).
/// </summary>
public sealed class PublishNowBody {
	public JsonElement AccountIds { get; init; }
	public JsonElement Destinations { get; init; }

	public bool HasDestinations() {
		return this.Destinations.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null);
	}

	public List<Guid> GetAccountIds() {
		if (this.HasDestinations()) {
			return this._ParseDestinations().Select(item => item.SocialAccountId).Distinct().ToList();
		}

		var accountIds = new List<Guid>();

		foreach (var accountIdElement in this.AccountIds.EnumerateArray()) {
			accountIds.Add(accountIdElement.GetValueAsGuid());
		}

		return accountIds;
	}

	public IReadOnlyDictionary<Guid, RenditionOverrides> GetOverrides() {
		return this.HasDestinations()
			? this._ParseDestinations()
				.Where(item => item.Overrides is not null)
				.ToDictionary(item => item.SocialAccountId, item => item.Overrides ?? RenditionOverrides.None)
			: new Dictionary<Guid, RenditionOverrides>();
	}

	private List<RenditionWire.Destination> _ParseDestinations() {
		if (!RenditionWire.TryParseDestinations(this.Destinations, false, out var parsed, out var error)) {
			throw new InvalidOperationException(error);
		}

		return parsed;
	}
}

public sealed class PublishNowBodyValidator
	: AbstractValidator<PublishNowBody> {
	public PublishNowBodyValidator() {
		this.When(x => !x.HasDestinations(), () => {
			this.RuleFor(x => x.AccountIds)
				.MustBeRequiredGuidArray(
					fieldName: "accountIds",
					itemName: "accountId",
					maxCount: 20
				);
		});

		this.When(x => x.HasDestinations(), () => {
			this.RuleFor(x => x.Destinations)
				.Custom((destinations, context) => {
					if (context.InstanceToValidate.AccountIds.ValueKind
						is not (JsonValueKind.Undefined or JsonValueKind.Null)) {
						context.AddFailure("Send either accountIds or destinations, not both.");
						return;
					}

					if (!RenditionWire.TryParseDestinations(destinations, false, out _, out var error)) {
						context.AddFailure(error);
					}
				});
		});
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
				SocialAccountIds: requestedAccountIds,
				Overrides: body.GetOverrides()
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

		if (result is PublishNowResult.ContentInvalid contentInvalid) {
			return PublishContentProblems.ToProblem(contentInvalid.Failure);
		}

		if (result is PublishNowResult.OverridesInvalid overridesInvalid) {
			return PublishContentProblems.ToProblem(overridesInvalid.Failure);
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
