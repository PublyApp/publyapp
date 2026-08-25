using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Integration proofs for the per-post image attach/remove endpoints (#639).
/// Fixtures are hand-built PNG/GIF headers carrying REAL dimensions, parsed by
/// ImageInspector the same way the production handler will store them. The
/// foreign-tenant case is the exact isolation point later targeted by the
/// adverse-mutation proof (removing the TenantId filter must turn it red).
/// </summary>
public sealed class AttachPostImageForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public AttachPostImageForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	// PNG header fixture with REAL width/height in IHDR (big-endian), parsed by
	// ImageInspector.Inspect. Header-complete, not a decodable body — the same
	// trust level as the documented round-5 F5 sniff gap.
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

	private static string AttachImageUrl(string postId) {
		return PathUtils.Join("/posts", postId, "image");
	}

	[Fact]
	public async Task
	ItShouldAttachAnImageToADraftAndReturnDimensions() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(PngBytes(width: 64, height: 32));

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload =
			await response.Content.ReadFromJsonAsync<PostImageAttached>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.WidthPx.Should().Be(64);
		payload.HeightPx.Should().Be(32);
		payload.Url.Should().StartWith("/files/");
		payload.Url.Should().Be($"/files/{payload.Path}");
		payload.AltText.Should().BeNull();

		// Exactly one live asset row owns the post, and the underlying blob's
		// reference was acquired (reference_count >= 1) per #807 F5 discipline.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var asset = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			select a
		).SingleAsync();
		asset.TenantId.Should().Be(tenantId);
		asset.ContentType.Should().Be("image/png");
		asset.WidthPx.Should().Be(64);
		asset.HeightPx.Should().Be(32);
		asset.SizeBytes.Should().BeGreaterThan(0);
		asset.RelativePath.Should().Be(payload.Path);

		var referenced = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == payload.Path && !u.IsDeleted
			select u.ReferenceCount
		).SingleAsync();
		referenced.Should().BeGreaterThanOrEqualTo(1);
	}

	[Fact]
	public async Task
	ItShouldHideForeignTenantPostFromAttach() {
		var (acmeTenantId, acmeToken) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(acmeTenantId, acmeToken);

		var techStartToken = await _authClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(techStartToken)
			.WithTenantId(await GetTechStartTenantIdAsync());
		request.Content = BuildFileContent(PngBytes(width: 16, height: 16));

		using var response = await _http.SendAsync(request);

		// Foreign-tenant resources are invisible, never forbidden: 404, not 403.
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// And nothing leaked: Acme still owns zero image assets for that post.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var leaked = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid
			select a
		).AnyAsync();
		leaked.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldPurgeAssetWhenPostDeleted() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var attachRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		attachRequest.Content = BuildFileContent(PngBytes(width: 24, height: 24));
		using (attachRequest) {
			using var attachResponse = await _http.SendAsync(attachRequest);
			attachResponse.EnsureSuccessStatusCode();
			var attached = await attachResponse.Content
				.ReadFromJsonAsync<PostImageAttached>();
			Assert.NotNull(attached);
			attachedPath = attached.Path;
		}

		// Deleting the post must purge the asset row (hard delete, no soft
		// residue) and drop the blob's reference to zero — no orphans.
		using var deleteRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			PathUtils.Join("/posts", postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using (deleteRequest) {
			using var deleteResponse = await _http.SendAsync(deleteRequest);
			deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var remaining = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid
			select a
		).CountAsync();
		remaining.Should().Be(0, "the asset row must be hard-deleted with its post");

		var referenceCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == attachedPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleOrDefaultAsync();
		referenceCount.Should().Be(0,
			"the blob reference must be released when the owning post dies");
	}

	private string attachedPath = string.Empty;

	// ── helpers ────────────────────────────────────────────────────────

	private static MultipartFormDataContent BuildFileContent(byte[] bytes) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(bytes);
		fileContent.Headers.ContentType =
			new MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "logo.png");
		return content;
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
			body = "Post image spec " + Guid.NewGuid().ToString("N")[..8],
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
