
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
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class FindTenantUserCompaniesForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantUserCompaniesForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);

		// A user with three tenant memberships of distinct account CreatedAt,
		// deliberately NOT in insertion order (anti-correlated). The walk must
		// visit each once in ascending CreatedAt order, so a keySelector swap
		// to another same-type field turns this assertion RED.
		var baseDate = new DateTime(
			2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
		);
		var (userId, seededTenantIds, seededOrder) =
			await SeedUserWithCompaniesAsync(acmeTenantId, baseDate);

		var visitedTenantIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(
					userId,
					cursor: cursor,
					limit: 1,
					sortId: "created_at",
					sortOrder: "asc"
				)
			).WithSessionToken(staffToken);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindCompaniesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedTenantIds.AddRange(
				page.Data.Select(c => c.TenantId)
			);
			cursor = page.NextCursor;

			// Guard against an infinite loop if the cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers exactly our memberships, each once, in CreatedAt
		// ascending order (NOT insertion order).
		visitedTenantIds.Should().OnlyHaveUniqueItems();
		visitedTenantIds.Should().Contain(seededTenantIds);

		var visitedOrder = visitedTenantIds
			.Where(seededTenantIds.Contains)
			.ToList();
		var createdAtByTenantId = seededTenantIds
			.Zip(seededOrder, (id, c) => (id, c))
			.ToDictionary(x => x.id, x => x.c);
		visitedOrder.Should().Equal(
			seededTenantIds.OrderBy(id => createdAtByTenantId[id]).ToList()
		);

		// Assert the OBSERVED sort order against the real account CreatedAt
		// values from the DB, in walk order. The item exposes only TenantId,
		// so resolve CreatedAt by (TenantId, UserId) on UserAccount.
		List<DateTime> observedOrder;
		{
			await using var scope =
				_fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			var userIdGuid = Guid.Parse(userId);
			observedOrder = await dbContext.UserAccount
				.Where(a => a.UserId == userIdGuid
					&& visitedOrder.Contains((Guid)a.TenantId!))
				.OrderBy(a => visitedOrder.IndexOf((Guid)a.TenantId!))
				.Select(a => a.CreatedAt)
				.ToListAsync();
		}
		observedOrder.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		observedOrder.Should().NotEqual(seededOrder);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryTenantNamePageWithoutOverlapOrGap() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);

		// A user with three tenant memberships of distinct tenant names,
		// deliberately NOT in insertion order (anti-correlated). The walk must
		// visit each once in ascending tenant name order, so a keySelector swap
		// to another same-type field (e.g. account CreatedAt) turns this assertion RED.
		var baseDate = new DateTime(
			2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
		);
		var (userId, seededTenantIds, seededOrder) =
			await SeedUserWithCompaniesAsync(acmeTenantId, baseDate);

		var visitedTenantIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(
					userId,
					cursor: cursor,
					limit: 1,
					sortId: "tenant_name",
					sortOrder: "asc"
				)
			).WithSessionToken(staffToken);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindCompaniesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedTenantIds.AddRange(
				page.Data.Select(c => c.TenantId)
			);
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedTenantIds.Should().OnlyHaveUniqueItems();
		visitedTenantIds.Should().Contain(seededTenantIds);

		var visitedOrder = visitedTenantIds
			.Where(seededTenantIds.Contains)
			.ToList();
		var expectedOrder = seededTenantIds
			.OrderBy(id => seededOrder[seededTenantIds.IndexOf(id)])
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryStatusPageWithoutOverlapOrGap() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);

		// A user with three tenant memberships of distinct account Status,
		// deliberately NOT in insertion order (anti-correlated). The walk must
		// visit each once in ascending status order, so a keySelector swap
		// to another same-type field (e.g. account CreatedAt) turns this assertion RED.
		var baseDate = new DateTime(
			2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
		);
		var (userId, seededTenantIds, seededOrder) =
			await SeedUserWithCompaniesAsync(acmeTenantId, baseDate);

		var visitedTenantIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(
					userId,
					cursor: cursor,
					limit: 1,
					sortId: "status",
					sortOrder: "asc"
				)
			).WithSessionToken(staffToken);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindCompaniesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedTenantIds.AddRange(
				page.Data.Select(c => c.TenantId)
			);
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedTenantIds.Should().OnlyHaveUniqueItems();
		visitedTenantIds.Should().Contain(seededTenantIds);

		var visitedOrder = visitedTenantIds
			.Where(seededTenantIds.Contains)
			.ToList();
		var expectedOrder = seededTenantIds
			.OrderBy(id => seededOrder[seededTenantIds.IndexOf(id)])
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryLevelPageWithoutOverlapOrGap() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);

		// A user with three tenant memberships of distinct account Level,
		// deliberately NOT in insertion order (anti-correlated). The walk must
		// visit each once in ascending level order, so a keySelector swap
		// to another same-type field (e.g. account CreatedAt) turns this assertion RED.
		var baseDate = new DateTime(
			2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
		);
		var (userId, seededTenantIds, seededOrder) =
			await SeedUserWithCompaniesAsync(acmeTenantId, baseDate);

		var visitedTenantIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(
					userId,
					cursor: cursor,
					limit: 1,
					sortId: "level",
					sortOrder: "asc"
				)
			).WithSessionToken(staffToken);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindCompaniesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedTenantIds.AddRange(
				page.Data.Select(c => c.TenantId)
			);
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedTenantIds.Should().OnlyHaveUniqueItems();
		visitedTenantIds.Should().Contain(seededTenantIds);

		var visitedOrder = visitedTenantIds
			.Where(seededTenantIds.Contains)
			.ToList();
		var expectedOrder = seededTenantIds
			.OrderBy(id => seededOrder[seededTenantIds.IndexOf(id)])
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task
	ItShouldReturnCursorPaginatedCompaniesWhenTenantUserExists() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			acmeTenantId,
			SeedConstants.CrossTenant.AliceEmail
		);

		using var firstRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(
				userId,
				limit: 1,
				sortId: "tenant_name",
				sortOrder: "asc"
			)
		).WithSessionToken(staffToken);

		using var firstResponse = await _http.SendAsync(firstRequest);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var firstResult = await firstResponse.Content
			.ReadFromJsonAsync<FindCompaniesResponse>();
		firstResult.Should().NotBeNull();
		Assert.NotNull(firstResult);
		firstResult.Data.Should().ContainSingle();
		firstResult.NextCursor.Should().NotBeNullOrWhiteSpace();

		using var secondRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(
				userId,
				cursor: firstResult.NextCursor,
				limit: 1,
				sortId: "tenant_name",
				sortOrder: "asc"
			)
		).WithSessionToken(staffToken);

		using var secondResponse = await _http.SendAsync(secondRequest);

		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var secondResult = await secondResponse.Content
			.ReadFromJsonAsync<FindCompaniesResponse>();
		secondResult.Should().NotBeNull();
		Assert.NotNull(secondResult);
		secondResult.Data.Should().ContainSingle();

		var tenantNames = firstResult.Data
			.Concat(secondResult.Data)
			.Select(company => company.TenantName)
			.ToList();
		tenantNames.Should().BeEquivalentTo([
			SeedConstants.Tenants.AcmeName,
			SeedConstants.Tenants.TechStartName,
		]);
		firstResult.Data[0].TenantId.Should().NotBeEmpty();
		firstResult.Data[0].Level.Should().NotBeNullOrWhiteSpace();
		firstResult.Data[0].Status.Should().NotBeNullOrWhiteSpace();
		firstResult.Data[0].CreatedAt.Should().NotBe(default);
	}

	[Fact]
	public async Task
	ItShouldFilterCompaniesBySearchTextWhenTenantUserExists() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			acmeTenantId,
			SeedConstants.CrossTenant.AliceEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(
				userId,
				limit: 10,
				sortId: "tenant_name",
				sortOrder: "asc",
				q: SeedConstants.Tenants.TechStartCode
			)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindCompaniesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().ContainSingle(company =>
					company.TenantName == SeedConstants.Tenants.TechStartName
				);
		result.NextCursor.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			acmeTenantId,
			SeedConstants.CrossTenant.AliceEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(
				userId,
				limit: 10,
				sortId: "tenant_name",
				sortOrder: "asc",
				q: "%"
			)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindCompaniesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// Alice's companies (Acme, TechStart) contain no literal '%' in name or
		// code. If '%' were interpolated unescaped into the ILIKE pattern, it
		// would collapse to a wildcard matching both; escaped, neither matches.
		result.Data.Should().BeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnEmptyCompanyPageWhenTenantUserHasNoLiveCompanies() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var techStartTenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);
		var globalTenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			techStartTenantId,
			SeedConstants.CrossTenant.BobEmail
		);

		// The companies collection can be empty while the first-class
		// tenant-user identity remains addressable.
		await RemoveTenantMembershipAsync(
			staffToken,
			techStartTenantId,
			userId
		);
		await RemoveTenantMembershipAsync(
			staffToken,
			globalTenantId,
			userId
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindCompaniesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().BeEmpty();
		result.NextCursor.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenUserIdIsMalformed() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl("not-a-guid")
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenCursorIsMalformed() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			acmeTenantId,
			SeedConstants.CrossTenant.AliceEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(userId, cursor: "not-a-guid")
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenTenantUserDoesNotExistEvenWithCursor() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString(), cursor: Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenSortIdIsNotAllowed() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			acmeTenantId,
			SeedConstants.CrossTenant.AliceEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(userId, sortId: "not_allowed")
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Theory]
	[InlineData("tenant_name")]
	[InlineData("status")]
	[InlineData("level")]
	[InlineData("created_at")]
	public async Task
	ItShouldReturnCompaniesWhenSortingByAllowedColumn(string sortId) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			acmeTenantId,
			SeedConstants.CrossTenant.AliceEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(userId, limit: 10, sortId: sortId, sortOrder: "asc")
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindCompaniesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenTenantUserDoesNotExist() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var userId = await GetUserIdByEmailAsync(
			staffToken,
			acmeTenantId,
			SeedConstants.CrossTenant.AliceEmail
		);
		var tenantToken = await _authClient.LoginAsync(
			SeedConstants.CrossTenant.AliceEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(userId)
		).WithSessionToken(tenantToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string GetUrl(
		string userId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? q = null
	) {
		var basePath = PathUtils.Join(
			Routes.Staff.Root,
			"/tenant-users",
			$"/{userId}/companies"
		);
		var queryParams = new List<string>();

		if (cursor is not null) {
			queryParams.Add($"cursor={Uri.EscapeDataString(cursor)}");
		}
		if (limit is not null) {
			queryParams.Add($"limit={limit}");
		}
		if (sortId is not null) {
			queryParams.Add($"sort_id={Uri.EscapeDataString(sortId)}");
		}
		if (sortOrder is not null) {
			queryParams.Add($"sort_order={Uri.EscapeDataString(sortOrder)}");
		}
		if (q is not null) {
			queryParams.Add($"q={Uri.EscapeDataString(q)}");
		}

		if (queryParams.Count == 0) {
			return basePath;
		}

		return $"{basePath}?{string.Join("&", queryParams)}";
	}

	private static string GetRemoveUrl(
		Guid tenantId,
		string userId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.DeleteFn(
				tenantId.ToString(),
				userId
			)
		);
	}

	private async Task<string> GetUserIdByEmailAsync(
		string staffToken,
		Guid tenantId,
		string email
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.RootFn(
				tenantId.ToString()
			),
			Routes.Users.ForTenantAsStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content
			.ReadFromJsonAsync<FindUsersResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize tenant user list response"
			);
		}

		var user = result.Data.FirstOrDefault(
			u => string.Equals(
				u.Email,
				email,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (user is null) {
			throw new InvalidOperationException(
				$"User with email '{email}' not found in tenant"
			);
		}

		return user.Id;
	}

	private async Task RemoveTenantMembershipAsync(
		string staffToken,
		Guid tenantId,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetRemoveUrl(tenantId, userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private sealed record FindUsersResponse {
		public List<TenantUserItem> Data { get; init; } = [];
	}

	private sealed record TenantUserItem {
		public string Id { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
	}

	private sealed record FindCompaniesResponse {
		public List<TenantUserCompanyResponse> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private async Task<(string userId, List<Guid> tenantIds, List<DateTime> order)>
	SeedUserWithCompaniesAsync(
		Guid acmeTenantId,
		DateTime baseDate
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = $"company-walk-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			FirstName = "Company",
			LastName = "Walk",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();
		var userId = user.GetRequiredId();

		// Attach to Acme plus two freshly created tenants so the CreatedAt
		// values are fully under our control (seed data may not be ordered).
		var tenantIds = new List<Guid> { acmeTenantId };
		for (var i = 0; i < 2; i++) {
			var tenant = new Tenant {
				Name = $"Company Walk {i} {Guid.NewGuid():N}",
				Code = Guid.NewGuid().ToString("N")[..10],
				Status = TenantStatus.Active,
				MaxUsers = 10,
			};
			await dbContext.Tenant.AddAsync(tenant);
			await dbContext.SaveChangesAsync();
			tenantIds.Add(tenant.GetRequiredId());
		}

		// Distinct CreatedAt per membership, deliberately anti-correlated with
		// insertion: index 0 -> +2d, 1 -> +0d, 2 -> +1d. Two-phase: insert
		// (interceptor stamps CreatedAt/UpdatedAt = now), then re-save the
		// tracked row as Modified (interceptor only updates UpdatedAt) so the
		// pinned CreatedAt sticks.
		var order = new List<DateTime>();
		for (var i = 0; i < tenantIds.Count; i++) {
			var account = UserAccount.CreateTenantAccount(
				userId,
				tenantIds[i]
			);
			var createdAt = baseDate.AddDays((tenantIds.Count - i) % tenantIds.Count);
			order.Add(createdAt);
			await dbContext.UserAccount.AddAsync(account);
			await dbContext.SaveChangesAsync();
			var accountId = account.GetRequiredId();

			var tracked = await dbContext.UserAccount
				.Where(a => a.Id == accountId)
				.FirstAsync();
			tracked.CreatedAt = createdAt;
			await dbContext.SaveChangesAsync();
		}

		return (userId.ToString(), tenantIds, order);
	}

	private sealed record TenantUserCompanyResponse {
		public Guid TenantId { get; init; }
		public string TenantName { get; init; } = string.Empty;
		public string? TenantLogoUrl { get; init; }
		public string Level { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
