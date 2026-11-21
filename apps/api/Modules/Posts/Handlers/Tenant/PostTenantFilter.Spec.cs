using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Two-tenant proof (#2460) that the Posts services rely on the global tenant
/// filter alone: each tenant owns a thread post with an image; a tenant never
/// lists, reads, updates, deletes or reaches the other's rows through real routes.
/// </summary>
public sealed class PostTenantFilterSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PostTenantFilterSpec(ApiFixture fixture) {
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private sealed record Session(Guid TenantId, string Token);

	private sealed record CreatedDto(Guid Id);

	private sealed record ItemDto(Guid Id);

	private sealed record ListDto(List<ItemDto> Data);

	private sealed record ImageDto(Guid Id);

	private sealed record SegmentDto(Guid Id, List<ImageDto> Images);

	private sealed record PostDto(Guid Id, string Body, List<ImageDto> Images, List<SegmentDto> Segments);

	[Fact]
	public async Task ItShouldKeepEachTenantsPostsSegmentsAndImagesInvisibleAndUntouchableToTheOther() {
		var a = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var b = await this._LoginAsync(SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail);
		var postA = await this._CreateThreadWithImageAsync(a);
		var postB = await this._CreateThreadWithImageAsync(b);

		(await this._ListIdsAsync(a)).Should().Contain(postA).And.NotContain(postB);
		(await this._ListIdsAsync(b)).Should().Contain(postB).And.NotContain(postA);

		var seenByA = await this._GetAsync(a, postA);
		seenByA.Images.Should().HaveCount(1);
		seenByA.Segments.Should().HaveCount(1);
		seenByA.Segments[0].Images.Should().HaveCount(1);

		using var getForeign = await this._SendAsync(b, HttpMethod.Get, $"/posts/{postA}", null);
		using var patchForeign = await this._SendAsync(
			b, HttpMethod.Patch, $"/posts/{postA}", JsonContent.Create(new { body = "hijacked" })
		);
		using var deleteForeign = await this._SendAsync(b, HttpMethod.Delete, $"/posts/{postA}", null);
		using var altTextForeign = await this._SendAsync(
			b, HttpMethod.Patch, $"/posts/{postA}/images/{seenByA.Images[0].Id}", JsonContent.Create(new { altText = "x" })
		);
		using var deleteForeignSegmentImage = await this._SendAsync(
			b, HttpMethod.Delete,
			$"/posts/{postA}/segments/{seenByA.Segments[0].Id}/images/{seenByA.Segments[0].Images[0].Id}", null
		);

		getForeign.StatusCode.Should().Be(HttpStatusCode.NotFound);
		patchForeign.StatusCode.Should().Be(HttpStatusCode.NotFound);
		deleteForeign.StatusCode.Should().Be(HttpStatusCode.NotFound);
		altTextForeign.StatusCode.Should().Be(HttpStatusCode.NotFound);
		deleteForeignSegmentImage.StatusCode.Should().Be(HttpStatusCode.NotFound);

		var afterA = await this._GetAsync(a, postA);
		afterA.Body.Should().Be(seenByA.Body);
		afterA.Images.Should().HaveCount(1);
		afterA.Segments[0].Images.Should().HaveCount(1);
		(await this._GetAsync(b, postB)).Images.Should().HaveCount(1);

		using var deleteOwn = await this._SendAsync(a, HttpMethod.Delete, $"/posts/{postA}", null);
		deleteOwn.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.NoContent);
		(await this._ListIdsAsync(a)).Should().NotContain(postA);
		(await this._ListIdsAsync(b)).Should().Contain(postB);
	}

	private async Task<Guid> _CreateThreadWithImageAsync(Session s) {
		var suffix = Guid.NewGuid().ToString("N")[..8];
		using var create = await this._SendAsync(
			s, HttpMethod.Post, "/posts",
			JsonContent.Create(new { body = "tenant-filter " + suffix, segments = new List<string> { "follow-up" } })
		);
		create.EnsureSuccessStatusCode();
		var created = (await create.Content.ReadFromJsonAsync<CreatedDto>()).Required();

		using var image = await this._SendAsync(s, HttpMethod.Post, $"/posts/{created.Id}/image", PostTenantFilterSpec._File());
		image.StatusCode.Should().Be(HttpStatusCode.Created);

		var post = await this._GetAsync(s, created.Id);
		using var segImage = await this._SendAsync(
			s, HttpMethod.Post, $"/posts/{created.Id}/segments/{post.Segments[0].Id}/images", PostTenantFilterSpec._File()
		);
		segImage.StatusCode.Should().Be(HttpStatusCode.Created);
		return created.Id;
	}

	private async Task<List<Guid>> _ListIdsAsync(Session s) {
		using var response = await this._SendAsync(s, HttpMethod.Get, "/posts?limit=100", null);
		response.EnsureSuccessStatusCode();
		var payload = (await response.Content.ReadFromJsonAsync<ListDto>()).Required();
		return [.. payload.Data.Select(i => i.Id)];
	}

	private async Task<PostDto> _GetAsync(Session s, Guid postId) {
		using var response = await this._SendAsync(s, HttpMethod.Get, $"/posts/{postId}", null);
		response.EnsureSuccessStatusCode();
		return (await response.Content.ReadFromJsonAsync<PostDto>()).Required();
	}

	private async Task<HttpResponseMessage> _SendAsync(Session s, HttpMethod method, string url, HttpContent? content) {
		using var request = new HttpRequestMessage(method, url)
			.WithSessionToken(s.Token)
			.WithTenantId(s.TenantId);
		request.Content = content;
		return await this._Http.SendAsync(request);
	}

	private async Task<Session> _LoginAsync(string tenantName, string email) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(this._Http, staffToken, tenantName);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		return new Session(tenantId, token);
	}

	private static MultipartFormDataContent _File() {
		var content = new MultipartFormDataContent();
		var file = new ByteArrayContent(TestImages.Png(10, 8));
		file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
		content.Add(file, "file", "x.png");
		return content;
	}
}
