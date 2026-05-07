namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class GetUserAuthDataSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetUserAuthDataSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldRemoveExpiredSessionWhenExpiredTokenIsPresented() {
		var token = await _authClient.LoginAsync(
			TestConstants.StaffAdminEmail,
			TestConstants.SeedPassword
		);

		await ExpireSessionAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserAuthData
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

		var sessionCount = await CountSessionsByTokenAsync(token);
		sessionCount.Should().Be(0);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedForConcurrentExpiredSessionRequests() {
		var token = await _authClient.LoginAsync(
			TestConstants.StaffAdminEmail,
			TestConstants.SeedPassword
		);

		await ExpireSessionAsync(token);

		using var firstRequest = CreateAuthDataRequest(token);
		using var secondRequest = CreateAuthDataRequest(token);

		var firstResponseTask = _http.SendAsync(firstRequest);
		var secondResponseTask = _http.SendAsync(secondRequest);
		var responses = await Task.WhenAll(firstResponseTask, secondResponseTask);

		try {
			foreach (var response in responses) {
				response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
			}
		} finally {
			foreach (var response in responses) {
				response.Dispose();
			}
		}

		var sessionCount = await CountSessionsByTokenAsync(token);
		sessionCount.Should().Be(0);
	}

	private static HttpRequestMessage CreateAuthDataRequest(
		string token
	) {
		return new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserAuthData
		).WithSessionToken(token);
	}

	private async Task ExpireSessionAsync(
		string token
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var updatedCount = await dbContext.Session
			.Where(s => s.Token == token)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(
					s => s.ExpiresAt,
					DateTime.UtcNow.AddMinutes(-1)
				)
				.SetProperty(s => s.UpdatedAt, DateTime.UtcNow));

		updatedCount.Should().Be(1);
	}

	private async Task<int> CountSessionsByTokenAsync(
		string token
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		return await dbContext.Session
			.CountAsync(s => s.Token == token);
	}
}
