using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// HTTP-level integration spec for the one-source-many-destinations surface (#2172):
// multi-destination schedule, publish-now destinations, and
// GET/PUT/DELETE /posts/publications/{id}/rendition. Real ephemeral Postgres; the
// publish provider is never reached (scheduling and rendition edits stop at the DB).
public sealed class PublicationRenditionSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PublicationRenditionSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private const string _InstantA = "2099-08-26T07:00:00Z";
	private const string _InstantB = "2099-08-27T15:30:00Z";

	[Fact]
	public async Task ItShouldScheduleOnePostToTwoAccountsWithDifferentTimesInOneRequest() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token, "one idea, two destinations");
		var accountA = await this._SeedAccountAsync(tenantId);
		var accountB = await this._SeedAccountAsync(tenantId);

		using var response = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/schedule", token, tenantId, new {
			timeZone = "Europe/Paris",
			// A has no scheduledAt of its own: it takes this "same time for all" default.
			scheduledAtLocal = PublicationRenditionSpec._InstantA,
			destinations = new object[] {
				new { socialAccountId = accountA },
				new { socialAccountId = accountB, scheduledAt = PublicationRenditionSpec._InstantB },
			},
		});

		response.StatusCode.Should().Be(HttpStatusCode.Created);
		var publications = await this._PublicationsOfAsync(Guid.Parse(postId));
		publications.Should().HaveCount(2);
		publications.Single(p => p.SocialAccountId == accountA).ScheduledAtUtc
			.Should().Be(new DateTime(2099, 8, 26, 7, 0, 0, DateTimeKind.Utc));
		publications.Single(p => p.SocialAccountId == accountB).ScheduledAtUtc
			.Should().Be(new DateTime(2099, 8, 27, 15, 30, 0, DateTimeKind.Utc));
		publications.Should().OnlyContain(p => p.Status == PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldStoreAnOverrideSentWithADestinationAndLeaveTheOtherDestinationUntouched() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token, "shared text");
		var accountA = await this._SeedAccountAsync(tenantId);
		var accountB = await this._SeedAccountAsync(tenantId);

		using var response = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/schedule", token, tenantId, new {
			timeZone = "Etc/UTC",
			scheduledAtLocal = PublicationRenditionSpec._InstantA,
			destinations = new object[] {
				new { socialAccountId = accountA },
				new {
					socialAccountId = accountB,
					overrides = new { segments = new[] { new { position = 0, text = "text for B" } } },
				},
			},
		});

		response.StatusCode.Should().Be(HttpStatusCode.Created);
		var publications = await this._PublicationsOfAsync(Guid.Parse(postId));
		var renditions = await this._RenditionsAsync(publications.Select(p => p.GetRequiredId()).ToList());
		renditions.Should().ContainSingle().Which.PublicationId
			.Should().Be(publications.Single(p => p.SocialAccountId == accountB).GetRequiredId());
	}

	[Fact]
	public async Task ItShouldRejectAnOverLimitOverrideNamingTheDestinationAndCreateNothing() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token, "short shared text");
		var accountA = await this._SeedAccountAsync(tenantId);
		var accountB = await this._SeedAccountAsync(tenantId);

		using var response = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/schedule", token, tenantId, new {
			timeZone = "Etc/UTC",
			scheduledAtLocal = PublicationRenditionSpec._InstantA,
			destinations = new object[] {
				new { socialAccountId = accountA },
				new {
					socialAccountId = accountB,
					overrides = new { segments = new[] { new { position = 0, text = new string('y', 301) } } },
				},
			},
		});

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
		problem.RootElement.GetProperty("translationKey").GetString().Should().Be("publish-content-too-long");
		problem.RootElement.GetProperty("socialAccountId").GetGuid().Should().Be(accountB);
		var handleB = await this._HandleOfAsync(accountB);
		problem.RootElement.GetProperty("destination").GetString().Should().Be(handleB);
		problem.RootElement.GetProperty("detail").GetString().Should().StartWith(handleB + ":");
		(await this._PublicationsOfAsync(Guid.Parse(postId))).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldRejectAnOverrideForASegmentThePostDoesNotHave() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token, "single segment");
		var account = await this._SeedAccountAsync(tenantId);

		using var response = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/schedule", token, tenantId, new {
			timeZone = "Etc/UTC",
			scheduledAtLocal = PublicationRenditionSpec._InstantA,
			destinations = new object[] {
				new {
					socialAccountId = account,
					overrides = new { segments = new[] { new { position = 1, text = "a second segment" } } },
				},
			},
		});

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
		problem.RootElement.GetProperty("translationKey").GetString().Should().Be("publish-rendition-invalid");
		problem.RootElement.GetProperty("reason").GetString().Should().Be("SegmentOutOfRange");
		problem.RootElement.GetProperty("segmentNumber").GetInt32().Should().Be(2);
		(await this._PublicationsOfAsync(Guid.Parse(postId))).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldRejectABodyThatMixesAccountIdsAndDestinations() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var account = await this._SeedAccountAsync(tenantId);

		using var response = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/schedule", token, tenantId, new {
			timeZone = "Etc/UTC",
			scheduledAtLocal = PublicationRenditionSpec._InstantA,
			accountIds = new[] { account },
			destinations = new object[] { new { socialAccountId = account } },
		});

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldSetReadAndResetTheOverridesOfAScheduledPublication() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedPublicationAsync(tenantId, PublicationStatus.Scheduled, "shared text");
		var url = $"/posts/publications/{seeded.PublicationId}/rendition";

		using var put = await this._SendAsync(HttpMethod.Put, url, token, tenantId, new {
			segments = new[] { new { position = 0, text = "text for this destination" } },
		});
		put.StatusCode.Should().Be(HttpStatusCode.OK);
		using var putBody = JsonDocument.Parse(await put.Content.ReadAsStringAsync());
		putBody.RootElement.GetProperty("customized").GetBoolean().Should().BeTrue();
		putBody.RootElement.GetProperty("effective").GetProperty("texts")[0].GetString()
			.Should().Be("text for this destination");
		(await this._RenditionsAsync([seeded.PublicationId])).Should().ContainSingle();

		using var get = await this._SendAsync(HttpMethod.Get, url, token, tenantId, null);
		get.StatusCode.Should().Be(HttpStatusCode.OK);

		using var delete = await this._SendAsync(HttpMethod.Delete, url, token, tenantId, null);
		delete.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._RenditionsAsync([seeded.PublicationId])).Should().BeEmpty("reset removes the row");

		using var after = await this._SendAsync(HttpMethod.Get, url, token, tenantId, null);
		using var afterBody = JsonDocument.Parse(await after.Content.ReadAsStringAsync());
		afterBody.RootElement.GetProperty("customized").GetBoolean().Should().BeFalse();
		afterBody.RootElement.GetProperty("effective").GetProperty("texts")[0].GetString().Should().Be("shared text");

		using var again = await this._SendAsync(HttpMethod.Delete, url, token, tenantId, null);
		again.StatusCode.Should().Be(HttpStatusCode.OK, "resetting an uncustomized destination is idempotent");
	}

	[Fact]
	public async Task ItShouldRejectAnOverLimitOverrideOnAnExistingPublicationNamingItsAccount() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedPublicationAsync(tenantId, PublicationStatus.Scheduled, "shared text");

		using var put = await this._SendAsync(
			HttpMethod.Put,
			$"/posts/publications/{seeded.PublicationId}/rendition",
			token,
			tenantId,
			new { segments = new[] { new { position = 0, text = new string('z', 301) } } }
		);

		put.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var problem = JsonDocument.Parse(await put.Content.ReadAsStringAsync());
		problem.RootElement.GetProperty("translationKey").GetString().Should().Be("publish-content-too-long");
		problem.RootElement.GetProperty("socialAccountId").GetGuid().Should().Be(seeded.SocialAccountId);
		(await this._RenditionsAsync([seeded.PublicationId])).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldRefuseAResetWhenTheSharedContentNoLongerFitsTheDestination() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedPublicationAsync(
			tenantId, PublicationStatus.Scheduled, new string('s', 450)
		);
		var url = $"/posts/publications/{seeded.PublicationId}/rendition";
		using var put = await this._SendAsync(HttpMethod.Put, url, token, tenantId, new {
			segments = new[] { new { position = 0, text = "short enough for Bluesky" } },
		});
		put.StatusCode.Should().Be(HttpStatusCode.OK);

		using var delete = await this._SendAsync(HttpMethod.Delete, url, token, tenantId, null);

		delete.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await this._RenditionsAsync([seeded.PublicationId])).Should().ContainSingle("the reset was refused");
	}

	[Fact]
	public async Task ItShouldRejectAnotherTenantsAssetIdInTheMediaOverride() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var foreignAssetId = await this._SeedForeignAssetAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var account = await this._SeedAccountAsync(tenantId);

		using var response = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/schedule", token, tenantId, new {
			timeZone = "Etc/UTC",
			scheduledAtLocal = PublicationRenditionSpec._InstantA,
			destinations = new object[] {
				new {
					socialAccountId = account,
					overrides = new { media = new { assetIds = new[] { foreignAssetId } } },
				},
			},
		});

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await this._PublicationsOfAsync(Guid.Parse(postId))).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldCapPublishNowDestinationsAtTwenty() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		using var response = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/publish-now", token, tenantId, new {
			destinations = Enumerable.Range(0, 21)
				.Select(_ => new { socialAccountId = Guid.NewGuid() })
				.ToArray(),
		});

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[InlineData(PublicationStatus.Published, "publication-rendition-locked")]
	[InlineData(PublicationStatus.InProgress, "publication-schedule-in-progress")]
	public async Task ItShouldRefuseToCustomizeAPublicationThatIsPublishedOrBeingPublished(
		PublicationStatus status,
		string expectedKey
	) {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedPublicationAsync(tenantId, status, "shared text");
		var url = $"/posts/publications/{seeded.PublicationId}/rendition";

		using var put = await this._SendAsync(HttpMethod.Put, url, token, tenantId, new {
			segments = new[] { new { position = 0, text = "too late" } },
		});
		using var delete = await this._SendAsync(HttpMethod.Delete, url, token, tenantId, null);

		put.StatusCode.Should().Be(HttpStatusCode.Conflict);
		delete.StatusCode.Should().Be(HttpStatusCode.Conflict);
		using var problem = JsonDocument.Parse(await put.Content.ReadAsStringAsync());
		problem.RootElement.GetProperty("translationKey").GetString().Should().Be(expectedKey);
		(await this._RenditionsAsync([seeded.PublicationId])).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldLockTheOverridesOfSegmentsThePublicationAlreadyPublished() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedPublicationAsync(tenantId, PublicationStatus.Failed, "root", "two", "three");
		await this._AddSegmentResultAsync(tenantId, seeded.PublicationId, 0);
		var url = $"/posts/publications/{seeded.PublicationId}/rendition";

		// The root segment is already on the provider: its text can no longer differ.
		using var locked = await this._SendAsync(HttpMethod.Put, url, token, tenantId, new {
			segments = new[] { new { position = 0, text = "rewritten root" } },
		});
		// Later segments are still ours to customize, never to add or drop.
		using var allowed = await this._SendAsync(HttpMethod.Put, url, token, tenantId, new {
			segments = new[] { new { position = 1, text = "two for this destination" } },
		});
		using var beyond = await this._SendAsync(HttpMethod.Put, url, token, tenantId, new {
			segments = new[] { new { position = 3, text = "a fourth segment" } },
		});

		locked.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var lockedProblem = JsonDocument.Parse(await locked.Content.ReadAsStringAsync());
		lockedProblem.RootElement.GetProperty("translationKey").GetString().Should().Be("post-segments-locked");
		allowed.StatusCode.Should().Be(HttpStatusCode.OK);
		beyond.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var beyondProblem = JsonDocument.Parse(await beyond.Content.ReadAsStringAsync());
		beyondProblem.RootElement.GetProperty("reason").GetString().Should().Be("SegmentOutOfRange");

		// Resetting only drops overrides on segments that are not published yet.
		using var reset = await this._SendAsync(HttpMethod.Delete, url, token, tenantId, null);
		reset.StatusCode.Should().Be(HttpStatusCode.OK, "only unpublished segments carried overrides");
	}

	[Fact]
	public async Task ItShouldReturn404ForAnotherTenantsPublicationOnEveryRenditionRoute() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var foreign = await this._SeedForeignPublicationAsync();
		var url = $"/posts/publications/{foreign}/rendition";

		using var get = await this._SendAsync(HttpMethod.Get, url, token, tenantId, null);
		using var put = await this._SendAsync(HttpMethod.Put, url, token, tenantId, new {
			segments = new[] { new { position = 0, text = "not yours" } },
		});
		using var delete = await this._SendAsync(HttpMethod.Delete, url, token, tenantId, null);

		get.StatusCode.Should().Be(HttpStatusCode.NotFound);
		put.StatusCode.Should().Be(HttpStatusCode.NotFound);
		delete.StatusCode.Should().Be(HttpStatusCode.NotFound);
		(await this._RenditionsAsync([foreign])).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldPreviewTheOverrideAndFlagTheDestinationAsCustomizedInTheScheduledList() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token, "shared preview text");
		var accountA = await this._SeedAccountAsync(tenantId);
		var accountB = await this._SeedAccountAsync(tenantId);
		using var schedule = await this._SendAsync(HttpMethod.Post, $"/posts/{postId}/schedule", token, tenantId, new {
			timeZone = "Etc/UTC",
			scheduledAtLocal = PublicationRenditionSpec._InstantA,
			destinations = new object[] {
				new { socialAccountId = accountA },
				new {
					socialAccountId = accountB,
					overrides = new { segments = new[] { new { position = 0, text = "preview for B" } } },
				},
			},
		});
		schedule.StatusCode.Should().Be(HttpStatusCode.Created);

		using var list = await this._SendAsync(
			HttpMethod.Get,
			"/posts/publications?from=2099-08-01T00%3A00%3A00Z&to=2099-08-30T00%3A00%3A00Z",
			token,
			tenantId,
			null
		);

		list.StatusCode.Should().Be(HttpStatusCode.OK);
		using var body = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
		var items = body.RootElement.GetProperty("data").EnumerateArray()
			.Where(item => item.GetProperty("postId").GetGuid() == Guid.Parse(postId))
			.ToList();
		var itemB = items.Single(item => item.GetProperty("socialAccountId").GetGuid() == accountB);
		var itemA = items.Single(item => item.GetProperty("socialAccountId").GetGuid() == accountA);
		itemB.GetProperty("postBodyPreview").GetString().Should().Be("preview for B");
		itemB.GetProperty("customized").GetBoolean().Should().BeTrue();
		itemA.GetProperty("postBodyPreview").GetString().Should().Be("shared preview text");
		itemA.GetProperty("customized").GetBoolean().Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldPublishNowToDestinationsWithAnOverrideAndNameTheOverLimitOne() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token, "publish now shared");
		var accountA = await this._SeedAccountAsync(tenantId);
		var accountB = await this._SeedAccountAsync(tenantId);
		var url = $"/posts/{postId}/publish-now";

		using var tooLong = await this._SendAsync(HttpMethod.Post, url, token, tenantId, new {
			destinations = new object[] {
				new { socialAccountId = accountA },
				new {
					socialAccountId = accountB,
					overrides = new { segments = new[] { new { position = 0, text = new string('q', 301) } } },
				},
			},
		});
		tooLong.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var problem = JsonDocument.Parse(await tooLong.Content.ReadAsStringAsync());
		problem.RootElement.GetProperty("socialAccountId").GetGuid().Should().Be(accountB);
		(await this._PublicationsOfAsync(Guid.Parse(postId))).Should().BeEmpty();

		using var ok = await this._SendAsync(HttpMethod.Post, url, token, tenantId, new {
			destinations = new object[] {
				new { socialAccountId = accountA },
				new {
					socialAccountId = accountB,
					overrides = new { segments = new[] { new { position = 0, text = "now, for B" } } },
				},
			},
		});
		ok.StatusCode.Should().Be(HttpStatusCode.OK);
		var publications = await this._PublicationsOfAsync(Guid.Parse(postId));
		publications.Should().HaveCount(2);
		var renditions = await this._RenditionsAsync(publications.Select(p => p.GetRequiredId()).ToList());
		renditions.Should().ContainSingle().Which.PublicationId
			.Should().Be(publications.Single(p => p.SocialAccountId == accountB).GetRequiredId());
	}

	// --- helpers ------------------------------------------------------------------

	private async Task<HttpResponseMessage> _SendAsync(
		HttpMethod method,
		string url,
		string token,
		Guid tenantId,
		object? body
	) {
		using var request = new HttpRequestMessage(method, url)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		if (body is not null) {
			request.Content = JsonContent.Create(body);
		}

		return await this._Http.SendAsync(request);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<string> _CreatePostAsync(Guid tenantId, string token, string? body = null) {
		using var response = await this._SendAsync(
			HttpMethod.Post, "/posts", token, tenantId,
			new { body = body ?? ("rendition spec " + Guid.NewGuid().ToString("N")[..8]) }
		);
		response.EnsureSuccessStatusCode();
		using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
		return json.RootElement.GetProperty("id").GetGuid().ToString();
	}

	private async Task<Guid> _SeedAccountAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@rend." + Guid.NewGuid().ToString("N")[..6] + ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
			Status = SocialAccountStatus.Active,
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private async Task<string> _HandleOfAsync(Guid accountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.SocialAccount
			.Where(account => account.Id == accountId)
			.Select(account => account.DisplayHandle)
			.SingleAsync();
	}

	private async Task<List<Publication>> _PublicationsOfAsync(Guid postId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.Publication.AsNoTracking()
			.Where(publication => publication.PostId == postId && !publication.IsDeleted)
			.ToListAsync();
	}

	private async Task<List<Rendition>> _RenditionsAsync(IReadOnlyCollection<Guid> publicationIds) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.Rendition.AsNoTracking()
			.Where(rendition => publicationIds.Contains(rendition.PublicationId))
			.ToListAsync();
	}

	private sealed record SeededPublication(Guid PublicationId, Guid SocialAccountId);

	private async Task<SeededPublication> _SeedPublicationAsync(
		Guid tenantId,
		PublicationStatus status,
		string body,
		params string[] followUps
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var userId = await db.User
			.Where(user => user.Email == TestConstants.AcmeAdminEmail)
			.Select(user => user.GetRequiredId())
			.SingleAsync();
		var post = new Post { TenantId = tenantId, Body = body, CreatedByUserId = userId };
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@rend-seed." + Guid.NewGuid().ToString("N")[..6] + ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		for (var index = 0; index < followUps.Length; index++) {
			db.PostSegment.Add(new PostSegment {
				TenantId = tenantId,
				PostId = post.GetRequiredId(),
				Position = index + 1,
				Body = followUps[index],
			});
		}

		var id = Guid.CreateVersion7();
		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = status,
			FailureCategory = status == PublicationStatus.Failed ? PublicationFailureCategory.RetryLater : null,
			LastError = status == PublicationStatus.Failed ? "the provider did not answer" : null,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(2),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = PublicationIdempotencyKey.For(id),
		};
		publication.Id = id;
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return new SeededPublication(id, account.GetRequiredId());
	}

	private async Task _AddSegmentResultAsync(Guid tenantId, Guid publicationId, int position) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		db.PublicationSegmentResult.Add(new PublicationSegmentResult {
			TenantId = tenantId,
			PublicationId = publicationId,
			SegmentPosition = position,
			ExternalRecordId = $"at://r/{position}",
			ExternalCid = $"cid-{position}",
			ExternalUrl = $"https://u/{position}",
		});
		await db.SaveChangesAsync();
	}

	private async Task<Guid> _SeedForeignAssetAsync() {
		var publicationId = await this._SeedForeignPublicationAsync();
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publication = await db.Publication.IgnoreQueryFilters().SingleAsync(p => p.Id == publicationId);
		var asset = new PostMediaAsset {
			TenantId = publication.TenantId,
			PostId = publication.PostId,
			RelativePath = "foreign/asset.png",
			ContentType = "image/png",
			UploadedByUserId = await db.Post.IgnoreQueryFilters()
				.Where(post => post.Id == publication.PostId)
				.Select(post => post.CreatedByUserId)
				.SingleAsync(),
		};
		db.PostMediaAsset.Add(asset);
		await db.SaveChangesAsync();
		return asset.GetRequiredId();
	}

	private async Task<Guid> _SeedForeignPublicationAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var techId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.TechStartName
		);
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var userId = await db.User
			.Where(user => user.Email == TestConstants.TechStartAdminEmail)
			.Select(user => user.GetRequiredId())
			.SingleAsync();
		var post = new Post { TenantId = techId, Body = "foreign post", CreatedByUserId = userId };
		var account = new SocialAccount {
			TenantId = techId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@rend-foreign.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		var id = Guid.CreateVersion7();
		var publication = new Publication {
			TenantId = techId,
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = PublicationStatus.Scheduled,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(2),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = PublicationIdempotencyKey.For(id),
		};
		publication.Id = id;
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return id;
	}
}
