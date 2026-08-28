using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

/// <summary>
/// Behaviour-pinning specs for the shared cursor-pagination contract of
/// <c>SocialAccountService.FindForTenantAsync</c> (#220 refactor safety net):
/// a cursor pointing at a missing account stays a transparent 400, and a full
/// multi-page walk sees every row exactly once (the contract that matters for
/// a keyset cursor).
/// </summary>
public sealed class FindSocialAccountsCursorBehaviorSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindSocialAccountsCursorBehaviorSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		// 3 accounts with distinct, deliberately NOT insertion-ordered
		// CreatedAt (anti-correlated with insertion). The walk must visit each
		// once in ascending CreatedAt order, not insertion order, so a
		// keySelector swap to UpdatedAt (stamped at insertion) turns this RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			// Two rows share the same CreatedAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var id = await ConnectAsync(
				tenantId,
				token,
				$"sa-walk-{i}-{Guid.NewGuid():N}"
			);
			var createdAt = i == 1 ? baseDate.AddDays(1) : baseDate;
			await SetCreatedAtAsync(id, createdAt);
			seededIds.Add(id);
			seededOrder.Add(createdAt);
		}

			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(CreatedAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await SwapSocialAccountIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = "/social-accounts/?limit=1&sort_id=created_at&sort_order=asc";
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
				.ReadFromJsonAsync<FindSocialAccountsForTenantResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(a => a.Id));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers exactly our rows, each once, in order.
		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var createdAtById = seededIds
			.Zip(seededOrder, (id, c) => (id, c))
			.ToDictionary(x => x.id, x => x.c);
		visitedOrder.Should().Equal(
			seededIds.OrderBy(id => createdAtById[id]).ThenBy(id => id).ToList()
		);

		// Assert the OBSERVED CreatedAt order from the DB: ascending and equal
		// to the seeded-but-sorted order, NOT the insertion order. The item
		// does not expose CreatedAt, so resolve it by Id on SocialAccount.
		List<DateTime> observedOrder;
		{
			await using var scope =
				_fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			observedOrder = await dbContext.SocialAccount
				.Where(a => visitedOrder.Contains((Guid)a.Id!))
				.OrderBy(a => visitedOrder.IndexOf((Guid)a.Id!))
				.Select(a => a.CreatedAt)
				.ToListAsync();
		}
		observedOrder.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		observedOrder.Should().NotEqual(seededOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		// The audit interceptor stamps UpdatedAt = now on every Modified save, so the
		// only way to control it is a direct UPDATE that bypasses the interceptor.
		// 3 accounts with UpdatedAt deliberately NOT correlated with insertion order,
		// so a keySelector swap to CreatedAt (stamped at insertion) turns this RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			// Two rows share the same UpdatedAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var id = await ConnectAsync(
				tenantId,
				token,
				$"sa-walk-up-{i}-{Guid.NewGuid():N}"
			);
			var updatedAt = i == 1 ? baseDate.AddDays(1) : baseDate;
			await SetUpdatedAtAsync(id, updatedAt);
			seededIds.Add(id);
			seededOrder.Add(updatedAt);
		}


			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(UpdatedAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await SwapSocialAccountIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);
		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = "/social-accounts/?limit=1&sort_id=updated_at&sort_order=asc";
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
				.ReadFromJsonAsync<FindSocialAccountsForTenantResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(a => a.Id));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers exactly our rows, each once, in order.
		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var updatedAtById = seededIds
			.Zip(seededOrder, (id, c) => (id, c))
			.ToDictionary(x => x.id, x => x.c);
		visitedOrder.Should().Equal(
			seededIds.OrderBy(id => updatedAtById[id]).ThenBy(id => id).ToList()
		);

		// Assert the OBSERVED UpdatedAt order from the DB: ascending and equal
		// to the seeded-but-sorted order, NOT the insertion order.
		List<DateTime> observedOrder;
		{
			await using var scope =
				_fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			observedOrder = await dbContext.SocialAccount
				.Where(a => visitedOrder.Contains((Guid)a.Id!))
				.OrderBy(a => visitedOrder.IndexOf((Guid)a.Id!))
				.Select(a => a.UpdatedAt)
				.ToListAsync();
		}
		observedOrder.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		observedOrder.Should().NotEqual(seededOrder);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"/social-accounts/?cursor={Guid.NewGuid()}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
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

	private async Task<Guid> ConnectAsync(
		Guid tenantId,
		string token,
		string prefix
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier = $"{prefix}@example.com",
			appPassword = "app-password-789",
		});
		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var created = await response.Content
			.ReadFromJsonAsync<SocialAccountCreated>();
		Assert.NotNull(created);
		return created!.Id;
	}

	private async Task SetCreatedAtAsync(Guid accountId, DateTime createdAt) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var account = await dbContext.SocialAccount
			.Where(a => a.Id == accountId)
			.FirstAsync();
		account.CreatedAt = createdAt;
		await dbContext.SaveChangesAsync();
	}

	private async Task SetUpdatedAtAsync(Guid accountId, DateTime updatedAt) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		// Direct UPDATE bypasses the audit interceptor that would otherwise
		// stamp UpdatedAt = now on every Modified save.
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE social_accounts SET updated_at = {0} WHERE id = {1}",
			updatedAt, accountId
		);
	}

	private sealed record SocialAccountCreated {
		public Guid Id { get; init; }
	}

	private sealed record FindSocialAccountsForTenantResponse {
		public List<SocialAccountItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record SocialAccountItem {
		public Guid Id { get; init; }
	}

	private async Task SwapSocialAccountIdsAsync(Guid idA, Guid idB) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var temp = Guid.NewGuid();
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE social_accounts SET id = {0} WHERE id = {1}",
			temp, idA);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE social_accounts SET id = {0} WHERE id = {1}",
			idA, idB);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE social_accounts SET id = {0} WHERE id = {1}",
			idB, temp);
	}
}
