
using System.Net;

using FluentAssertions;

using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Health;
/// <summary>
/// Integration tests for the health endpoint.
/// </summary>
public sealed class HealthSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;

	public HealthSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task ItShouldReturnOk() {
		var response = await _http.GetAsync("/health");

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}
}
