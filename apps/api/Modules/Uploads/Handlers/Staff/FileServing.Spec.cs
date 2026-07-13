
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Modules.Uploads.Handlers.Staff;

// Covers the delivery half of the upload feature — the anonymous /files static-file
// middleware wired in Program.cs — which CreateStaffUpload.Spec.cs otherwise leaves
// untested even though it is the actual attack surface (per review r1-api F7).
public sealed class FileServingSpec : IClassFixture<ApiFixture> {
	private static readonly string UploadUrl = PathUtils.Join(
		AppRoutes.Staff.Root,
		AppRoutes.Uploads.ForStaff.Root,
		AppRoutes.Uploads.ForStaff.Create
	);

	private static readonly byte[] PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FileServingSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldSendNosniffOnServedFiles() {
		var uploaded = await UploadPngAsync();

		using var response = await _http.GetAsync(uploaded.Url);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		response.Headers.TryGetValues("X-Content-Type-Options", out var values)
			.Should().BeTrue("served files must carry X-Content-Type-Options: nosniff");
		values.Should().NotBeNull();
		values!.Should().Contain("nosniff");
	}

	[Fact]
	public async Task ItShouldServeUploadedFilesAnonymously() {
		var uploaded = await UploadPngAsync();

		// A deliberately bare request — no session token, no tenant header —
		// pins the intended contract: the served asset is public.
		using var request = new HttpRequestMessage(HttpMethod.Get, uploaded.Url);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Theory]
	[InlineData("/files/../appsettings.json")]
	[InlineData("/files/%2e%2e/%2e%2e/etc/passwd")]
	[InlineData("/files/uploads/../../appsettings.json")]
	public async Task ItShouldReturn404ForTraversalUnderFiles(string maliciousPath) {
		using var response = await _http.GetAsync(maliciousPath);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<StaffUploadCreated> UploadPngAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(PngBytes);
		fileContent.Headers.ContentType =
			new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "logo.png");

		using var request = new HttpRequestMessage(HttpMethod.Post, UploadUrl) {
			Content = content
		}.WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var result = await response.Content.ReadFromJsonAsync<StaffUploadCreated>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException("Upload response was empty.");
		}
		return result;
	}
}
