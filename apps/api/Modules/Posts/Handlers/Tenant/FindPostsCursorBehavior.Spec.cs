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

		// 3 posts with distinct, deliberately NOT insertion-ordered CreatedAt
		// (anti-correlated with insertion). The walk must visit each once in
		// ascending CreatedAt order, not in insertion order, so a keySelector
		// swap to UpdatedAt (stamped at insertion) turns this assertion RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			var id = await SeedPostAtAsync(
				tenantId,
				userId,
				$"post-walk-{i}-{Guid.NewGuid():N}",
				baseDate.AddDays((3 - i) % 3)
			);
			seededIds.Add(id);
			seededOrder.Add(baseDate.AddDays((3 - i) % 3));
		}

		var visitedIds = new List<Guid>();
		var visitedCreatedAtOrder = new List<DateTime>();
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
			visitedCreatedAtOrder.AddRange(page.Data.Select(post => post.CreatedAt));
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
		var createdAtById = seededIds
			.Zip(seededOrder, (id, c) => (id, c))
			.ToDictionary(x => x.id, x => x.c);
		visitedSeededOrder.Should().Equal(
			seededIds.OrderBy(id => createdAtById[id]).ToList()
		);

		// Assert the OBSERVED CreatedAt order: ascending and equal to the
		// seeded-but-sorted order, NOT the insertion order.
		var visitedSeededCreatedAt = visitedSeededOrder
			.Select(id => visitedCreatedAtOrder[visitedIds.IndexOf(id)])
			.ToList();
		visitedSeededCreatedAt.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		visitedSeededCreatedAt.Should().NotEqual(seededOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var userId = await GetAcmeAdminUserIdAsync();

		// The audit interceptor stamps UpdatedAt = now on every Modified save, so the
		// only way to control it is a direct UPDATE that bypasses the interceptor.
		// 3 posts with UpdatedAt deliberately NOT correlated with insertion order
		// (anti-correlated with Id insertion). The walk must visit each once in
		// ascending UpdatedAt order; a keySelector swap to CreatedAt (stamped at
		// insertion) turns this assertion RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			var id = await SeedPostAtAsync(
				tenantId,
				userId,
				$"post-walk-up-{i}-{Guid.NewGuid():N}",
				baseDate.AddDays((3 - i) % 3)
			);
			seededIds.Add(id);
			// UpdatedAt is set AFTER insertion via a direct SQL UPDATE to bypass the
			// interceptor; the dates are deliberately anti-correlated with insertion
			// order so .NotEqual(seededOrder) holds and a keySelector swap to CreatedAt
			// (stamped at insertion, different order) turns this assertion RED.
			var updatedAt = baseDate.AddDays((i + 1) % 3);
			await OverrideUpdatedAtAsync(id, updatedAt);
			seededOrder.Add(updatedAt);
		}

		var visitedIds = new List<Guid>();
		var visitedUpdatedAtOrder = new List<DateTime>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = PostsUrl
					+ "?limit=1&sort_id=updated_at&sort_order=asc";
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
			visitedUpdatedAtOrder.AddRange(page.Data.Select(post => post.UpdatedAt));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the tie-breaker/cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers the whole list: no row may repeat and ours must
		// all be visited exactly once, in UpdatedAt ascending order.
		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedSeededOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var updatedAtById = seededIds
			.Zip(seededOrder, (id, c) => (id, c))
			.ToDictionary(x => x.id, x => x.c);
		visitedSeededOrder.Should().Equal(
			seededIds.OrderBy(id => updatedAtById[id]).ToList()
		);

		// Assert the OBSERVED UpdatedAt order: ascending and equal to the
		// seeded-but-sorted order, NOT the insertion order.
		var visitedSeededUpdatedAt = visitedSeededOrder
			.Select(id => visitedUpdatedAtOrder[visitedIds.IndexOf(id)])
			.ToList();
		visitedSeededUpdatedAt.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		visitedSeededUpdatedAt.Should().NotEqual(seededOrder);
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
		// Insert first (interceptor stamps CreatedAt/UpdatedAt = now), then
		// re-fetch and overwrite CreatedAt as a Modified row. On Modified the
		// interceptor only touches UpdatedAt, so the seeded CreatedAt sticks.
		await dbContext.Post.AddAsync(post);
		await dbContext.SaveChangesAsync();
		var id = post.GetRequiredId();

		var tracked = await dbContext.Post
			.Where(p => p.Id == id)
			.FirstAsync();
		tracked.CreatedAt = createdAt;
		await dbContext.SaveChangesAsync();

		return id;
	}

	private async Task OverrideUpdatedAtAsync(Guid postId, DateTime updatedAt) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		// Direct UPDATE bypasses the audit interceptor that would otherwise
		// stamp UpdatedAt = now on every Modified save.
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE posts SET updated_at = {0} WHERE id = {1}",
			updatedAt, postId
		);
	}

	private sealed record FindPostsResponse {
		public List<PostItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record PostItem {
		public Guid Id { get; init; }
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
