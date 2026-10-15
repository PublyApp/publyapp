using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record StartMastodonConnectBody {
	public required JsonElement Instance { get; init; }

	public string GetInstance() {
		return this.Instance.GetValueAsString();
	}
}

public class StartMastodonConnectBodyValidator : AbstractValidator<StartMastodonConnectBody> {
	public StartMastodonConnectBodyValidator() {
		this.RuleFor(x => x.Instance).MustBeRequiredStringWithLength("Instance", 1, 300);
	}
}

public record MastodonConnectStarted {
	/// <summary>The instance's authorization page: the browser goes there next.</summary>
	public required string AuthorizeUrl { get; init; }
}

public sealed class StartMastodonConnectForTenant {
	public static async Task<Results<
		Ok<MastodonConnectStarted>,
		AppProviderUnavailableHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromBody] StartMastodonConnectBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] MastodonOAuthService oauthService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException($"{nameof(authContext.TenantId)} is not a GUID");
		}

		var account = authContext.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. Ensure the endpoint has .WithTenantPermission(...) middleware."
			);
		}

		var instance = body.GetInstance();
		var result = await oauthService.StartAsync(tenantId, account.UserId, instance, cancellationToken);

		if (result is StartMastodonConnectResult.InvalidInstance) {
			const string reason = "Enter the public https address of a Mastodon server, such as mastodon.social.";
			return TypedProblems.ValidationProblem(
				reason,
				ResponseKeys.MastodonInstanceInvalid,
				new Dictionary<string, string[]> { ["instance"] = [reason] }
			);
		}

		if (result is StartMastodonConnectResult.Refused refused) {
			return TypedProblems.ValidationProblem(
				refused.Reason,
				ResponseKeys.MastodonAuthorizationRefused,
				new Dictionary<string, string[]> { ["instance"] = [refused.Reason] }
			);
		}

		if (result is StartMastodonConnectResult.Started started) {
			return TypedResults.Ok(new MastodonConnectStarted { AuthorizeUrl = started.AuthorizeUrl });
		}

		return TypedProblems.ProviderUnavailable(
			"That Mastodon server could not be reached. Nothing was stored; try again shortly.",
			ResponseKeys.ProviderUnreachable
		);
	}
}
