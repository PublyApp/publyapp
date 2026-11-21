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
		using var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(sessionToken);
		using var response = await http.SendAsync(request, cancellationToken);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var body = await response.Content.ReadFromJsonAsync<T>(cancellationToken);
		Assert.NotNull(body);
		return body;
	}
}
