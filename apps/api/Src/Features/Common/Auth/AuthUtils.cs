using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.WebUtilities;

namespace MainApi.Src.Features.Common.Auth;

public static class AuthUtils {
	public static string CreateVerificationLink(string token, string email) {
		var builder = new UriBuilder(AppEnvironment.FRONT_URL) {
			Path = "/verify-email"
		};

		var queryParams = new Dictionary<string, string?> {
			["token"] = token,
			["id"] = CryptoUtils.EncryptString(email)
		};

		var url = QueryHelpers.AddQueryString(builder.Uri.ToString(), queryParams);

		return url;
	}
}
