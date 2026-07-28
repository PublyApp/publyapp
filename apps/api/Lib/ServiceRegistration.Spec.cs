using System.Net;

using FluentAssertions;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib;

public sealed class ServiceRegistrationSpec {
	[Fact]
	public async Task
	ItShouldAllowADevWorktreeOriginInDevelopment() {
		const string worktreeOrigin = "http://pr994.localhost:5994";
		await using var factory = CreateCorsFactory("Development");
		using var client = CreateCorsClient(factory);

		using var request = CreateCorsRequest(
			HttpMethod.Get,
			"/health/live",
			worktreeOrigin
		);
		using var response = await client.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		AssertCorsOrigin(response, worktreeOrigin);

		using var preflightRequest = CreateCorsPreflightRequest(worktreeOrigin);
		using var preflightResponse = await client.SendAsync(preflightRequest);

		preflightResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		AssertCorsOrigin(preflightResponse, worktreeOrigin);
		AssertCorsPreflightHeaders(preflightResponse);
	}

	[Fact]
	public async Task
	ItShouldRejectANearMissPrWorktreeOriginInDevelopment() {
		await using var factory = CreateCorsFactory("Development");
		using var client = CreateCorsClient(factory);

		var disallowedOrigins = new[] {
			"https://pr1.localhost.evil.com:5994",
			"http://pr1.localhost.evil.com:5994",
			"http://pr1.localhost.:5994",
			"HTTP://PR1.LOCALHOST:5994",
			"http://pr١.localhost:5994",
		};

		foreach (var origin in disallowedOrigins) {
			using var request = CreateCorsRequest(
				HttpMethod.Get,
				"/health/live",
				origin
			);
			using var response = await client.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			response.Headers.Contains(
				"Access-Control-Allow-Origin"
			).Should().BeFalse();

			using var preflightRequest = CreateCorsPreflightRequest(origin);
			using var preflightResponse = await client.SendAsync(preflightRequest);

			preflightResponse.Headers.Contains(
				"Access-Control-Allow-Origin"
			).Should().BeFalse();
		}
	}

	[Fact]
	public async Task
	ItShouldRejectADevWorktreeOriginInProduction() {
		const string worktreeOrigin = "http://pr994.localhost:5994";
		await using var factory = CreateCorsFactory("Production");
		using var client = CreateCorsClient(factory, useHttps: true);

		using var request = CreateCorsRequest(
			HttpMethod.Get,
			"/health/live",
			worktreeOrigin
		);
		using var response = await client.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		response.Headers.Contains(
			"Access-Control-Allow-Origin"
		).Should().BeFalse();

		using var preflightRequest = CreateCorsPreflightRequest(worktreeOrigin);
		using var preflightResponse = await client.SendAsync(preflightRequest);

		preflightResponse.Headers.Contains(
			"Access-Control-Allow-Origin"
		).Should().BeFalse();
	}

	[Theory]
	[InlineData("Development")]
	[InlineData("Production")]
	public async Task
	ItShouldAlwaysAllowFrontUrlAcrossEnvironments(
		string environment
	) {
		await using var factory = CreateCorsFactory(environment);
		using var client = CreateCorsClient(
			factory,
			useHttps: environment == "Production"
		);

		using var request = CreateCorsRequest(
			HttpMethod.Get,
			"/health/live",
			AppEnvironment.Instance.FRONT_URL
		);
		using var response = await client.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		AssertCorsOrigin(response, AppEnvironment.Instance.FRONT_URL);

		using var preflightRequest = CreateCorsPreflightRequest(
			AppEnvironment.Instance.FRONT_URL
		);
		using var preflightResponse = await client.SendAsync(preflightRequest);

		AssertCorsOrigin(preflightResponse, AppEnvironment.Instance.FRONT_URL);
		AssertCorsPreflightHeaders(preflightResponse);
	}

	private static HttpClient CreateCorsClient(
		WebApplicationFactory<Program> factory,
		bool useHttps = false
	) {
		return factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false,
				BaseAddress = new Uri(
					useHttps
						? "https://localhost"
						: "http://localhost"
				),
			}
		);
	}

	private static WebApplicationFactory<Program> CreateCorsFactory(
		string environment
	) {
		return new CorsFactory(environment);
	}

	private sealed class CorsFactory(string environment)
		: WebApplicationFactory<Program> {
		protected override void ConfigureWebHost(
			IWebHostBuilder builder
		) {
			builder.UseEnvironment(environment);
			builder.ConfigureServices(ApiFactory.RemoveCorsFactoryHostedServices);
		}
	}

	private static HttpRequestMessage CreateCorsRequest(
		HttpMethod method,
		string path,
		string? origin = null
	) {
		var request = new HttpRequestMessage(method, path);
		request.Headers.TryAddWithoutValidation(
			"Origin",
			origin ?? AppEnvironment.Instance.FRONT_URL
		);
		return request;
	}

	private static HttpRequestMessage CreateCorsPreflightRequest(
		string? origin = null
	) {
		var request = CreateCorsRequest(
			HttpMethod.Options,
			"/health",
			origin
		);
		request.Headers.TryAddWithoutValidation(
			"Access-Control-Request-Method",
			"POST"
		);
		return request;
	}

	private static void AssertCorsPreflightHeaders(
		HttpResponseMessage response
	) {
		response.Headers.TryGetValues(
			"Access-Control-Allow-Methods",
			out var values
		).Should().BeTrue();
		values.Should().ContainSingle()
			.Which.Split(
				',',
				StringSplitOptions.TrimEntries
			).Should().Contain("POST");
	}

	private static void AssertCorsOrigin(
		HttpResponseMessage response,
		string expectedOrigin
	) {
		response.Headers.TryGetValues(
			"Access-Control-Allow-Origin",
			out var values
		).Should().BeTrue();
		values.Should().ContainSingle()
			.Which.Should().Be(expectedOrigin);
	}
}
