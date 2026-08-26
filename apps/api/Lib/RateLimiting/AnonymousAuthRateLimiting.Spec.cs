using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

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
	public async Task ItShouldNotApplyAnonymousLimitsToAuthenticatedEndpoints() {
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

	[Fact]
	public async Task ItShouldScopeTheExpectedPolicyToEachAnonymousAuthWrite() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 100
		);
		var endpoints = factory.Services
			.GetRequiredService<EndpointDataSource>()
			.Endpoints;

		AssertPolicy(
			endpoints,
			AppRoutes.Auth.Login,
			AnonymousAuthRateLimitPolicies.PerEmail
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.Register,
			AnonymousAuthRateLimitPolicies.PerEmail
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.VerifyEmailRequest,
			AnonymousAuthRateLimitPolicies
				.PasswordResetPerEmail
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.RequestPasswordReset,
			AnonymousAuthRateLimitPolicies
				.PasswordResetPerEmail
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.ResetPassword,
			AnonymousAuthRateLimitPolicies.PerIp
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.GetVerificationLink,
			AnonymousAuthRateLimitPolicies.PerIp
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.CheckEmailVerificationToken,
			AnonymousAuthRateLimitPolicies.PerIp
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.CheckResetPasswordToken,
			AnonymousAuthRateLimitPolicies.PerIp
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Invitations.Anonymous.AcceptByToken,
			AnonymousAuthRateLimitPolicies.PerIp
		);
		AssertPolicy(
			endpoints,
			AppRoutes.Auth.GetUserAuthData,
			ApiRateLimitPolicies.AuthenticatedDefault
		);
	}

	[Fact]
	public async Task ItShouldIgnoreForwardedForFromAnUntrustedPeer() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 100
		);
		var options = factory.Services
			.GetRequiredService<
				IOptions<ForwardedHeadersOptions>>()
			.Value;
		var untrustedPeer = IPAddress.Parse(
			"198.51.100.40"
		);
		var spoofedClient = IPAddress.Parse(
			"203.0.113.40"
		);
		var context = new DefaultHttpContext();
		context.Connection.RemoteIpAddress =
			untrustedPeer;
		context.Request.Headers[
			"X-Forwarded-For"
		] = spoofedClient.ToString();

		using var loggerFactory = LoggerFactory.Create(
			_ => { }
		);
		var middleware = new ForwardedHeadersMiddleware(
			_ => Task.CompletedTask,
			loggerFactory,
			Options.Create(options)
		);

		await middleware.Invoke(context);

		options.ForwardedHeaders.Should()
			.HaveFlag(ForwardedHeaders.XForwardedFor);
		context.Connection.RemoteIpAddress.Should()
			.Be(untrustedPeer);
	}

	[Fact]
	public async Task ItShouldUseBinderEquivalentCaseInsensitiveEmailMatching() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 1
		);
		using var client = CreateClient(factory);
		const string email = "mixed-case-limit@example.com";

		using var first = await SendRawPasswordResetAsync(
			client,
			$$"""{"email":"{{email}}"}""",
			"203.0.113.100"
		);
		using var mixedCase = await SendRawPasswordResetAsync(
			client,
			$$"""{"Email":"{{email}}"}""",
			"203.0.113.101"
		);

		first.StatusCode.Should().Be(HttpStatusCode.OK);
		mixedCase.StatusCode.Should()
			.Be(HttpStatusCode.TooManyRequests);
	}

	[Fact]
	public async Task ItShouldUseTheLastBinderMatchedEmailWhenCasingIsDuplicated() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 1
		);
		using var client = CreateClient(factory);
		const string email = "duplicate-case-limit@example.com";

		using var first = await SendRawPasswordResetAsync(
			client,
			$$"""{"email":"{{email}}"}""",
			"203.0.113.102"
		);
		using var duplicateCase = await SendRawPasswordResetAsync(
			client,
			$$"""{"email":"decoy@example.com","Email":"{{email}}"}""",
			"203.0.113.103"
		);

		first.StatusCode.Should().Be(HttpStatusCode.OK);
		duplicateCase.StatusCode.Should()
			.Be(HttpStatusCode.TooManyRequests);
	}

	[Fact]
	public async Task ItShouldRejectOversizedEmailBodiesAcrossRotatingClientIps() {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 1
		);
		using var client = CreateClient(factory);
		var padding = new string('x', 20_000);

		using var first = await SendRawPasswordResetAsync(
			client,
			$$"""{"email":"oversized@example.com","padding":"{{padding}}"}""",
			"203.0.113.104"
		);
		using var second = await SendRawPasswordResetAsync(
			client,
			$$"""{"email":"oversized@example.com","padding":"{{padding}}"}""",
			"203.0.113.105"
		);

		first.StatusCode.Should()
			.Be(HttpStatusCode.RequestEntityTooLarge);
		second.StatusCode.Should()
			.Be(HttpStatusCode.RequestEntityTooLarge);
	}

	[Theory]
	[InlineData("[]")]
	[InlineData("\"not-an-object\"")]
	[InlineData("123")]
	[InlineData("null")]
	public async Task ItShouldNotReturn500ForNonObjectJsonBodies(
		string body
	) {
		await using var factory = CreateFactory(
			perIpPermitLimit: 100,
			perEmailPermitLimit: 100,
			passwordResetPerEmailPermitLimit: 100
		);
		using var client = CreateClient(factory);

		using var response = await SendRawPasswordResetAsync(
			client,
			body
		);

		response.StatusCode.Should()
			.NotBe(HttpStatusCode.InternalServerError);
	}

	private static void AssertPolicy(
		IReadOnlyList<Endpoint> endpoints,
		string routePattern,
		string expectedPolicy
	) {
		var endpoint = GetRouteEndpoint(
			endpoints,
			routePattern
		);
		var metadata = endpoint.Metadata
			.GetMetadata<EnableRateLimitingAttribute>();

		metadata.Should().NotBeNull();
		Assert.NotNull(metadata);
		metadata.PolicyName.Should().Be(expectedPolicy);
	}

	private static RouteEndpoint GetRouteEndpoint(
		IReadOnlyList<Endpoint> endpoints,
		string routePattern
	) {
		return endpoints
			.OfType<RouteEndpoint>()
			.Single(endpoint =>
				endpoint.RoutePattern.RawText
					== routePattern
			);
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
				services.RemoveAll<IRateLimitCounterStore>();
				services.AddSingleton(settings);
				// Fresh per-process counters so the long-window budgets in these
				// tests are never shared with other hosts (pre-#953 semantics).
				services.AddSingleton<IRateLimitCounterStore>(
					new MemoryRateLimitCounterStore()
				);
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

	private static async Task<HttpResponseMessage>
		SendRawPasswordResetAsync(
			HttpClient client,
			string body,
			string? forwardedFor = null
		) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AppRoutes.Auth.RequestPasswordReset
		) {
			Content = new StringContent(
				body,
				System.Text.Encoding.UTF8,
				"application/json"
			),
		};

		if (forwardedFor is not null) {
			request.Headers.TryAddWithoutValidation(
				"X-Forwarded-For",
				forwardedFor
			);
		}

		return await client.SendAsync(request);
	}
}
