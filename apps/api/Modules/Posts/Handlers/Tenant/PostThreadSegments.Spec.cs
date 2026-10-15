using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Posts.Validation;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

// Thread posts (#2171): follow-up segments on create / patch / get, the 25-segment
// cap and the read-only rule for already-published segments.
public sealed class PostThreadSegmentsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PostThreadSegmentsSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
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

	private async Task<HttpResponseMessage> _SendAsync(
		HttpMethod method,
		string url,
		Guid tenantId,
		string token,
		object? content = null
	) {
		using var request = new HttpRequestMessage(method, url)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		if (content is not null) {
			request.Content = JsonContent.Create(content);
		}

		return await this._Http.SendAsync(request);
	}

	private async Task<PostDetail> _GetAsync(Guid tenantId, string token, Guid postId) {
		using var response = await this._SendAsync(
			HttpMethod.Get, PathUtils.Join("/posts", postId.ToString()), tenantId, token
		);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var detail = await response.Content.ReadFromJsonAsync<PostDetail>();
		Assert.NotNull(detail);
		return detail;
	}

	private async Task<Guid> _CreateAsync(Guid tenantId, string token, object content) {
		using var response = await this._SendAsync(HttpMethod.Post, "/posts", tenantId, token, content);
		response.StatusCode.Should().Be(HttpStatusCode.Created);
		var created = await response.Content.ReadFromJsonAsync<PostCreated>();
		Assert.NotNull(created);
		return created.Id;
	}

	[Fact]
	public async Task ItShouldCreateAThreadAndReturnItsSegmentsInOrder() {
		var (tenantId, token) = await this._LoginAsync();

		var postId = await this._CreateAsync(tenantId, token, new {
			body = "one",
			segments = new List<string> { "two", "three" },
		});

		var detail = await this._GetAsync(tenantId, token, postId);
		detail.Body.Should().Be("one");
		detail.Segments.Select(segment => (segment.Number, segment.Body))
			.Should().Equal((2, "two"), (3, "three"));
		detail.PublishedSegmentCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldKeepASinglePostWithoutSegments() {
		var (tenantId, token) = await this._LoginAsync();

		var postId = await this._CreateAsync(tenantId, token, new { body = "alone" });

		var detail = await this._GetAsync(tenantId, token, postId);
		detail.Segments.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldReplaceReorderAndRemoveFollowUpsOnPatch() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateAsync(tenantId, token, new {
			body = "one",
			segments = new List<string> { "two", "three", "four" },
		});
		var url = PathUtils.Join("/posts", postId.ToString());

		using (var reorder = await this._SendAsync(
			new HttpMethod("PATCH"), url, tenantId, token, new { segments = new List<string> { "four", "two" } }
		)) {
			reorder.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		(await this._GetAsync(tenantId, token, postId)).Segments.Select(segment => segment.Body)
			.Should().Equal("four", "two");

		using (var clear = await this._SendAsync(
			new HttpMethod("PATCH"), url, tenantId, token, new { segments = new List<string>() }
		)) {
			clear.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		(await this._GetAsync(tenantId, token, postId)).Segments.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldRefuseMoreThanTwentyFiveSegmentsOnCreateAndPatch() {
		var (tenantId, token) = await this._LoginAsync();
		var tooMany = Enumerable.Range(1, PostValidationRules.MaxFollowUpSegments + 1)
			.Select(index => $"segment {index}")
			.ToArray();

		using var create = await this._SendAsync(
			HttpMethod.Post, "/posts", tenantId, token, new { body = "one", segments = tooMany }
		);
		create.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var postId = await this._CreateAsync(tenantId, token, new { body = "one" });
		using var patch = await this._SendAsync(
			new HttpMethod("PATCH"),
			PathUtils.Join("/posts", postId.ToString()),
			tenantId,
			token,
			new { segments = tooMany }
		);
		patch.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var allowed = Enumerable.Range(1, PostValidationRules.MaxFollowUpSegments)
			.Select(index => $"segment {index}")
			.ToArray();
		var okId = await this._CreateAsync(tenantId, token, new { body = "one", segments = allowed });
		(await this._GetAsync(tenantId, token, okId)).Segments.Should().HaveCount(24);
	}

	[Fact]
	public async Task ItShouldRefuseEmptyFollowUpSegments() {
		var (tenantId, token) = await this._LoginAsync();

		using var response = await this._SendAsync(
			HttpMethod.Post, "/posts", tenantId, token, new { body = "one", segments = new List<string> { "  " } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldKeepPublishedSegmentsReadOnlyAndLetTheRestChange() {
		var (tenantId, token) = await this._LoginAsync();
		var postId = await this._CreateAsync(tenantId, token, new {
			body = "one",
			segments = new List<string> { "two", "three" },
		});
		await this._SeedPublishedSegmentsAsync(tenantId, postId, count: 2);
		var url = PathUtils.Join("/posts", postId.ToString());

		(await this._GetAsync(tenantId, token, postId)).PublishedSegmentCount.Should().Be(2);

		using (var editPublished = await this._SendAsync(
			new HttpMethod("PATCH"), url, tenantId, token, new { segments = new List<string> { "changed", "three" } }
		)) {
			editPublished.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		}

		using (var dropPublished = await this._SendAsync(
			new HttpMethod("PATCH"), url, tenantId, token, new { segments = new List<string>() }
		)) {
			dropPublished.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		}

		using (var editRoot = await this._SendAsync(
			new HttpMethod("PATCH"), url, tenantId, token, new { body = "rewritten" }
		)) {
			editRoot.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		}

		using (var editUnpublished = await this._SendAsync(
			new HttpMethod("PATCH"), url, tenantId, token, new { segments = new List<string> { "two", "three edited" } }
		)) {
			editUnpublished.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		(await this._GetAsync(tenantId, token, postId)).Segments.Select(segment => segment.Body)
			.Should().Equal("two", "three edited");
	}

	private async Task _SeedPublishedSegmentsAsync(Guid tenantId, Guid postId, int count) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@thread.spec",
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
