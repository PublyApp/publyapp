
using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Modules.Uploads.Handlers.Staff;

public sealed partial class CreateStaffUploadSpec : IClassFixture<ApiFixture> {
	[GeneratedRegex(@"^uploads/\d{4}/\d{2}/[0-9a-fA-F-]{36}\.(png|jpg|jpeg|webp|gif)$")]
	private static partial Regex GeneratedPathPattern();

	private static readonly string UploadUrl = PathUtils.Join(
		AppRoutes.Staff.Root,
		AppRoutes.Uploads.ForStaff.Root,
		AppRoutes.Uploads.ForStaff.Create
	);

	// Minimal valid magic-byte payloads for each supported image type,
	// padded past the 12-byte sniff window with filler bytes.
	private static readonly byte[] PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];
	private static readonly byte[] JpegBytes = [
		0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x00
	];
	private static readonly byte[] WebPBytes = [
		(byte)'R', (byte)'I', (byte)'F', (byte)'F',
		0x00, 0x00, 0x00, 0x00,
		(byte)'W', (byte)'E', (byte)'B', (byte)'P'
	];
	private static readonly byte[] GifBytes = [
		(byte)'G', (byte)'I', (byte)'F', (byte)'8', (byte)'9', (byte)'a',
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	];

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;
	private readonly ApiFixture _fixture;

	public CreateStaffUploadSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
		_fixture = fixture;
	}

	public static TheoryData<byte[], string, string> SupportedImageTypes {
		get {
			return new() {
				{ PngBytes, "logo.png", "image/png" },
				{ JpegBytes, "logo.jpg", "image/jpeg" },
				{ WebPBytes, "logo.webp", "image/webp" },
				{ GifBytes, "logo.gif", "image/gif" },
			};
		}
	}

	[Theory]
	[MemberData(nameof(SupportedImageTypes))]
	public async Task ItShouldReturn201AndAServedUrlForSupportedImageTypes(
		byte[] bytes,
		string fileName,
		string expectedContentType
	) {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, bytes, fileName, expectedContentType)
		);

		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var result = await response.Content
			.ReadFromJsonAsync<StaffUploadCreated>();
		result.Should().NotBeNull();
		result!.ContentType.Should().Be(expectedContentType);
		result.SizeBytes.Should().Be(bytes.Length);
		result.Url.Should().Be($"/files/{result.Path}");

		// The generated path must never carry the client-supplied file name —
		// it must be a server-generated UUID under uploads/yyyy/MM/.
		GeneratedPathPattern().IsMatch(result.Path).Should().BeTrue(
			$"'{result.Path}' must match the server-generated path shape"
		);
		result.Path.Should().NotContain("logo");

		// The returned URL must be anonymously retrievable with the sniffed content type.
		using var fileResponse = await _http.GetAsync(result.Url);
		fileResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		fileResponse.Content.Headers.ContentType.Should().NotBeNull();
		fileResponse.Content.Headers.ContentType!.MediaType
			.Should().Be(expectedContentType);
		var retrievedBytes = await fileResponse.Content.ReadAsByteArrayAsync();
		retrievedBytes.Should().Equal(bytes);

		var uploaderUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_fixture.Factory, TestConstants.StaffAdminEmail
		);
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var auditLogExists = await dbContext.AuditLog.AnyAsync(a =>
			a.Action == AuditActions.UploadCreated
			&& a.UserId == uploaderUserId
			&& a.Details != null
			&& a.Details.Contains(result.Path)
		);
		auditLogExists.Should().BeTrue("a successful upload must write an audit log entry");

		fileResponse.Headers.TryGetValues("X-Content-Type-Options", out var nosniffValues)
			.Should().BeTrue("served uploads must carry X-Content-Type-Options: nosniff");
		nosniffValues.Should().NotBeNull();
		Assert.NotNull(nosniffValues);
		nosniffValues.Should().ContainSingle().Which.Should().Be("nosniff");
	}

	[Fact]
	public async Task ItShouldReturn201WithSniffedContentTypeWhenFilenameAndClaimedTypeLie() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// The client claims this is an HTML file, but the bytes are a PNG.
		// A handler that echoes the claimed type/extension instead of the
		// sniffed one would let this be served back as text/html — a stored
		// XSS vector. It must be classified (and stored) as a PNG regardless.
		using var response = await _http.SendAsync(
			BuildUploadRequest(token, PngBytes, "payload.html", "text/html")
		);

		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var result = await response.Content
			.ReadFromJsonAsync<StaffUploadCreated>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.ContentType.Should().Be("image/png");
		result.Path.Should().EndWith(".png");
		result.Path.Should().NotContain("payload");

		using var fileResponse = await _http.GetAsync(result.Url);
		fileResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		fileResponse.Content.Headers.ContentType.Should().NotBeNull();
		fileResponse.Content.Headers.ContentType!.MediaType.Should().Be("image/png");
	}

	[Fact]
	public async Task ItShouldReturn404ForPathTraversalInTheServedFileRoute() {
		using var response = await _http.GetAsync("/files/../appsettings.json");
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		using var encodedResponse = await _http.GetAsync("/files/..%2fappsettings.json");
		encodedResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturn422WhenFileIsMissing() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		// A well-formed multipart body that simply omits the "file" part —
		// distinct from an empty body, which ASP.NET Core's own form reader
		// short-circuits with a raw 400 before the handler ever runs.
		using var content = new MultipartFormDataContent {
			{ new StringContent("not-a-file"), "unrelated-field" }
		};
		using var request = new HttpRequestMessage(HttpMethod.Post, UploadUrl) {
			Content = content
		}.WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Keys.Should().Contain("file");
	}

	[Fact]
	public async Task ItShouldReturn413WhenFileExceedsMaxSize() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		// Stays under the transport-level RequestSizeLimitAttribute buffer
		// (UPLOAD_MAX_BYTES + 8192) so this exercises the handler's own size
		// check, not Kestrel's earlier rejection.
		var oversized = new byte[AppEnvironment.Instance.UPLOAD_MAX_BYTES + 1];
		PngBytes.CopyTo(oversized, 0);

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, oversized, "big.png", "image/png")
		);

		response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
	}

	[Fact]
	public async Task ItShouldReturn413WhenBodyExceedsTheTransportSizeLimit() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		// Beyond the transport-level RequestSizeLimitAttribute buffer
		// (UPLOAD_MAX_BYTES + 8192) — Kestrel must reject this before the
		// handler's own size check (or the multipart body) ever runs.
		var oversized = new byte[AppEnvironment.Instance.UPLOAD_MAX_BYTES + 8192 + 1];
		PngBytes.CopyTo(oversized, 0);

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, oversized, "big.png", "image/png")
		);

		response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
	}

	[Fact]
	public async Task ItShouldReturn422WhenMagicBytesAreSpoofed() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var fakeBytes = "this is plain text, not an image at all"u8.ToArray();

		using var response = await _http.SendAsync(
			// Client claims .png / image/png, but the content is plain text —
			// magic-byte sniffing must reject this regardless of the claim.
			BuildUploadRequest(token, fakeBytes, "fake.png", "image/png")
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Keys.Should().Contain("file");
	}

	[Fact]
	public async Task ItShouldReturn422ForSvgUploads() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var svgBytes = "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"u8
			.ToArray();

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, svgBytes, "evil.svg", "image/svg+xml")
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Keys.Should().Contain("file");
	}

	[Fact]
	public async Task ItShouldReturn403ForStaffWithoutUploadPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, PngBytes, "logo.png", "image/png")
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturn401WithoutASession() {
		using var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(PngBytes);
		fileContent.Headers.ContentType =
			new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "logo.png");

		using var request = new HttpRequestMessage(HttpMethod.Post, UploadUrl) {
			Content = content
		};

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	private static HttpRequestMessage BuildUploadRequest(
		string token,
		byte[] bytes,
		string fileName,
		string claimedContentType
	) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(bytes);
		fileContent.Headers.ContentType =
			new System.Net.Http.Headers.MediaTypeHeaderValue(claimedContentType);
		content.Add(fileContent, "file", fileName);

		return new HttpRequestMessage(HttpMethod.Post, UploadUrl) {
			Content = content
		}.WithSessionToken(token);
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"upload-no-permission-{Guid.NewGuid():N}@example.com";
		await StaffUserTestHelper.SeedStaffUserAsync(_fixture, email);
		return await _authClient.LoginAsync(email, TestConstants.SeedPassword);
	}
}
