namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;

using Xunit;

public sealed class GetVerificationLinkSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;

	public GetVerificationLinkSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentUserId() {
		var url = Routes.Auth.GetVerificationLink
			+ $"?userId={Guid.NewGuid()}";

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
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
	ItShouldReturnBadRequestForMalformedUserId() {
		var url = Routes.Auth.GetVerificationLink
			+ "?userId=not-a-guid";

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForMissingUserId() {
		var url = Routes.Auth.GetVerificationLink;

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}
}
