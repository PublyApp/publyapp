using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.WebUtilities;

namespace MainApi.Src.Modules.Shared.Auth;

public static class AuthUtils {
	public static string CreateVerificationUrl(string token, string email) {
		var builder = new UriBuilder(AppEnvironment.FRONT_URL) {
			Path = "/verify-email" // Path of the front-end app (using react router)
		};

		var queryParams = new Dictionary<string, string?> {
			["token"] = token,
			["id"] = CryptoUtils.EncryptString(email).ToLowerInvariant()
		};

		var url = QueryHelpers.AddQueryString(builder.Uri.ToString(), queryParams);

		return url;
	}

	public static string CreateResetPasswordUrl(string token, string email) {
		var builder = new UriBuilder(AppEnvironment.FRONT_URL) {
			Path = "/reset-password" // Path of the front-end app (using react router)
		};

		var queryParams = new Dictionary<string, string?> {
			["token"] = token,
			["id"] = CryptoUtils.EncryptString(email).ToLowerInvariant()
		};

		var url = QueryHelpers.AddQueryString(builder.Uri.ToString(), queryParams);

		return url;
	}

	public static string GetFrontendLoginPageUrl() {
		var builder = new UriBuilder(AppEnvironment.FRONT_URL) {
			Path = "/login" // Path of the front-end app (using react router)
		};

		return builder.Uri.ToString();
	}

	public static string CreateAcceptInvitationUrl(string token, string email) {
		var builder = new UriBuilder(AppEnvironment.FRONT_URL) {
			Path = "/accept-invitation" // Path of the front-end app (using react router)
		};

		var queryParams = new Dictionary<string, string?> {
			["token"] = token,
			["id"] = CryptoUtils.EncryptString(email).ToLowerInvariant()
		};

		var url = QueryHelpers.AddQueryString(builder.Uri.ToString(), queryParams);

		return url;
	}
}
