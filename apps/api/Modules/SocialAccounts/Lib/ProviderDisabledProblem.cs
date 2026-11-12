using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Lib;

/// <summary>
/// The 422 every connect endpoint answers when the operator switched the provider off
/// (<c>DISABLED_PUBLISH_PROVIDERS</c>, #2184): the typed key lets the front translate it,
/// <c>provider</c> names the refused provider.
/// </summary>
public static class ProviderDisabledProblem {
	public static AppValidationProblemHttpResult For(SocialProvider provider) {
		var name = SocialAccountWire.FormatProvider(provider);
		var reason = $"The {name} provider is disabled by the operator and cannot be connected.";
		return TypedProblems.ValidationProblem(
			reason,
			ResponseKeys.ProviderDisabled,
			new Dictionary<string, string[]> { ["provider"] = [reason] },
			new Dictionary<string, object?> { ["provider"] = name }
		);
	}
}
