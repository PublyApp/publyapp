using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Shared GET-and-assert boilerplate for API specs.
/// </summary>
internal static class HttpClientExtensions {
	/// <summary>
	/// Sends an authenticated GET, asserts 200 OK and returns the deserialized, non-null body.
	/// </summary>
	public static async Task<T> GetOkAsync<T>(
		this HttpClient http,
		string url,
		string sessionToken,
		CancellationToken cancellationToken = default
	) where T : class {
		using var response = await http.SendWithSessionAsync(
			HttpMethod.Get,
			url,
			sessionToken,
			cancellationToken
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var body = await response.Content.ReadFromJsonAsync<T>(cancellationToken);
		Assert.NotNull(body);
		return body;
	}

	/// <summary>
	/// Sends a request authenticated with <paramref name="sessionToken"/> and returns the response.
	/// </summary>
	public static async Task<HttpResponseMessage> SendWithSessionAsync(
		this HttpClient http,
		HttpMethod method,
		string url,
		string sessionToken,
		CancellationToken cancellationToken = default
	) {
		using var request = new HttpRequestMessage(method, url).WithSessionToken(sessionToken);
		return await http.SendAsync(request, cancellationToken);
	}
}
