namespace MainApi.Src.Modules.Health;

using System.Net;

using FluentAssertions;

using MainApi.Src.Lib.Testing;

using Xunit;

/// <summary>
/// Integration tests for the health endpoint.
/// </summary>
public sealed class HealthIntegrationTests
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;

	public HealthIntegrationTests(ApiFixture fixture) {
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task GetHealth_ReturnsOk() {
		var response = await _http.GetAsync("/health");

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}
}
