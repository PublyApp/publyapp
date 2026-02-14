namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;

using Xunit;

public sealed class VerifyEmailRequestSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;

	public VerifyEmailRequestSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentEmail() {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.VerifyEmailRequest
		);

		request.Content = JsonContent.Create(
			new { email = "nonexistent@example.com" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForInvalidEmail() {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.VerifyEmailRequest
		);

		request.Content = JsonContent.Create(
			new { email = "not-an-email" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}
}
