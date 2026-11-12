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
	private static string _Label(SocialProvider provider) {
		return provider switch {
			SocialProvider.Bluesky => "Bluesky",
			SocialProvider.Mastodon => "Mastodon",
			SocialProvider.Pixelfed => "Pixelfed",
			SocialProvider.DiscordWebhook => "Discord",
			_ => throw new ArgumentOutOfRangeException(nameof(provider), provider, "Unhandled SocialProvider"),
		};
	}

	public static AppValidationProblemHttpResult For(SocialProvider provider) {
		var name = SocialAccountWire.FormatProvider(provider);
		var reason = $"{ProviderDisabledProblem._Label(provider)} is disabled by the operator and cannot be connected.";
		return TypedProblems.ValidationProblem(
			reason,
			ResponseKeys.ProviderDisabled,
			new Dictionary<string, string[]> { ["provider"] = [reason] },
			new Dictionary<string, object?> { ["provider"] = name }
		);
	}
}
