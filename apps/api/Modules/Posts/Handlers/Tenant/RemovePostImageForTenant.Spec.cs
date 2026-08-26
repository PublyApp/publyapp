using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Integration proofs for removing a post's image (#639): the verb stays
/// tenant-blind across boundaries (foreign tenant sees 404, never 403),
/// removal hard-deletes the asset row and releases the blob reference (no
/// orphans), and removing without an image names that cause instead of
/// failing silently.
/// </summary>
public sealed class RemovePostImageForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public RemovePostImageForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	// PNG header fixture with REAL width/height in IHDR (big-endian), parsed
	// by ImageInspector.Inspect exactly like the production attach flow.
	private static byte[] PngBytes(int width, int height) {
		var bytes = new List<byte> {
			0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
			0x00, 0x00, 0x00, 0x0D,
			(byte)'I', (byte)'H', (byte)'D', (byte)'R',
		};
		bytes.AddRange(BitConverter.GetBytes(
			System.Buffers.Binary.BinaryPrimitives.ReverseEndianness(width)
		));
		bytes.AddRange(BitConverter.GetBytes(
			System.Buffers.Binary.BinaryPrimitives.ReverseEndianness(height)
		));
		return [.. bytes];
	}

	private static string ImageUrl(string postId) {
		return PathUtils.Join("/posts", postId, "image");
	}

	[Fact]
	public async Task ItShouldRemoveImageAndLeaveNoRow() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		var attachedPath = await AttachImageAsync(tenantId, token, postId);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			ImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<ApiResponse>();
		Assert.NotNull(payload);
		payload.Key.Should().Be("post-image-removed-success");

		// No live asset row survives, and the blob's reference dropped back
		// to zero — physical deletion stays exclusively sweeper's.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var remaining = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			select a
		).AnyAsync();
		remaining.Should().BeFalse();

		var referenceCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == attachedPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleOrDefaultAsync();
		referenceCount.Should().Be(0,
			"a removed image must release its blob reference");
	}

	[Fact]
	public async Task ItShouldReturn404WhenRemovingWithoutImage() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			ImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// The refusal names its cause: there is no image to remove.
		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-missing");
	}

	[Fact]
	public async Task ItShouldHideForeignTenantPostFromRemove() {
		var (acmeTenantId, acmeToken) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(acmeTenantId, acmeToken);
		await AttachImageAsync(acmeTenantId, acmeToken, postId);

		var techStartToken = await _authClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			ImageUrl(postId)
		)
			.WithSessionToken(techStartToken)
			.WithTenantId(await GetTechStartTenantIdAsync());
		using var response = await _http.SendAsync(request);

		// Foreign-tenant resources are invisible, never forbidden: 404.
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// And Acme's image survived untouched: still one live row, still
		// referenced.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var livePaths = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			select a.RelativePath
		).ToListAsync();
		livePaths.Should().HaveCount(1);

		var referenceCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == livePaths[0] && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleOrDefaultAsync();
		referenceCount.Should().BeGreaterThanOrEqualTo(1);
	}

	[Fact]
	public async Task ItShouldRefuseRemoveWithoutPermission() {
		var (tenantId, adminToken) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, adminToken);
		var userToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			ImageUrl(postId)
		)
			.WithSessionToken(userToken)
			.WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be("user-does-not-have-the-necessary-permissions");
	}

	// ── helpers ────────────────────────────────────────────────────────

	private static MultipartFormDataContent BuildFileContent(byte[] bytes) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(bytes);
		fileContent.Headers.ContentType =
			new MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "logo.png");
		return content;
	}

	private async Task<string> AttachImageAsync(
		Guid tenantId,
		string token,
		string postId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(PngBytes(width: 32, height: 32));

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload =
			await response.Content.ReadFromJsonAsync<PostImageAttached>();
		Assert.NotNull(payload);
		return payload.Path;
	}

	private async Task<(Guid TenantId, string Token)>
	LoginAsAcmeAdminAsync() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> GetAcmeIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> GetTechStartTenantIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);
	}

	private async Task<string> CreatePostAsync(Guid tenantId, string token) {
		using var request = new HttpRequestMessage(HttpMethod.Post, "/posts")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "Remove image spec " + Guid.NewGuid().ToString("N")[..8],
		});

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload = await response.Content.ReadFromJsonAsync<CreatePostDto>();
		if (payload is null) {
			throw new InvalidOperationException("Create post returned null");
		}
		return payload.Id.ToString();
	}

	private sealed record CreatePostDto(Guid Id);
}
