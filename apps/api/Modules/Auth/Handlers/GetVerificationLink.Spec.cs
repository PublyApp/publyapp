
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Lib.ProblemResults;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;

using Xunit;

namespace MainApi.Modules.Auth.Handlers;
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
			+ $"?user_id={Guid.NewGuid()}";

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
	ItShouldReturnValidationErrorForMalformedUserId() {
		var url = Routes.Auth.GetVerificationLink
			+ "?user_id=not-a-guid";

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("user_id");
		problem.Errors.Should().NotContainKey(string.Empty);
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
