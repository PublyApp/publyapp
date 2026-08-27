using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Profiles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

/// <summary>
/// Cursor-pagination contract specs for the tenant profiles list
/// (<c>TenantProfileQueryAsStaffService.FindTenantProfilesAsync</c>, #220
/// refactor safety net). The list previously had no pagination coverage at
/// all; these anchor the multi-page walk on a non-default sort field with
/// its Id tie-breaker, the transparent cursor-not-found 400, and the
/// case-insensitive <c>sort_id</c> resolution.
/// </summary>
public sealed class FindTenantProfilesCursorBehaviorSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantProfilesCursorBehaviorSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldWalkEveryPageOnANameSortWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		// Deterministic, anti-correlated names: insertion order is c,b,a while
		// the lexical (sort) order is a,b,c. The walk must return them in
		// lexical order, so a keySelector swap to the id (insertion) order
		// turns this assertion RED.
		const int total = 3;
		var seededIds = new List<Guid>();
		var seededNames = new List<string>();
		for (var i = 0; i < total; i++) {
			var name = $"Walk Page {(char)('a' + (2 - i))} {Guid.NewGuid():N}";
			seededIds.Add(await SeedTenantProfileWithNameAsync(tenantId, name));
			seededNames.Add(name);
		}
		seededNames.Sort(StringComparer.OrdinalIgnoreCase);

		var visitedIds = new List<Guid>();
		var visitedNamesById = new Dictionary<Guid, string>();
		string? cursor = null;
		var pages = 0;
		do {
			var query = "limit=1&sort_id=NAME&sort_order=asc";
			if (cursor is not null) {
				query += $"&cursor={Uri.EscapeDataString(cursor)}";
			}

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(tenantId.ToString(), query)
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			foreach (var item in page.Data) {
				visitedIds.Add(item.Id);
				visitedNamesById[item.Id] = item.Name;
			}
			cursor = page.NextCursor;

			// Guard against an infinite loop if the tie-breaker/cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers the whole list (any seeded default profile
		// included): no row may repeat and ours must all be visited.
		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		// Assert the OBSERVED Name order from the wire item matches the lexical
		// sort, not the insertion order.
		var visitedNames = visitedIds
			.Where(seededIds.Contains)
			.Select(id => visitedNamesById[id])
			.ToList();
		visitedNames.Should().Equal(seededNames);
	}

	[Fact]
	public async Task ItShouldWalkEveryIdPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		// 3 profiles with distinct Id; the walk must visit each once in
		// ascending Id order. A keySelector swap to another same-type field
		// (e.g. Name) turns this assertion RED.
		var seededIds = new List<Guid>();
		for (var i = 0; i < 3; i++) {
			var name = $"Id Walk {i} {Guid.NewGuid():N}";
			seededIds.Add(await SeedTenantProfileWithNameAsync(tenantId, name));
		}

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var query = "limit=1&sort_id=id&sort_order=asc";
			if (cursor is not null) {
				query += $"&cursor={Uri.EscapeDataString(cursor)}";
			}

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(tenantId.ToString(), query)
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			foreach (var item in page.Data) {
				visitedIds.Add(item.Id);
			}
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var expectedOrder = seededIds.OrderBy(id => id).ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		// 3 profiles with distinct, deliberately NOT insertion-ordered
		// CreatedAt (anti-correlated). The walk must visit each once in
		// ascending CreatedAt order, not insertion order, so a
		// keySelector swap to another same-type field (e.g. Name)
		// turns this assertion RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			var createdAt = baseDate.AddDays((3 - i) % 3);
			var id = await SeedTenantProfileAtAsync(tenantId, $"created-at-walk-{i}-{Guid.NewGuid():N}", createdAt);
			seededIds.Add(id);
			seededOrder.Add(createdAt);
		}

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var query = "limit=1&sort_id=created_at&sort_order=asc";
			if (cursor is not null) {
				query += $"&cursor={Uri.EscapeDataString(cursor)}";
			}

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(tenantId.ToString(), query)
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			foreach (var item in page.Data) {
				visitedIds.Add(item.Id);
			}
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var createdAtById = seededIds
			.Zip(seededOrder, (id, c) => (id, c))
			.ToDictionary(x => x.id, x => x.c);
		visitedOrder.Should().Equal(
			seededIds.OrderBy(id => createdAtById[id]).ToList()
		);
	}

	private async Task<Guid> SeedTenantProfileAtAsync(Guid tenantId, string name, DateTime createdAt) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(tenantId, name, isDefault: false);
		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		var id = profile.GetRequiredId();
		var tracked = await dbContext.Profile
			.Where(p => p.Id == id)
			.FirstAsync();
		tracked.CreatedAt = createdAt;
		await dbContext.SaveChangesAsync();

		return id;
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), $"cursor={Guid.NewGuid()}")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
	}

	private static string GetUrl(string tenantId, string query = "") {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Find
		);

		return query.Length == 0 ? url : $"{url}?{query}";
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> SeedTenantProfileWithNameAsync(Guid tenantId, string name) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(tenantId, name, isDefault: false);
		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private sealed record FindTenantProfilesResponse {
		public List<TenantProfileItemResponse> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record TenantProfileItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
	}
}
