using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Posts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Behaviour-pinning specs for the shared cursor-pagination contract of
/// <c>PostService.FindForTenantAsync</c> (#220 refactor safety net):
/// a cursor pointing at a deleted/missing post stays a transparent 400,
/// an unknown <c>sort_id</c> stays a 400, uppercase <c>sort_id</c>
/// values stay case-insensitive, and a full multi-page walk sees every
/// row exactly once (the contract that matters for a keyset cursor).
/// </summary>
public sealed class FindPostsCursorBehaviorSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindPostsCursorBehaviorSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var userId = await GetAcmeAdminUserIdAsync();

		// 3 posts with distinct CreatedAt; the walk must visit each once in
		// ascending CreatedAt order with no gap or duplicate.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		for (var i = 0; i < 3; i++) {
			seededIds.Add(await SeedPostAtAsync(
				tenantId,
				userId,
				$"post-walk-{i}-{Guid.NewGuid():N}",
				baseDate.AddDays(i)
			));
		}

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = PostsUrl
				+ "?limit=1&sort_id=created_at&sort_order=asc";
			if (cursor is not null) {
				url += $"&cursor={Uri.EscapeDataString(cursor)}";
			}

			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindPostsResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(post => post.Id));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the tie-breaker/cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers the whole list: no row may repeat and ours must
		// all be visited exactly once, in CreatedAt ascending order.
		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedSeededOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		visitedSeededOrder.Should().Equal(seededIds);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsUrl + $"?cursor={Guid.NewGuid()}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenSortIdIsInvalid() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsUrl + "?sort_id=not_real"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldAcceptAnUppercaseSortId() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsUrl + "?limit=5&sort_id=CREATED_AT"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private static string PostsUrl {
		get {
			return "/posts";
		}
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> GetAcmeAdminUserIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.Where(u => u.Email == TestConstants.AcmeAdminEmail)
			.FirstAsync();
		return user.GetRequiredId();
	}

	private async Task<Guid> SeedPostAtAsync(
		Guid tenantId,
		Guid userId,
		string body,
		DateTime createdAt
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var post = new Post {
			TenantId = tenantId,
			Body = body,
			Status = PostStatus.Draft,
			CreatedByUserId = userId,
		};
		post.CreatedAt = createdAt;

		await dbContext.Post.AddAsync(post);
		await dbContext.SaveChangesAsync();

		return post.GetRequiredId();
	}

	private sealed record FindPostsResponse {
		public List<PostItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record PostItem {
		public Guid Id { get; init; }
		public DateTime CreatedAt { get; init; }
	}
}
