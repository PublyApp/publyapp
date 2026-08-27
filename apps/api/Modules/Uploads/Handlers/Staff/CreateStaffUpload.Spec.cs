
using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
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

	// SniffImageType (CreateStaffUpload.cs) only inspects the leading magic-byte
	// header, never decodes the image body — these fixtures satisfy exactly that
	// check plus (for GIF) a non-zero logical-screen width/height, and nothing
	// more. They are NOT complete, decodable images: do not read "accepted by
	// this endpoint" as "is a usable image" (round-5 API F5).
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
	// Logical screen descriptor width=1, height=1 (little-endian uint16 each) —
	// SniffImageType now rejects a zero-sized canvas (round-5 API F5).
	private static readonly byte[] GifBytes = [
		(byte)'G', (byte)'I', (byte)'F', (byte)'8', (byte)'9', (byte)'a',
		0x01, 0x00, 0x01, 0x00, 0x00, 0x00
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

	// r4-tests-F2: the prior version only asserted 404 for `../appsettings.json`
	// and `%2e%2e/%2e%2e/etc/passwd` — both are canonical dot-segment URLs that
	// HttpClient/Uri normalize away (RFC 3986 §5.2.4) before the request ever
	// reaches the server, and even if they did reach it, the default storage
	// root (`.artifacts/storage`) never contains an `appsettings.json` or
	// `/etc/passwd` sentinel, so 404 there proves nothing about the traversal
	// boundary — a decode-and-allow regression would still return 404 by
	// "target absent," not "traversal rejected." This rebuild creates a real
	// control file inside the storage root and a real, uniquely named
	// sentinel immediately outside it, proves the control is served (so the
	// serving mechanism itself is known-good), then reaches the static-file
	// middleware with the literal ".." bytes still in `HttpContext.Request.Path`
	// via `TestServer.SendAsync` (which builds the `HttpContext` directly,
	// bypassing all `Uri`/`HttpClient` string-based normalization) and asserts
	// the real, existing sentinel is NOT served.
	[Fact]
	public async Task ItShouldRejectPathTraversalToARealFileOutsideTheServedRoot() {
		var fileStorage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var rootPath = fileStorage.RootPath;
		var uploadsDir = Path.Combine(rootPath, "uploads");
		Directory.CreateDirectory(uploadsDir);

		// The serving control must live under the rescoped mount (`uploads/`,
		// issue #1602) so it is still anonymously retrievable via `/files/uploads/...`.
		var controlFileName = $"traversal-control-{Guid.NewGuid():N}.txt";
		var controlContent = $"control-{Guid.NewGuid():N}";
		var controlPath = Path.Combine(uploadsDir, controlFileName);

		var sentinelFileName = $"traversal-sentinel-{Guid.NewGuid():N}.txt";
		var sentinelContent = $"sentinel-{Guid.NewGuid():N}";
		var sentinelPath = Path.Combine(rootPath, "..", sentinelFileName);

		await File.WriteAllTextAsync(controlPath, controlContent);
		await File.WriteAllTextAsync(sentinelPath, sentinelContent);

		try {
			using var controlResponse = await _http.GetAsync($"/files/uploads/{controlFileName}");
			controlResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			(await controlResponse.Content.ReadAsStringAsync()).Should().Be(controlContent);

			var traversalContext = await _fixture.Factory.Server.SendAsync(context => {
				context.Request.Method = "GET";
				context.Request.Path = new PathString($"/files/../{sentinelFileName}");
			});

			traversalContext.Response.StatusCode.Should().Be((int)HttpStatusCode.NotFound);
		} finally {
			File.Delete(controlPath);
			File.Delete(sentinelPath);
		}
	}

	// Covers the delivery half of the upload feature — the anonymous /files
	// static-file middleware wired in Program.cs (per review r1-api F7). Folded
	// in here (rather than a standalone FileServing.Spec.cs) because it has no
	// FileServing.cs source to sit beside — this endpoint's served-URL contract
	// is what CreateStaffUpload actually returns.
	[Fact]
	public async Task ItShouldServeUploadedFilesAnonymously() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var uploadResponse = await _http.SendAsync(
			BuildUploadRequest(token, PngBytes, "logo.png", "image/png")
		);
		uploadResponse.StatusCode.Should().Be(HttpStatusCode.Created);

		var uploaded = await uploadResponse.Content.ReadFromJsonAsync<StaffUploadCreated>();
		uploaded.Should().NotBeNull();
		Assert.NotNull(uploaded);

		// A deliberately bare request — no session token, no tenant header —
		// pins the intended contract: the served asset is public.
		using var request = new HttpRequestMessage(HttpMethod.Get, uploaded.Url);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
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
		// (UPLOAD_MAX_BYTES + UploadLimits.MultipartHeaderHeadroomBytes) so this
		// exercises the handler's own size check, not Kestrel's earlier rejection.
		var oversized = new byte[AppEnvironment.Instance.UPLOAD_MAX_BYTES + 1];
		PngBytes.CopyTo(oversized, 0);

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, oversized, "big.png", "image/png")
		);

		response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
	}

	[Fact]
	public void ItShouldDeclareTheTransportSizeLimitOnTheCreateEndpoint() {
		// A request-level assertion here cannot discriminate: TestServer does not
		// surface IHttpMaxRequestBodySizeFeature (the feature the metadata below
		// actually configures at runtime), and any body under Kestrel's 30 MB
		// default reaches the handler's own size check regardless, which returns
		// the same 413. Reading the endpoint metadata directly is the only way
		// this test fails when the RequestSizeLimitAttribute is dropped or its
		// value drifts.
		using var scope = _fixture.Factory.Services.CreateScope();
		var dataSource = scope.ServiceProvider.GetRequiredService<EndpointDataSource>();

		var endpoint = dataSource.Endpoints
			.OfType<RouteEndpoint>()
			.Single(ep => ep.Metadata
				.GetMetadata<EndpointNameMetadata>()?.EndpointName
				== "CreateStaffUpload");

		var sizeLimit = endpoint.Metadata.GetMetadata<IRequestSizeLimitMetadata>();

		sizeLimit.Should().NotBeNull(
			"the CreateStaffUpload endpoint must declare a transport-level "
			+ "RequestSizeLimitAttribute so an unauthenticated or over-quota "
			+ "caller cannot force a full oversized multipart body to be "
			+ "spooled to disk before being rejected"
		);
		sizeLimit!.MaxRequestBodySize.Should().Be(
			AppEnvironment.Instance.UPLOAD_MAX_BYTES + UploadLimits.MultipartHeaderHeadroomBytes
		);

		// Pin the ordering invariant the two headroom constants depend on: the
		// endpoint-level transport limit (this attribute) must trip before the
		// shared FormOptions.MultipartBodyLengthLimit, or an oversize upload on
		// this endpoint would 400 instead of 413.
		sizeLimit.MaxRequestBodySize.Should().BeLessThan(
			AppEnvironment.Instance.UPLOAD_MAX_BYTES + UploadLimits.FormOptionsHeadroomBytes
		);
	}

	[Fact]
	public async Task ItShouldReturn422WhenFileHasNoImageSignatureAtAll() {
		// Not a spoofing attempt: this content has no image magic-byte prefix at
		// all. See ItShouldAccept... below for the actual spoofing case (valid
		// magic bytes followed by arbitrary data), which SniffImageType does NOT
		// currently detect (round-5 API F5).
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
	public async Task ItShouldReturn422WhenPngSignatureIsTruncated() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		// Only the first 4 of the 8 PNG signature bytes — SniffImageType must not
		// misclassify a short read as a valid image (round-5 API F5).
		var truncatedBytes = PngBytes[..4];

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, truncatedBytes, "truncated.png", "image/png")
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturn422WhenGifLogicalScreenIsZeroSized() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		// Valid GIF89a signature but width=0, height=0 — a degenerate canvas that
		// cannot be a real image (round-5 API F5).
		byte[] zeroSizedGif = [
			(byte)'G', (byte)'I', (byte)'F', (byte)'8', (byte)'9', (byte)'a',
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00
		];

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, zeroSizedGif, "empty.gif", "image/gif")
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	// r5/W5-HARDEN item 4: renamed from ItShouldAcceptValidMagicBytesFollowedBy...
	// to name the actual contract instead of implying full validation. The
	// endpoint's documented promise is signature sniffing (leading magic bytes
	// only), never a full decode — see the SniffImageType doc comment in
	// CreateStaffUpload.cs. If a real security hole is judged to exist here
	// (undecodable images reaching storage), closing it means adding full
	// image decode + dimension bounds via a hardened image library, which is
	// an owner decision out of scope for this fix.
	[Fact]
	public async Task ItShouldAcceptFilesWhoseSignatureIsValidWithoutDecodingThePayload() {
		// Documents a real, known gap rather than certifying protection that
		// doesn't exist: SniffImageType only inspects the leading magic-byte
		// header and never decodes the body, so a valid PNG signature followed
		// by non-image garbage is still accepted. This is an accepted risk here
		// because the endpoint rewrites the extension server-side and serves
		// uploads with `nosniff`, which together block the HTML/SVG stored-XSS
		// vector — but the accepted content is not guaranteed to be a usable or
		// safe image otherwise (round-5 API F5; see CreateStaffUpload.cs F5
		// comment for the hardening this would require: full decode + dimension
		// bounds via a hardened image library).
		var token = await _authClient.LoginAsStaffAdminAsync();
		var spoofedBytes = PngBytes
			.Concat("<script>alert(1)</script> definitely not image data"u8.ToArray())
			.ToArray();

		using var response = await _http.SendAsync(
			BuildUploadRequest(token, spoofedBytes, "spoofed.png", "image/png")
		);

		response.StatusCode.Should().Be(HttpStatusCode.Created);
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
