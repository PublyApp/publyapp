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
/// bare 413 (no body, no content type) in a non-Development host, because the
/// route handler turns Kestrel's BadHttpRequestException into a bare status when
/// </summary>
public sealed class CustomExceptionHandlerUploadSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public CustomExceptionHandlerUploadSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldAnswerAnOversizeUploadWithAProblemNamingTheLimit() {
		var maxBytes = AppEnvironment.Instance.UPLOAD_MAX_BYTES;
		var builder = WebApplication.CreateBuilder(new WebApplicationOptions {
			EnvironmentName = Environments.Production,
		});
		builder.WebHost.UseUrls("http://127.0.0.1:0");
		builder.Logging.ClearProviders();
		await using var app = builder.Build();
		app.UseCustomExceptionHandler();
		app.MapPost("/up", (IFormFile? file) => Results.Ok())
			.WithGlobalRateLimitOnly()
			.DisableAntiforgery()
			.WithMetadata(new RequestSizeLimitAttribute(maxBytes + UploadLimits.MultipartHeaderHeadroomBytes));
		await app.StartAsync();

		try {
			using var http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
			using var content = new MultipartFormDataContent();
			// Well past the limit plus headroom: the common case, not the thin 8 KB sliver.
			var file = new ByteArrayContent(new byte[maxBytes + 1_300_000]);
			file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
			content.Add(file, "file", "big.png");

			using var response = await http.PostAsync("/up", content);

			response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
			response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
			var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
			problem.GetProperty("translationKey").GetString().Should().Be("upload-file-too-large");
			problem.GetProperty("maxBytes").GetInt64().Should().Be(maxBytes);
		} finally {
			await app.StopAsync();
		}
	}

	[Theory]
	[InlineData("AttachPostImageForTenant")]
	[InlineData("AttachSegmentImageForTenant")]
	[InlineData("CreateStaffUpload")]
	public void ItShouldResolveTheFileLimitOnEveryUploadEndpoint(string endpointName) {
		var endpoint = this._Fixture.Factory.Services
			.GetRequiredService<EndpointDataSource>()
			.Endpoints
			.Single(candidate => candidate.Metadata.GetMetadata<IEndpointNameMetadata>()?.EndpointName == endpointName);

		CustomExceptionHandler.ResolveUploadFileLimit(endpoint, AppEnvironment.Instance.UPLOAD_MAX_BYTES)
			.Should().Be(AppEnvironment.Instance.UPLOAD_MAX_BYTES);
	}
}
