using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Localization;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Lib.RateLimiting;

public sealed class AnonymousAuthRateLimitingSpec
	: IClassFixture<ApiFixture> {
	private const int LongWindowSeconds = 3_600;
	private readonly ApiFixture _fixture;

	public AnonymousAuthRateLimitingSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReturnProblemDetailsAndRetryAfterWhenTheEmailLimitIsExceeded() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 2
		);
		using var client = CreateClient(factory);
		const string email = "rate-limit@example.com";

		using var first = await SendPasswordResetAsync(client, email);
		using var second = await SendPasswordResetAsync(client, email);
		using var rejected = await SendPasswordResetAsync(client, email);

		first.StatusCode.Should().Be(HttpStatusCode.OK);
		second.StatusCode.Should().Be(HttpStatusCode.OK);
		rejected.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
		rejected.Content.Headers.ContentType?.MediaType.Should()
			.Be("application/problem+json");

		var problem = await rejected.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be(StatusCodes.Status429TooManyRequests);
		problem.Title.Should().Be("Too Many Requests");
		problem.Detail.Should().Be("Too many requests. Please try again later.");
		problem.TranslationKey.Should().Be(ResponseKeys.TooManyRequests);
		problem.Instance.Should().Be(AppRoutes.Auth.RequestPasswordReset);
		problem.Extensions.Should().ContainKey("traceId");

		rejected.Headers.TryGetValues("Retry-After", out var retryAfterValues)
			.Should().BeTrue();
		var retryAfter = retryAfterValues?.Single();
		retryAfter.Should().NotBeNull();
		int.TryParse(retryAfter, out var retryAfterSeconds).Should().BeTrue();
		retryAfterSeconds.Should().BeGreaterThan(0);
	}

	[Fact]
	public async Task ItShouldLimitDifferentEmailsIndependentlyForTheSameClientIp() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 1
		);
		using var client = CreateClient(factory);

		using var firstEmail = await SendPasswordResetAsync(
			client,
			"first-rate-limit@example.com"
		);
		using var secondEmail = await SendPasswordResetAsync(
			client,
			"second-rate-limit@example.com"
		);
		using var firstEmailAgain = await SendPasswordResetAsync(
			client,
			"first-rate-limit@example.com"
		);

		firstEmail.StatusCode.Should().Be(HttpStatusCode.OK);
		secondEmail.StatusCode.Should().Be(HttpStatusCode.OK);
		firstEmailAgain.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
	}

	[Fact]
	public async Task ItShouldLimitTheSameNormalizedEmailAcrossDifferentClientIps() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 1
		);
		using var client = CreateClient(factory);

		using var firstIp = await SendPasswordResetAsync(
			client,
			"  Shared-Rate-Limit@Example.com  ",
			"203.0.113.10"
		);
		using var secondIp = await SendPasswordResetAsync(
			client,
			"shared-rate-limit@example.com",
			"203.0.113.11"
		);

		firstIp.StatusCode.Should().Be(HttpStatusCode.OK);
		secondIp.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
	}

	[Fact]
	public async Task ItShouldUseForwardedClientIpOnlyFromTheTrustedProxy() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 1,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 100
		);
		using var client = CreateClient(factory);

		using var firstIp = await SendPasswordResetAsync(
			client,
			"xff-first@example.com",
			"203.0.113.20"
		);
		using var firstIpAgain = await SendPasswordResetAsync(
			client,
			"xff-second@example.com",
			"203.0.113.20"
		);
		using var secondIp = await SendPasswordResetAsync(
			client,
			"xff-third@example.com",
			"203.0.113.21"
		);

		firstIp.StatusCode.Should().Be(HttpStatusCode.OK);
		firstIpAgain.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
		secondIp.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldNotThrottleAuthenticatedEndpoints() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 1,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 100
		);
		using var client = CreateClient(factory);
		var authClient = new TestAuthClient(client);
		var token = await authClient.LoginAsStaffAdminAsync();

		using var firstRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(token);
		using var firstResponse = await client.SendAsync(firstRequest);

		using var secondRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(token);
		using var secondResponse = await client.SendAsync(secondRequest);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private WebApplicationFactory<Program> CreateFactory(
		int perIpPermitLimit,
		int perEmailPermitLimit,
		int passwordResetPerEmailPermitLimit
	) {
		var settings = new AnonymousAuthRateLimitSettings(
			PerIp: new RateLimitWindowSettings(
				perIpPermitLimit,
				LongWindowSeconds
			),
			PerEmail: new RateLimitWindowSettings(
				perEmailPermitLimit,
				LongWindowSeconds
			),
			PasswordResetPerEmail: new RateLimitWindowSettings(
				passwordResetPerEmailPermitLimit,
				LongWindowSeconds
			)
		);

		return _fixture.Factory.WithWebHostBuilder(builder => {
			builder.ConfigureServices(services => {
				services.RemoveAll<AnonymousAuthRateLimitSettings>();
				services.AddSingleton(settings);
			});
		});
	}

	private static HttpClient CreateClient(
		WebApplicationFactory<Program> factory
	) {
		return factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false,
			}
		);
	}

	private static async Task<HttpResponseMessage> SendPasswordResetAsync(
		HttpClient client,
		string email,
		string? forwardedFor = null
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AppRoutes.Auth.RequestPasswordReset
		) {
			Content = JsonContent.Create(new { email }),
		};

		if (forwardedFor is not null) {
			request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
		}

		return await client.SendAsync(request);
	}
}
