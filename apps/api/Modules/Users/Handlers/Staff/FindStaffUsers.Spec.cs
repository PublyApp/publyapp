using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class FindStaffUserSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindStaffUserSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 20)
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 20)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 20)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldFilterStaffUsersBySearchQuery() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var alphaEmail = $"alpha.staff-{Guid.NewGuid():N}@example.com";
		var betaEmail = $"beta.staff-{Guid.NewGuid():N}@example.com";
		_ = await CreateStaffUserAsync(token, alphaEmail);
		_ = await CreateStaffUserAsync(token, betaEmail);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 20, q: "alpha")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().Contain(user =>
					string.Equals(user.Email, alphaEmail, StringComparison.OrdinalIgnoreCase)
				);
		result.Data.Should().NotContain(user =>
			string.Equals(user.Email, betaEmail, StringComparison.OrdinalIgnoreCase)
		);
	}

	[Fact]
	public async Task ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];

		var withPercentId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			$"has-percent-{marker}@example.com",
			firstName: $"Has%Percent{marker}",
			lastName: "Staff"
		);
		var withoutPercentId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			$"no-percent-{marker}@example.com",
			firstName: $"NoPercentAtAll{marker}",
			lastName: "Staff"
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 100, q: "%")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// user whose name literally contains '%' may match.
		result.Data.Should().Contain(user => user.Id == withPercentId);
		result.Data.Should().NotContain(user => user.Id == withoutPercentId);
	}

	[Fact]
	public async Task ItShouldFilterStaffUsersByStatusQuery() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var activeId = await CreateStaffUserAsync(
			token,
			$"active-{Guid.NewGuid():N}@example.com"
		);
		var suspendedId = await CreateStaffUserAsync(
			token,
			$"suspended-{Guid.NewGuid():N}@example.com"
		);

		await SetStaffUserStatusAsync(activeId, UserStatus.Active);
		await SetStaffUserStatusAsync(suspendedId, UserStatus.Suspended);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 50, status: "suspended")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().ContainSingle(user => user.Id == suspendedId);
		result.Data.Should().NotContain(user => user.Id == activeId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForPendingStatusFilter() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(status: "pending")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("status");
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForUnknownStatusFilter() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(status: "banned")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("status");
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForInactiveStatusFilter() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(status: "inactive")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("status");
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMixedCaseStatusFilter() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(status: "Suspended")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("status");
	}

	[Fact]
	public async Task ItShouldReturnNextCursorWhenMoreStaffUsersExist() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		for (var i = 0; i < 3; i++) {
			_ = await CreateStaffUserAsync(
				token,
				$"cursor-{i}-{Guid.NewGuid():N}@example.com"
			);
			await Task.Delay(25);
		}

		var firstRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 1, sortId: "created_at", sortOrder: "desc")
		).WithSessionToken(token);

		using var firstResponse = await _http.SendAsync(firstRequest);

		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var firstResult = await firstResponse.Content.ReadFromJsonAsync<FindResponse>();
		firstResult.Should().NotBeNull();
		Assert.NotNull(firstResult);
		firstResult.Data.Should().HaveCount(1);
		firstResult.NextCursor.Should().NotBeNullOrWhiteSpace();

		var secondRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(
				cursor: firstResult.NextCursor,
				limit: 1,
				sortId: "created_at",
				sortOrder: "desc"
			)
		).WithSessionToken(token);

		using var secondResponse = await _http.SendAsync(secondRequest);

		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var secondResult = await secondResponse.Content.ReadFromJsonAsync<FindResponse>();
		secondResult.Should().NotBeNull();
		Assert.NotNull(secondResult);
		secondResult.Data.Should().HaveCount(1);
		secondResult.Data.Select(user => user.Email).Should()
			.NotIntersectWith(firstResult.Data.Select(user => user.Email));
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenSortIdIsInvalid() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(sortId: "not_real")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await ReadProblemAsync(response);
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
		problem.TranslationKey.Should().NotBeNullOrWhiteSpace();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorIsMalformed() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(cursor: "not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await ReadProblemAsync(response);
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
		problem.TranslationKey.Should().NotBeNullOrWhiteSpace();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(cursor: Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await ReadProblemAsync(response);
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
		problem.TranslationKey.Should().NotBeNullOrWhiteSpace();
	}

	[Fact]
	public async Task ItShouldKeepSuspendedStaffUsersVisibleInDefaultList() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var email = $"suspended-{Guid.NewGuid():N}@example.com";
		var userId = await CreateStaffUserAsync(token, email);

		await SetStaffUserStatusAsync(userId, UserStatus.Suspended);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 50)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().Contain(user =>
					string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase)
					&& user.Status == "Suspended"
				);
	}

	[Fact]
	public async Task ItShouldExcludeDeletedUsersAndAccountsFromDefaultList() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var deletedUserEmail = $"deleted-user-{Guid.NewGuid():N}@example.com";
		var deletedAccountEmail = $"deleted-account-{Guid.NewGuid():N}@example.com";
		var deletedUserId = await CreateStaffUserAsync(token, deletedUserEmail);
		var deletedAccountId = await CreateStaffUserAsync(token, deletedAccountEmail);

		await SetStaffUserDeletedStateAsync(deletedUserId, deleteUser: true);
		await SetStaffUserDeletedStateAsync(deletedAccountId, deleteAccount: true);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 50)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().NotContain(user =>
					string.Equals(user.Email, deletedUserEmail, StringComparison.OrdinalIgnoreCase)
				);
		result.Data.Should().NotContain(user =>
			string.Equals(user.Email, deletedAccountEmail, StringComparison.OrdinalIgnoreCase)
		);
	}

	[Fact]
	public async Task ItShouldReturn422WhenLimitExceedsTheMaximum() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 101)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("limit");
	}

	[Fact]
	public async Task ItShouldReturn422WhenLimitIsWellAboveTheMaximum() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 1_000_000)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("limit");
	}

	[Fact]
	public async Task ItShouldReturnOkWhenLimitEqualsTheMaximum() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 100)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldWalkEveryEmailPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// Deterministic, anti-correlated emails: insertion order is c,b,a while
		// the lexical (sort) order is a,b,c. The walk must return them in
		// lexical order, so a keySelector swap to the id (insertion) order
		// turns this assertion RED.
		const int total = 3;
		var emails = new List<string>();
		for (var i = 0; i < total; i++) {
			emails.Add($"email-walk-{(char)('a' + (2 - i))}-{Guid.NewGuid():N}@example.com");
			_ = await CreateStaffUserAsync(token, emails[^1]);
		}
		emails.Sort(StringComparer.OrdinalIgnoreCase);

		var visitedEmails = new List<string>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "email",
				sortOrder: "asc"
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedEmails.AddRange(page.Data.Select(user => user.Email));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the tie-breaker/cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers the whole list (seeded template users included):
		// no row may repeat, and our three rows must come out once each,
		// in keyset order relative to each other.
		visitedEmails.Should().OnlyHaveUniqueItems();
		visitedEmails.Where(emails.Contains).Should().Equal(emails);
	}

	[Fact]
	public async Task ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// 3 staff users with distinct, deliberately NOT insertion-ordered
		// CreatedAt (anti-correlated). The walk must visit each once in
		// ascending CreatedAt order, not insertion order, so a
		// keySelector swap to another same-type field (e.g. UpdatedAt)
		// turns this assertion RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			// Two rows share the same CreatedAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var createdAt = i == 1 ? baseDate.AddDays(1) : baseDate;
			var userId = await CreateStaffUserAsync(token, $"created-at-walk-{i}-{Guid.NewGuid():N}@example.com");
			await SeedStaffUserCreatedAtAsync(userId, createdAt);
			seededIds.Add(userId);
			seededOrder.Add(createdAt);
		}

			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(CreatedAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await SwapStaffUserIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "created_at",
				sortOrder: "asc"
			);
			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(u => u.Id));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers exactly our rows, each once, in CreatedAt order.
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

		// Assert the OBSERVED CreatedAt order from the DB, in walk order,
		// pins the sort to User.CreatedAt (not UpdatedAt/insertion order).
		var visitedSeededUserIds = visitedOrder.ToList();
		List<DateTime> observedOrder;
		{
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			observedOrder = await dbContext.User
				.Where(u => visitedSeededUserIds.Contains(u.Id!.Value))
				.OrderBy(u => visitedSeededUserIds.IndexOf(u.Id!.Value))
				.Select(u => u.CreatedAt)
				.ToListAsync();
		}
		observedOrder.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		observedOrder.Should().NotEqual(seededOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// 3 staff users with distinct, deliberately NOT insertion-ordered
		// UpdatedAt (anti-correlated). The walk must visit each once in
		// ascending UpdatedAt order, not insertion order, so a
		// keySelector swap to another same-type field (e.g. CreatedAt)
		// turns this assertion RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			// Two rows share the same UpdatedAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var updatedAt = i == 1 ? baseDate.AddDays(1) : baseDate;
			var userId = await CreateStaffUserAsync(token, $"updated-at-walk-{i}-{Guid.NewGuid():N}@example.com");
			await SeedStaffUserUpdatedAtAsync(userId, updatedAt);
			seededIds.Add(userId);
			seededOrder.Add(updatedAt);
		}


			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(UpdatedAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await SwapStaffUserIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);
		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "updated_at",
				sortOrder: "asc"
			);
			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(u => u.Id));
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

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

		var visitedSeededUserIds = visitedOrder.ToList();
		List<DateTime> observedOrder;
		{
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			observedOrder = await dbContext.User
				.Where(u => visitedSeededUserIds.Contains(u.Id!.Value))
				.OrderBy(u => visitedSeededUserIds.IndexOf(u.Id!.Value))
				.Select(u => u.UpdatedAt)
				.ToListAsync();
		}
		observedOrder.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		observedOrder.Should().NotEqual(seededOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryFirstNamePageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// Deterministic, anti-correlated first names: insertion order is c,b,a while
		// the lexical (sort) order is a,b,c. The walk must return them in
		// lexical order, so a keySelector swap to the id (insertion) order
		// turns this assertion RED.
		var seededIds = new List<Guid>();
		var seededFirstNames = new List<string>();
		// Two rows share the same FirstName (i=0 and i=2), one has a
		// different value (i=1). The tiebreaker (Id ascending) must
		// determine the order of the two equal-key rows.
		var firstNames = new[] { "Alpha", "Bravo", "Alpha" };
		for (var i = 0; i < 3; i++) {
			var userId = await CreateStaffUserAsync(token, $"first-name-walk-{i}-{Guid.NewGuid():N}@example.com");
			await SeedStaffUserFirstNameAsync(userId, firstNames[i]);
			seededIds.Add(userId);
			seededFirstNames.Add(firstNames[i]);
		}
		var expectedOrder = seededIds
			.Zip(seededFirstNames, (id, n) => (id, n))
			.OrderBy(x => x.n, StringComparer.OrdinalIgnoreCase)
			.ThenBy(x => x.id)
			.Select(x => x.id)
			.ToList();

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "first_name",
				sortOrder: "asc"
			);
			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(u => u.Id));
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryLastNamePageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// Deterministic, anti-correlated last names: insertion order is c,b,a while
		// the lexical (sort) order is a,b,c. The walk must return them in
		// lexical order, so a keySelector swap to the id (insertion) order
		// turns this assertion RED.
		var seededIds = new List<Guid>();
		var seededLastNames = new List<string>();
		// Two rows share the same LastName (i=0 and i=2), one has a
		// different value (i=1). The tiebreaker (Id ascending) must
		// determine the order of the two equal-key rows.
		var lastNames = new[] { "Alpha", "Bravo", "Alpha" };
		for (var i = 0; i < 3; i++) {
			var userId = await CreateStaffUserAsync(token, $"last-name-walk-{i}-{Guid.NewGuid():N}@example.com");
			await SeedStaffUserLastNameAsync(userId, lastNames[i]);
			seededIds.Add(userId);
			seededLastNames.Add(lastNames[i]);
		}
		var expectedOrder = seededIds
			.Zip(seededLastNames, (id, n) => (id, n))
			.OrderBy(x => x.n, StringComparer.OrdinalIgnoreCase)
			.ThenBy(x => x.id)
			.Select(x => x.id)
			.ToList();

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "last_name",
				sortOrder: "asc"
			);
			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(u => u.Id));
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryStatusPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// 3 staff users with distinct, deliberately NOT insertion-ordered Status
		// (anti-correlated with insertion). The walk must visit each once in
		// ascending Status order. A keySelector swap to another same-type field
		// (e.g. Level) turns this assertion RED.
		// UserStatus: Suspended = 30, Active = 40.
		var statuses = new[] { UserStatus.Suspended, UserStatus.Active, UserStatus.Suspended };
		var seededIds = new List<Guid>();
		for (var i = 0; i < 3; i++) {
			var userId = await CreateStaffUserAsync(token, $"status-walk-{i}-{Guid.NewGuid():N}@example.com");
			await SetStaffUserStatusAsync(userId, statuses[i]);
			seededIds.Add(userId);
		}

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "status",
				sortOrder: "asc"
			);
			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(u => u.Id));
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var expectedOrder = seededIds
			.Zip(statuses, (id, s) => (id, s))
			.OrderBy(x => x.s)
			.ThenBy(x => x.id)
			.Select(x => x.id)
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task ItShouldWalkEveryLevelPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// 3 staff users with distinct, deliberately NOT insertion-ordered Level
		// (anti-correlated with insertion). The walk must visit each once in
		// ascending Level order. A keySelector swap to another same-type field
		// (e.g. Status) turns this assertion RED.
		// AccountLevel: User = 10, Admin = 50.
		var levels = new[] { AccountLevel.Admin, AccountLevel.User, AccountLevel.Admin };
		var seededIds = new List<Guid>();
		for (var i = 0; i < 3; i++) {
			var userId = await CreateStaffUserAsync(token, $"level-walk-{i}-{Guid.NewGuid():N}@example.com");
			await SetStaffUserLevelAsync(userId, levels[i]);
			seededIds.Add(userId);
		}

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "level",
				sortOrder: "asc"
			);
			using var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(u => u.Id));
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var expectedOrder = seededIds
			.Zip(levels, (id, l) => (id, l))
			.OrderBy(x => x.l)
			.ThenBy(x => x.id)
			.Select(x => x.id)
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task ItShouldAcceptAnUppercaseSortId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 5, sortId: "CREATED_AT")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private static string GetFindUrl(
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? q = null,
		string? status = null
	) {
		var basePath = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
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
		if (status is not null) {
			queryParams.Add($"status={Uri.EscapeDataString(status)}");
		}

		return queryParams.Count > 0
			? $"{basePath}?{string.Join("&", queryParams)}"
			: basePath;
	}

	private async Task<Guid> CreateStaffUserAsync(string staffToken, string email) {
		_ = staffToken;
		// Direct create is no longer mapped; seed staff users directly for setup.
		return await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email,
			firstName: "Test",
			lastName: "Staff"
		);
	}

	private async Task SetStaffUserStatusAsync(Guid userId, UserStatus status) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User.FirstAsync(u => u.Id == userId);
		user.Status = status;

		await dbContext.SaveChangesAsync();
	}

	private async Task SeedStaffUserCreatedAtAsync(Guid userId, DateTime createdAt) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User.FirstAsync(u => u.Id == userId);
		user.CreatedAt = createdAt;

		await dbContext.SaveChangesAsync();
	}

	private async Task SetStaffUserDeletedStateAsync(
		Guid userId,
		bool deleteUser = false,
		bool deleteAccount = false
	) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User.FirstAsync(u => u.Id == userId);
		var account = await dbContext.UserAccount.FirstAsync(ua =>
			ua.UserId == user.Id && ua.Scope == AccountScope.Staff
		);

		user.IsDeleted = deleteUser;
		account.IsDeleted = deleteAccount;

		await dbContext.SaveChangesAsync();
	}

	private async Task SeedStaffUserUpdatedAtAsync(Guid userId, DateTime updatedAt) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// The audit interceptor stamps UpdatedAt = now on every Modified save,
		// so a normal entity update would overwrite the seeded value. Use a
		// direct UPDATE to bypass the interceptor (same pattern as Posts test).
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE users SET updated_at = {0} WHERE id = {1}",
			updatedAt, userId
		);
	}

	private async Task SeedStaffUserFirstNameAsync(Guid userId, string firstName) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User.FirstAsync(u => u.Id == userId);
		user.FirstName = firstName;

		await dbContext.SaveChangesAsync();
	}

	private async Task SeedStaffUserLastNameAsync(Guid userId, string lastName) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User.FirstAsync(u => u.Id == userId);
		user.LastName = lastName;

		await dbContext.SaveChangesAsync();
	}

	private async Task SetStaffUserLevelAsync(Guid userId, AccountLevel level) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var account = await dbContext.UserAccount.FirstAsync(ua =>
			ua.UserId == userId && ua.Scope == AccountScope.Staff
		);
		account.Level = level;

		await dbContext.SaveChangesAsync();
	}

	private record FindResponse {
		public List<StaffUserItemDto> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private record StaffUserItemDto {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string? LastName { get; init; }
		public string? FirstName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Status { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
	}

	private static async Task<AppProblemDetails?> ReadProblemAsync(
		HttpResponseMessage response
	) {
		return await response.Content.ReadFromJsonAsync<AppProblemDetails>();
	}

	private async Task SwapStaffUserIdsAsync(Guid idA, Guid idB) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var temp = Guid.NewGuid();
		// Swap IDs on the parent (users) and child (user_accounts) tables.
		// The three-step swap via a temp id avoids PK collision (the PK unique
		// constraint must never see two rows with the same id concurrently).
		// For the child table FK: update parent to temp FIRST, then repoint
		// child rows to temp so the FK remains valid at every step.
		// Step 1: move idA -> temp in users (freeing idA for the swap),
		// then redirect user_accounts to temp.
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE users SET id = {0} WHERE id = {1}",
			temp, idA);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE user_accounts SET user_id = {0} WHERE user_id = {1}",
			temp, idA);
		// Step 2: move idB -> idA in both tables.
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE users SET id = {0} WHERE id = {1}",
			idA, idB);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE user_accounts SET user_id = {0} WHERE user_id = {1}",
			idA, idB);
		// Step 3: move temp -> idB in both tables (completing the swap).
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE users SET id = {0} WHERE id = {1}",
			idB, temp);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE user_accounts SET user_id = {0} WHERE user_id = {1}",
			idB, temp);
	}
}
