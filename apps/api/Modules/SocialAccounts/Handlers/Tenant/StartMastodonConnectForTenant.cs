using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record StartMastodonConnectBody {
	public required JsonElement Instance { get; init; }

	/// <summary>"pixelfed" connects a Pixelfed server; anything else, Mastodon (#2175).</summary>
	public JsonElement? Provider { get; init; }

	public string GetInstance() {
		return this.Instance.GetValueAsString();
	}

	public SocialProvider GetProvider() {
		return this.Provider is { ValueKind: JsonValueKind.String } provider
			&& string.Equals(provider.GetString(), "pixelfed", StringComparison.OrdinalIgnoreCase)
				? SocialProvider.Pixelfed
				: SocialProvider.Mastodon;
	}
}

public class StartMastodonConnectBodyValidator : AbstractValidator<StartMastodonConnectBody> {
	public StartMastodonConnectBodyValidator() {
		this.RuleFor(x => x.Instance).MustBeRequiredStringWithLength("Instance", 1, 300);
		this.RuleFor(x => x.Provider).MustBeNullableNonEmptyString("Provider");
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

		var account = authContext.GetRequiredTenantAccount();

		var instance = body.GetInstance();
		var provider = body.GetProvider();
		var network = provider == SocialProvider.Pixelfed ? "Pixelfed" : "Mastodon";
		var result = await oauthService.StartAsync(
			tenantId, account.UserId, instance, cancellationToken, provider
		);

		if (result is StartMastodonConnectResult.InvalidInstance) {
			var reason = $"Enter the public https address of a {network} server.";
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
			$"That {network} server could not be reached. Nothing was stored; try again shortly.",
			ResponseKeys.ProviderUnreachable
		);
	}
}
