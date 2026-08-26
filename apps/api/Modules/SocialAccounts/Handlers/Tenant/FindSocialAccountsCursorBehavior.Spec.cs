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

		// 3 accounts with distinct CreatedAt; the walk must visit each once in
		// ascending CreatedAt order with no gap or duplicate.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		for (var i = 0; i < 3; i++) {
			var id = await ConnectAsync(
				tenantId,
				token,
				$"sa-walk-{i}-{Guid.NewGuid():N}"
			);
			await SetCreatedAtAsync(id, baseDate.AddDays(i));
			seededIds.Add(id);
		}

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
		visitedOrder.Should().Equal(seededIds);
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
}
