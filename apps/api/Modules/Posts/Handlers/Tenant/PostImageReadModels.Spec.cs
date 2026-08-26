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

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Read-model proofs for the attached post image (#639): GET detail and the
/// list endpoint must expose { url, alt_text, width_px, height_px } once an
/// image is attached, and PATCH image_alt_text must update it.
/// </summary>
public sealed class PostImageReadModelsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public PostImageReadModelsSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

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

	[Fact]
	public async Task
	ItShouldExposeAttachedImageInGetAndList() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		await AttachPngAsync(tenantId, token, postId, width: 64, height: 32);

		// Detail read model carries the full image projection.
		using var detail = await _http.SendAsync(
			new HttpRequestMessage(HttpMethod.Get, $"/posts/{postId}")
				.WithSessionToken(token)
				.WithTenantId(tenantId)
		);
		detail.StatusCode.Should().Be(HttpStatusCode.OK);
		var detailPayload =
			await detail.Content.ReadFromJsonAsync<PostDetailWithImage>();
		detailPayload.Should().NotBeNull();
		Assert.NotNull(detailPayload);
		detailPayload.Image.Should().NotBeNull();
		Assert.NotNull(detailPayload.Image);
		detailPayload.Image.Url.Should().StartWith("/files/");
		detailPayload.Image.AltText.Should().BeNull();
		detailPayload.Image.WidthPx.Should().Be(64);
		detailPayload.Image.HeightPx.Should().Be(32);

		// List rows carry the same projection for posts that own an image.
		using var list = await _http.SendAsync(
			new HttpRequestMessage(HttpMethod.Get, "/posts")
				.WithSessionToken(token)
				.WithTenantId(tenantId)
		);
		list.StatusCode.Should().Be(HttpStatusCode.OK);
		var listPayload =
			await list.Content.ReadFromJsonAsync<PostListWithImage>();
		listPayload.Should().NotBeNull();
		Assert.NotNull(listPayload);
		var row = listPayload.Data.Single(p => p.Id == Guid.Parse(postId));
		row.Image.Should().NotBeNull();
		Assert.NotNull(row.Image);
		row.Image.WidthPx.Should().Be(64);

		// A post without an image exposes a null image, not a missing field.
		var barePostId = await CreatePostAsync(tenantId, token);
		using var bare = await _http.SendAsync(
			new HttpRequestMessage(HttpMethod.Get, $"/posts/{barePostId}")
				.WithSessionToken(token)
				.WithTenantId(tenantId)
		);
		var barePayload =
			await bare.Content.ReadFromJsonAsync<PostDetailWithImage>();
		barePayload.Should().NotBeNull();
		Assert.NotNull(barePayload);
		barePayload.Image.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldUpdateAltTextViaPatchAndReflectItInGet() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		await AttachPngAsync(tenantId, token, postId, width: 16, height: 16);

		using var patch = new HttpRequestMessage(
			HttpMethod.Patch,
			$"/posts/{postId}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		patch.Content = JsonContent.Create(new {
			imageAltText = "A red logo on white background",
		});

		using var patchResponse = await _http.SendAsync(patch);
		patchResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var get = await _http.SendAsync(
			new HttpRequestMessage(HttpMethod.Get, $"/posts/{postId}")
				.WithSessionToken(token)
				.WithTenantId(tenantId)
		);
		var payload = await get.Content.ReadFromJsonAsync<PostDetailWithImage>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Image.Should().NotBeNull();
		Assert.NotNull(payload.Image);
		payload.Image.AltText.Should().Be("A red logo on white background");

		// The alt text lives on the asset row, not the post row.
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var asset = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == Guid.Parse(postId) && !a.IsDeleted
			select a
		).SingleAsync();
		asset.AltText.Should().Be("A red logo on white background");
	}

	[Fact]
	public async Task ItShouldRejectAltTextBeyondMaxLength() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		await AttachPngAsync(tenantId, token, postId, width: 8, height: 8);

		using var patch = new HttpRequestMessage(
			HttpMethod.Patch,
			$"/posts/{postId}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		patch.Content = JsonContent.Create(new {
			imageAltText = new string('a', 1001),
		});

		using var response = await _http.SendAsync(patch);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	// ── helpers ────────────────────────────────────────────────────────

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

	private async Task<string> CreatePostAsync(Guid tenantId, string token) {
		using var request = new HttpRequestMessage(HttpMethod.Post, "/posts")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "Read model spec " + Guid.NewGuid().ToString("N")[..8],
		});

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload = await response.Content.ReadFromJsonAsync<CreatePostDto>();
		if (payload is null) {
			throw new InvalidOperationException("Create post returned null");
		}
		return payload.Id.ToString();
	}

	private async Task AttachPngAsync(
		Guid tenantId,
		string token,
		string postId,
		int width,
		int height
	) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(PngBytes(width, height));
		fileContent.Headers.ContentType =
			new MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "logo.png");

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			$"/posts/{postId}/image"
		);
		request.Content = content;
		using (request
			.WithSessionToken(token)
			.WithTenantId(tenantId)) {
			using var response = await _http.SendAsync(request);
			response.EnsureSuccessStatusCode();
		}
	}

	private sealed record CreatePostDto(Guid Id);

	private sealed record PostDetailWithImage(
		Guid Id,
		string Body,
		PostImageDto? Image
	);

	private sealed record PostListWithImage(List<PostRowWithImage> Data);

	private sealed record PostRowWithImage(Guid Id, PostImageDto? Image);

	private sealed record PostImageDto(
		string Url,
		string? AltText,
		int WidthPx,
		int HeightPx
	);
}
