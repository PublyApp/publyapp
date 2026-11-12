using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Images on follow-up segments of a thread (#2181): attach / reorder / detach per segment,
/// images that stay with THEIR text when segments move, release on segment removal, the
/// read-only rule for published segments, and blank follow-ups flagged instead of dropped.
/// </summary>
public sealed class PostSegmentImagesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PostSegmentImagesSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private sealed record ImageDto(Guid Id, int Position, string Url, string? AltText);

	private sealed record SegmentDto(Guid Id, int Number, string Body, List<ImageDto> Images);

	private sealed record PostDto(List<ImageDto> Images, List<SegmentDto> Segments, int PublishedSegmentCount);

	private sealed record CreatedDto(Guid Id);

	private sealed record AttachedDto(Guid Id, int Position, string Path);

	private sealed record ReorderedDto(List<ImageDto> Images);

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

	private async Task<HttpResponseMessage> _SendAsync(
		Guid tenantId,
		string token,
		HttpMethod method,
		string url,
		HttpContent? content = null
	) {
		using var request = new HttpRequestMessage(method, url)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = content;
		return await this._Http.SendAsync(request);
	}

	private async Task<PostDto> _GetAsync(Guid tenantId, string token, Guid postId) {
		using var response = await this._SendAsync(tenantId, token, HttpMethod.Get, $"/posts/{postId}");
		response.EnsureSuccessStatusCode();
		var post = await response.Content.ReadFromJsonAsync<PostDto>();
		Assert.NotNull(post);
		return post;
	}

	private async Task<Guid> _CreateThreadAsync(Guid tenantId, string token, params string[] followUps) {
		using var response = await this._SendAsync(
			tenantId, token, HttpMethod.Post, "/posts",
			JsonContent.Create(new { body = "Thread spec " + Guid.NewGuid().ToString("N")[..8], segments = followUps })
		);
		response.StatusCode.Should().Be(HttpStatusCode.Created);
		var created = await response.Content.ReadFromJsonAsync<CreatedDto>();
		Assert.NotNull(created);
		return created.Id;
	}

	private static MultipartFormDataContent _File(int width) {
		var content = new MultipartFormDataContent();
		var file = new ByteArrayContent(TestImages.Png(width, 8));
		file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
		content.Add(file, "file", "x.png");
		return content;
	}

	private async Task<AttachedDto> _AttachAsync(Guid tenantId, string token, Guid postId, Guid segmentId, int width) {
		using var response = await this._SendAsync(
			tenantId, token, HttpMethod.Post, $"/posts/{postId}/segments/{segmentId}/images", PostSegmentImagesSpec._File(width)
		);
		response.StatusCode.Should().Be(HttpStatusCode.Created);
		var attached = await response.Content.ReadFromJsonAsync<AttachedDto>();
		Assert.NotNull(attached);
		return attached;
	}

	private static async Task<JsonElement> _ProblemAsync(HttpResponseMessage response) {
		using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
		return document.RootElement.Clone();
	}

	[Fact]
	public async Task ItShouldKeepEachSegmentsImagesOnItsOwnWithItsOwnPositionsAndOffThePostsImages() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three");
		var segments = (await this._GetAsync(tenantId, token, postId)).Segments;

		var a = await this._AttachAsync(tenantId, token, postId, segments[0].Id, 10);
		var b = await this._AttachAsync(tenantId, token, postId, segments[0].Id, 20);
		var c = await this._AttachAsync(tenantId, token, postId, segments[1].Id, 30);

		a.Position.Should().Be(0);
		b.Position.Should().Be(1);
		c.Position.Should().Be(0, "the second segment orders its own images");
		var post = await this._GetAsync(tenantId, token, postId);
		post.Images.Should().BeEmpty("segment images are not the post's own images");
		post.Segments[0].Images.Select(image => image.Id).Should().Equal(a.Id, b.Id);
		post.Segments[1].Images.Select(image => image.Id).Should().Equal(c.Id);
	}

	[Fact]
	public async Task ItShouldRefuseAFifthImageOnAFollowUpAtAttachTimeButStillTakeOneOnTheNextSegment() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three");
		var segments = (await this._GetAsync(tenantId, token, postId)).Segments;
		// A follow-up carries 0 to 4 images: the most a thread destination accepts.
		ProviderCapabilityRegistry.MaxImagesPerFollowUp.Should().Be(4);
		for (var width = 10; width < 14; width++) {
			await this._AttachAsync(tenantId, token, postId, segments[0].Id, width);
		}

		using var overCap = await this._SendAsync(
			tenantId, token, HttpMethod.Post, $"/posts/{postId}/segments/{segments[0].Id}/images", PostSegmentImagesSpec._File(99)
		);

		overCap.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await PostSegmentImagesSpec._ProblemAsync(overCap)).GetProperty("translationKey").GetString().Should().Be("post-image-limit-reached");
		await this._AttachAsync(tenantId, token, postId, segments[1].Id, 50);
	}

	[Fact]
	public async Task ItShouldSetAndClearTheAltTextOfASegmentImageUntilItsSegmentIsPublished() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three");
		var segments = (await this._GetAsync(tenantId, token, postId)).Segments;
		var onTwo = await this._AttachAsync(tenantId, token, postId, segments[0].Id, 10);
		var onThree = await this._AttachAsync(tenantId, token, postId, segments[1].Id, 20);

		using var set = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}/segments/{segments[1].Id}/images/{onThree.Id}",
			JsonContent.Create(new { altText = "a cat" })
		);
		set.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._GetAsync(tenantId, token, postId)).Segments[1].Images.Single().AltText.Should().Be("a cat");

		await this._SeedPublishedSegmentsAsync(tenantId, postId, count: 2);
		using var locked = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}/segments/{segments[0].Id}/images/{onTwo.Id}",
			JsonContent.Create(new { altText = "too late" })
		);

		locked.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await PostSegmentImagesSpec._ProblemAsync(locked)).GetProperty("translationKey").GetString().Should().Be("post-segments-locked");
		(await this._GetAsync(tenantId, token, postId)).Segments[0].Images.Single().AltText.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldRefuseSegmentIdsThatRepeatAnIdInAnotherCaseOrDoNotMatchTheSegmentCount() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three");
		var segments = (await this._GetAsync(tenantId, token, postId)).Segments;

		using var repeated = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}",
			JsonContent.Create(new {
				segments = new List<string> { "a", "b" },
				segmentIds = new[] { segments[0].Id.ToString().ToLowerInvariant(), segments[0].Id.ToString().ToUpperInvariant() },
			})
		);
		using var shortList = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}",
			JsonContent.Create(new { segments = new List<string> { "a", "b" }, segmentIds = new Guid?[] { segments[0].Id } })
		);

		repeated.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		shortList.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await this._GetAsync(tenantId, token, postId)).Segments.Select(segment => segment.Body)
			.Should().Equal("two", "three");
	}

	[Fact]
	public async Task ItShouldDeleteSegmentImagesWithTheirPostAndReleaseTheirReferences() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two");
		var segment = (await this._GetAsync(tenantId, token, postId)).Segments[0];
		var image = await this._AttachAsync(tenantId, token, postId, segment.Id, 10);

		using var delete = await this._SendAsync(tenantId, token, HttpMethod.Delete, $"/posts/{postId}");

		delete.IsSuccessStatusCode.Should().BeTrue();
		(await this._LiveSegmentImageCountAsync(postId)).Should().Be(0);
		(await this._ReferenceCountAsync(image.Path)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReorderAndDetachSegmentImagesClosingTheGapAndReleasingTheReference() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two");
		var segment = (await this._GetAsync(tenantId, token, postId)).Segments[0];
		var a = await this._AttachAsync(tenantId, token, postId, segment.Id, 10);
		var b = await this._AttachAsync(tenantId, token, postId, segment.Id, 20);
		var c = await this._AttachAsync(tenantId, token, postId, segment.Id, 30);

		using var reorder = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}/segments/{segment.Id}/images/order",
			JsonContent.Create(new { assetIds = new[] { c.Id, a.Id, b.Id } })
		);
		reorder.StatusCode.Should().Be(HttpStatusCode.OK);
		var reordered = await reorder.Content.ReadFromJsonAsync<ReorderedDto>();
		Assert.NotNull(reordered);
		reordered.Images.Select(image => image.Id)
			.Should().Equal(c.Id, a.Id, b.Id);

		using var delete = await this._SendAsync(
			tenantId, token, HttpMethod.Delete, $"/posts/{postId}/segments/{segment.Id}/images/{a.Id}"
		);
		delete.StatusCode.Should().Be(HttpStatusCode.OK);

		var remaining = (await this._GetAsync(tenantId, token, postId)).Segments[0].Images;
		remaining.Select(image => image.Id).Should().Equal(c.Id, b.Id);
		remaining.Select(image => image.Position).Should().Equal(0, 1);
		(await this._ReferenceCountAsync(a.Path)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldKeepAnImageWithItsTextWhenSegmentsAreReorderedByIdAndRemovedOnesReleaseTheirImages() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three", "four");
		var segments = (await this._GetAsync(tenantId, token, postId)).Segments;
		var onTwo = await this._AttachAsync(tenantId, token, postId, segments[0].Id, 10);
		var onThree = await this._AttachAsync(tenantId, token, postId, segments[1].Id, 20);
		var onFour = await this._AttachAsync(tenantId, token, postId, segments[2].Id, 30);

		// "four" moves first, "three" is removed, a new segment lands at the end.
		using var patch = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}",
			JsonContent.Create(new {
				segments = new List<string> { "four", "two", "brand new" },
				segmentIds = new Guid?[] { segments[2].Id, segments[0].Id, null },
			})
		);
		patch.StatusCode.Should().Be(HttpStatusCode.OK);

		var after = (await this._GetAsync(tenantId, token, postId)).Segments;
		after.Select(segment => (segment.Number, segment.Body)).Should().Equal((2, "four"), (3, "two"), (4, "brand new"));
		after[0].Id.Should().Be(segments[2].Id);
		after[0].Images.Select(image => image.Id).Should().Equal(onFour.Id);
		after[1].Id.Should().Be(segments[0].Id);
		after[1].Images.Select(image => image.Id).Should().Equal(onTwo.Id);
		after[2].Images.Should().BeEmpty();
		(await this._ReferenceCountAsync(onThree.Path)).Should().Be(0, "the removed segment's image is released");
		(await this._LiveSegmentImageCountAsync(postId)).Should().Be(2);
	}

	[Fact]
	public async Task ItShouldRefuseAnUnknownSegmentIdOnUpdateAndChangeNothing() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two");

		using var patch = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}",
			JsonContent.Create(new { segments = new List<string> { "changed" }, segmentIds = new Guid?[] { Guid.NewGuid() } })
		);

		patch.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await PostSegmentImagesSpec._ProblemAsync(patch)).GetProperty("translationKey").GetString().Should().Be("post-segment-not-found");
		(await this._GetAsync(tenantId, token, postId)).Segments[0].Body.Should().Be("two");
	}

	[Fact]
	public async Task ItShouldReleaseTheImagesOfSegmentsDroppedByAPlainReplacementOfTheFollowUps() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three");
		var segments = (await this._GetAsync(tenantId, token, postId)).Segments;
		var kept = await this._AttachAsync(tenantId, token, postId, segments[0].Id, 10);
		var dropped = await this._AttachAsync(tenantId, token, postId, segments[1].Id, 20);

		using var patch = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}",
			JsonContent.Create(new { segments = new List<string> { "two edited" } })
		);

		patch.StatusCode.Should().Be(HttpStatusCode.OK);
		var after = (await this._GetAsync(tenantId, token, postId)).Segments;
		after.Should().ContainSingle().Which.Images.Select(image => image.Id).Should().Equal(kept.Id);
		(await this._ReferenceCountAsync(dropped.Path)).Should().Be(0);
		(await this._LiveSegmentImageCountAsync(postId)).Should().Be(1, "the dropped segment's image row is deleted too");
	}

	[Fact]
	public async Task ItShouldKeepPublishedSegmentsImagesReadOnly() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three");
		var segments = (await this._GetAsync(tenantId, token, postId)).Segments;
		var onTwo = await this._AttachAsync(tenantId, token, postId, segments[0].Id, 10);
		await this._SeedPublishedSegmentsAsync(tenantId, postId, count: 2);

		using var attach = await this._SendAsync(
			tenantId, token, HttpMethod.Post, $"/posts/{postId}/segments/{segments[0].Id}/images", PostSegmentImagesSpec._File(40)
		);
		using var detach = await this._SendAsync(
			tenantId, token, HttpMethod.Delete, $"/posts/{postId}/segments/{segments[0].Id}/images/{onTwo.Id}"
		);

		attach.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await PostSegmentImagesSpec._ProblemAsync(attach)).GetProperty("translationKey").GetString().Should().Be("post-segments-locked");
		detach.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		await this._AttachAsync(tenantId, token, postId, segments[1].Id, 50);
	}

	[Fact]
	public async Task ItShouldHideUnknownSegmentsAndForeignTenantPosts() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two");
		var segment = (await this._GetAsync(tenantId, token, postId)).Segments[0];

		using var unknown = await this._SendAsync(
			tenantId, token, HttpMethod.Post, $"/posts/{postId}/segments/{Guid.NewGuid()}/images", PostSegmentImagesSpec._File(10)
		);
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var otherTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.TechStartName
		);
		var otherToken = await this._AuthClient.LoginAsync(
			TestConstants.TechStartAdminEmail, TestConstants.SeedPassword
		);
		using var foreign = await this._SendAsync(
			otherTenantId, otherToken, HttpMethod.Post, $"/posts/{postId}/segments/{segment.Id}/images", PostSegmentImagesSpec._File(10)
		);

		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
		foreign.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldFlagABlankFollowUpWithItsSegmentNumberInsteadOfDroppingItOnCreate() {
		var (tenantId, token) = await this._LoginAsync();

		using var response = await this._SendAsync(
			tenantId, token, HttpMethod.Post, "/posts",
			JsonContent.Create(new { body = "one", segments = new List<string> { "two", "  ", "four" } })
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await PostSegmentImagesSpec._ProblemAsync(response);
		problem.GetProperty("translationKey").GetString().Should().Be("post-segment-blank");
		problem.GetProperty("segmentNumber").GetInt32().Should().Be(3, "numbering counts the first segment and never shifts");
		problem.GetProperty("detail").GetString().Should().Contain("Segment 3");
	}

	[Fact]
	public async Task ItShouldFlagABlankFollowUpOnUpdateAndLeaveTheStoredThreadUntouched() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateThreadAsync(tenantId, token, "two", "three");

		using var response = await this._SendAsync(
			tenantId, token, HttpMethod.Patch, $"/posts/{postId}",
			JsonContent.Create(new { segments = new List<string> { "two", "" } })
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await PostSegmentImagesSpec._ProblemAsync(response);
		problem.GetProperty("translationKey").GetString().Should().Be("post-segment-blank");
		problem.GetProperty("segmentNumber").GetInt32().Should().Be(3);
		(await this._GetAsync(tenantId, token, postId)).Segments.Select(segment => segment.Body)
			.Should().Equal("two", "three");
	}

	private async Task<int> _ReferenceCountAsync(string relativePath) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await (
			from asset in db.UploadAsset.AsNoTracking()
			where asset.RelativePath == relativePath && !asset.IsDeleted
			select asset.ReferenceCount
		).SingleAsync();
	}

	private async Task<int> _LiveSegmentImageCountAsync(Guid postId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.PostSegmentMediaAsset.CountAsync(
			asset => asset.PostId == postId && !asset.IsDeleted
		);
	}

	private async Task _SeedPublishedSegmentsAsync(Guid tenantId, Guid postId, int count) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@segment-images.spec",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		var publication = new Publication {
			TenantId = tenantId,
			PostId = postId,
			SocialAccountId = account.GetRequiredId(),
			ScheduledAtUtc = DateTime.UtcNow,
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = Guid.NewGuid().ToString("N"),
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		for (var position = 0; position < count; position++) {
			db.PublicationSegmentResult.Add(new PublicationSegmentResult {
				TenantId = tenantId,
				PublicationId = publication.GetRequiredId(),
				SegmentPosition = position,
				ExternalRecordId = $"at://did:plc:x/app.bsky.feed.post/r{position}",
				ExternalCid = $"cid-{position}",
				ExternalUrl = $"https://bsky.app/r{position}",
			});
		}

		await db.SaveChangesAsync();
	}
}
