namespace MainApi.Src.Lib.Testing.Helpers;

using System.Net.Http.Json;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;

/// <summary>
/// Helper for authenticating test requests.
/// Returns session tokens — never mutates shared
/// HttpClient headers.
/// </summary>
internal sealed class TestAuthClient {
	private readonly HttpClient _http;

	public TestAuthClient(HttpClient http) {
		_http = http;
	}

	/// <summary>
	/// Logs in as the seeded staff admin and returns
	/// the session token.
	/// </summary>
	public async Task<string> LoginAsStaffAdminAsync(
		CancellationToken ct = default
	) {
		return await LoginAsync(
			TestConstants.StaffAdminEmail,
			TestConstants.SeedPassword,
			ct
		);
	}

	/// <summary>
	/// Logs in with the given credentials and returns
	/// the session token.
	/// Throws with full response body on failure for
	/// easy debugging.
	/// </summary>
	public async Task<string> LoginAsync(
		string email,
		string password,
		CancellationToken ct = default
	) {
		var loginRequest = new { email, password };

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest,
			ct
		);

		if (!response.IsSuccessStatusCode) {
			var body = await response.Content
				.ReadAsStringAsync(ct);
			throw new InvalidOperationException(
				$"Login failed for '{email}' with status "
				+ $"{(int)response.StatusCode}: {body}"
			);
		}

		var result = await response.Content
			.ReadFromJsonAsync<PasswordLoginResponse>(ct);

		if (result?.SessionToken is null) {
			throw new InvalidOperationException(
				"Login did not return a session token"
			);
		}

		return result.SessionToken;
	}

	// Matches PasswordLoginResult in PassWordLogin.cs
	private record PasswordLoginResponse(
		Guid UserId,
		string SessionToken,
		DateTime SessionExpiresAt,
		double SessionExpiresInMs
	);
}
