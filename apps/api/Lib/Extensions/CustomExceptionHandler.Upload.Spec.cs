using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Uploads;

using Xunit;

namespace PublyApp.Api.Lib.Extensions;

/// <summary>
/// The oversize-upload 413 through a REAL Kestrel and the real exception pipeline
/// (#2421): a body above the endpoint's request-size limit used to come back as a
/// bare 413 (no body, no content type) in a non-Development host, because the route
/// handler turns Kestrel's BadHttpRequestException into a bare status and the
/// exception handler never runs.
/// </summary>
public sealed class CustomExceptionHandlerUploadSpec {
	[Fact]
	public async Task ItShouldAnswerAnOversizeUploadWithAProblemNamingTheLimit() {
		var maxBytes = AppEnvironment.Instance.UPLOAD_MAX_BYTES;
		await using var app = await CustomExceptionHandlerUploadSpec._StartAsync(app => {
			app.MapPost("/up", (IFormFile? file) => Results.Ok())
				.WithGlobalRateLimitOnly()
				.DisableAntiforgery()
				.WithMetadata(new RequestSizeLimitAttribute(
					maxBytes + UploadLimits.MultipartHeaderHeadroomBytes
				));
		});
		using var http = CustomExceptionHandlerUploadSpec._NewClient(app);
		using var content = new MultipartFormDataContent();
		// Just over limit plus headroom, and `Expect: 100-continue` so the client sends
		// no body once Kestrel refuses: the rejection cannot race the body write.
		var file = new ByteArrayContent(
			new byte[maxBytes + UploadLimits.MultipartHeaderHeadroomBytes + 4096]
		);
		file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
		content.Add(file, "file", "big.png");
		using var request = new HttpRequestMessage(HttpMethod.Post, "/up") { Content = content };
		request.Headers.ExpectContinue = true;

		using var response = await http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
		response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
		var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
		problem.GetProperty("translationKey").GetString().Should().Be("upload-file-too-large");
		problem.GetProperty("maxBytes").GetInt64().Should().Be(maxBytes);
		problem.GetProperty("detail").GetString().Should().Be(
			$"File exceeds the maximum size of {UploadLimits.FormatLimit(maxBytes)}"
		);
	}

	[Fact]
	public async Task ItShouldLeaveABodylessPayloadTooLargeOnANonUploadEndpointAsItWas() {
		await using var app = await CustomExceptionHandlerUploadSpec._StartAsync(app => {
			app.MapGet("/plain", () => Results.StatusCode(StatusCodes.Status413PayloadTooLarge))
				.WithGlobalRateLimitOnly();
		});
		using var http = CustomExceptionHandlerUploadSpec._NewClient(app);

		using var response = await http.GetAsync("/plain");

		response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
		response.Content.Headers.ContentType.Should().BeNull();
		(await response.Content.ReadAsStringAsync()).Should().BeEmpty();
	}

	private static async Task<WebApplication> _StartAsync(Action<WebApplication> mapEndpoints) {
		var builder = WebApplication.CreateBuilder(new WebApplicationOptions {
			EnvironmentName = Environments.Production,
		});
		builder.WebHost.UseUrls("http://127.0.0.1:0");
		builder.Logging.ClearProviders();
		var app = builder.Build();
		app.UseCustomExceptionHandler();
		mapEndpoints(app);
		await app.StartAsync();
		return app;
	}

	// No proxy (an HTTP_PROXY on the machine must not take loopback) and a hard timeout.
	private static HttpClient _NewClient(WebApplication app) {
		return new HttpClient(new SocketsHttpHandler { UseProxy = false }) {
			BaseAddress = new Uri(app.Urls.First()),
			Timeout = TimeSpan.FromSeconds(30),
		};
	}
}

public sealed class CustomExceptionHandlerUploadEndpointsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public CustomExceptionHandlerUploadEndpointsSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Theory]
	[InlineData("AttachPostImageForTenant")]
	[InlineData("AttachSegmentImageForTenant")]
	[InlineData("CreateStaffUpload")]
	public void ItShouldResolveTheFileLimitForEveryUploadEndpoint(string endpointName) {
		var endpoint = this._Fixture.Factory.Services
			.GetRequiredService<EndpointDataSource>()
			.Endpoints
			.Single(candidate =>
				candidate.Metadata.GetMetadata<IEndpointNameMetadata>()?.EndpointName == endpointName
			);

		CustomExceptionHandler
			.ResolveUploadFileLimit(endpoint, AppEnvironment.Instance.UPLOAD_MAX_BYTES)
			.Should().Be(AppEnvironment.Instance.UPLOAD_MAX_BYTES);
	}
}
