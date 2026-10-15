using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Integration proofs for the multi-image management endpoints (#2170): the
/// ordered <c>images</c> read model, per-image alt text, reorder, remove by id
/// (positions close the gap, references release) and the legacy single-image
/// shape that old clients still read.
/// </summary>
public sealed class PostImagesManagementSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PostImagesManagementSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private sealed record ImageDto(Guid Id, int Position, string Url, string? AltText, int WidthPx, int HeightPx);

	private sealed record PostDto(ImageDto? Image, List<ImageDto> Images);

	private sealed record ReorderedDto(List<ImageDto> Images);

	private sealed record CreatedDto(Guid Id);

	private sealed record AttachedDto(Guid Id, int Position, string Path);

	[Fact]
	public async Task ItShouldExposeImagesInOrderAndKeepTheLegacyFirstImageField() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var first = await this._AttachAsync(tenantId, token, postId, 10);
		var second = await this._AttachAsync(tenantId, token, postId, 20);

		var post = await this._GetPostAsync(tenantId, token, postId);

		post.Images.Select(i => i.Id).Should().Equal(first.Id, second.Id);
		post.Images.Select(i => i.Position).Should().Equal(0, 1);
		post.Image.Should().NotBeNull("old clients keep reading the first image");
		Assert.NotNull(post.Image);
		post.Image.Id.Should().Be(first.Id);
	}

	[Fact]
	public async Task ItShouldSaveAltTextPerImageAndAllowClearingIt() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var first = await this._AttachAsync(tenantId, token, postId, 10);
		var second = await this._AttachAsync(tenantId, token, postId, 20);

		using var set = await this._PatchAsync(
			tenantId, token, $"/posts/{postId}/images/{second.Id}", new { altText = "second alt" }
		);
		set.StatusCode.Should().Be(HttpStatusCode.OK);

		var post = await this._GetPostAsync(tenantId, token, postId);
		post.Images[0].AltText.Should().BeNull("the other image is untouched");
		post.Images[1].AltText.Should().Be("second alt");

		using var clear = await this._PatchAsync(
			tenantId, token, $"/posts/{postId}/images/{second.Id}", new { altText = "" }
		);
		clear.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._GetPostAsync(tenantId, token, postId)).Images[1].AltText.Should().BeNull();

		using var tooLong = await this._PatchAsync(
			tenantId, token, $"/posts/{postId}/images/{first.Id}", new { altText = new string('a', 1001) }
		);
		tooLong.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		using var unknown = await this._PatchAsync(
			tenantId, token, $"/posts/{postId}/images/{Guid.NewGuid()}", new { altText = "x" }
		);
		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReorderImagesAndRejectAListThatIsNotTheExactSet() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var a = await this._AttachAsync(tenantId, token, postId, 10);
		var b = await this._AttachAsync(tenantId, token, postId, 20);
		var c = await this._AttachAsync(tenantId, token, postId, 30);

		using var reorder = await this._PatchAsync(
			tenantId, token, $"/posts/{postId}/images/order", new { assetIds = new[] { c.Id, a.Id, b.Id } }
		);
		reorder.StatusCode.Should().Be(HttpStatusCode.OK);
		var reordered = await reorder.Content.ReadFromJsonAsync<ReorderedDto>();
		Assert.NotNull(reordered);
		reordered.Images.Select(i => i.Id).Should().Equal(c.Id, a.Id, b.Id);

		(await this._GetPostAsync(tenantId, token, postId)).Images.Select(i => i.Id)
			.Should().Equal(c.Id, a.Id, b.Id);

		using var partial = await this._PatchAsync(
			tenantId, token, $"/posts/{postId}/images/order", new { assetIds = new[] { a.Id, b.Id } }
		);
		partial.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await partial.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-images-order-mismatch");

		using var duplicated = await this._PatchAsync(
			tenantId, token, $"/posts/{postId}/images/order", new { assetIds = new[] { a.Id, a.Id, b.Id } }
		);
		duplicated.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldRemoveOneImageByIdCloseTheGapAndReleaseItsReference() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var a = await this._AttachAsync(tenantId, token, postId, 10);
		var b = await this._AttachAsync(tenantId, token, postId, 20);
		var c = await this._AttachAsync(tenantId, token, postId, 30);

		using var delete = await this._SendAsync(
			tenantId, token, HttpMethod.Delete, $"/posts/{postId}/images/{b.Id}", null
		);
		delete.StatusCode.Should().Be(HttpStatusCode.OK);

		var post = await this._GetPostAsync(tenantId, token, postId);
		post.Images.Select(i => i.Id).Should().Equal(a.Id, c.Id);
		post.Images.Select(i => i.Position).Should().Equal(0, 1);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var removedReferences = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == b.Path && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleAsync();
		removedReferences.Should().Be(0);

		// Appending again reuses the freed slot, so a 4-image post is reachable.
		var d = await this._AttachAsync(tenantId, token, postId, 40);
		d.Position.Should().Be(2);
	}

	[Fact]
	public async Task ItShouldRemoveTheFirstImageThroughTheLegacySingleImageRoute() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var a = await this._AttachAsync(tenantId, token, postId, 10);
		var b = await this._AttachAsync(tenantId, token, postId, 20);

		using var delete = await this._SendAsync(
			tenantId, token, HttpMethod.Delete, $"/posts/{postId}/image", null
		);
		delete.StatusCode.Should().Be(HttpStatusCode.OK);

		var post = await this._GetPostAsync(tenantId, token, postId);
		post.Images.Select(i => i.Id).Should().Equal(b.Id);
		post.Images[0].Position.Should().Be(0);
		a.Id.Should().NotBe(b.Id);
	}

	[Fact]
	public async Task ItShouldHideForeignTenantPostsFromEveryManagementEndpoint() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var a = await this._AttachAsync(tenantId, token, postId, 10);

		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var otherTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.TechStartName
		);
		var otherToken = await this._AuthClient.LoginAsync(
			TestConstants.TechStartAdminEmail, TestConstants.SeedPassword
		);

		using var alt = await this._PatchAsync(
			otherTenantId, otherToken, $"/posts/{postId}/images/{a.Id}", new { altText = "x" }
		);
		using var order = await this._PatchAsync(
			otherTenantId, otherToken, $"/posts/{postId}/images/order", new { assetIds = new[] { a.Id } }
		);
		using var delete = await this._SendAsync(
			otherTenantId, otherToken, HttpMethod.Delete, $"/posts/{postId}/images/{a.Id}", null
		);

		alt.StatusCode.Should().Be(HttpStatusCode.NotFound);
		order.StatusCode.Should().Be(HttpStatusCode.NotFound);
		delete.StatusCode.Should().Be(HttpStatusCode.NotFound);
		(await this._GetPostAsync(tenantId, token, postId)).Images.Should().HaveCount(1);
	}

	private async Task<HttpResponseMessage> _PatchAsync(Guid tenantId, string token, string url, object body) {
		return await this._SendAsync(tenantId, token, HttpMethod.Patch, url, JsonContent.Create(body));
	}

	private async Task<HttpResponseMessage> _SendAsync(
		Guid tenantId,
		string token,
		HttpMethod method,
		string url,
		HttpContent? content
	) {
		using var request = new HttpRequestMessage(method, url)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = content;
		return await this._Http.SendAsync(request);
	}

	private async Task<PostDto> _GetPostAsync(Guid tenantId, string token, string postId) {
		using var response = await this._SendAsync(tenantId, token, HttpMethod.Get, $"/posts/{postId}", null);
		response.EnsureSuccessStatusCode();
		var post = await response.Content.ReadFromJsonAsync<PostDto>();
		Assert.NotNull(post);
		return post;
	}

	private async Task<AttachedDto> _AttachAsync(Guid tenantId, string token, string postId, int width) {
		var content = new MultipartFormDataContent();
		var file = new ByteArrayContent(PostImagesManagementSpec._PngBytes(width, 8));
		file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
		content.Add(file, "file", "x.png");
		using var response = await this._SendAsync(tenantId, token, HttpMethod.Post, $"/posts/{postId}/image", content);
		response.StatusCode.Should().Be(HttpStatusCode.Created);
		var attached = await response.Content.ReadFromJsonAsync<AttachedDto>();
		Assert.NotNull(attached);
		return attached;
	}

	private async Task<string> _CreatePostAsync(Guid tenantId, string token) {
		using var response = await this._SendAsync(
			tenantId, token, HttpMethod.Post, "/posts",
			JsonContent.Create(new { body = "Images spec " + Guid.NewGuid().ToString("N")[..8] })
		);
		response.EnsureSuccessStatusCode();
		var created = await response.Content.ReadFromJsonAsync<CreatedDto>();
		Assert.NotNull(created);
		return created.Id.ToString();
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private static byte[] _PngBytes(int width, int height) {
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
}
