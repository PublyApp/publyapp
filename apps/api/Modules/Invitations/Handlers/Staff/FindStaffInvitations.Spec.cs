using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public sealed class FindStaffInvitationsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindStaffInvitationsSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenStatusCsvHasNoTokens() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: ",")
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldFilterByMultipleStaffInvitationStatuses() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string pendingEmail = $"staff-pending-{Guid.NewGuid():N}@example.com";
		string revokedEmail = $"staff-revoked-{Guid.NewGuid():N}@example.com";
		string acceptedEmail = $"staff-accepted-{Guid.NewGuid():N}@example.com";

		_ = await CreateStaffInvitationAsync(staffToken, pendingEmail);
		Guid revokedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			revokedEmail
		);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);

		await RevokeStaffInvitationAsync(staffToken, revokedInvitationId);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "pending,revoked", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Pending"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Revoked"
		);
		_ = data.Should().NotContain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
		);
		_ = data.Should().OnlyContain(item =>
			item.Status == "Pending" || item.Status == "Revoked"
		);
	}

	[Fact]
	public async Task
	ItShouldFilterByExpiredStaffInvitationStatus() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string expiredEmail = $"staff-expired-{Guid.NewGuid():N}@example.com";

		await CreateExpiredStaffInvitationAsync(expiredEmail);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "expired", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(expiredEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Expired"
		);
		_ = data.Should().OnlyContain(item => item.Status == "Expired");
	}

	[Fact]
	public async Task
	ItShouldAcceptCommaSeparatedStaffInvitationStatusesWithSpaces() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string acceptedEmail = $"staff-accepted-spaces-{Guid.NewGuid():N}@example.com";
		string expiredEmail = $"staff-expired-spaces-{Guid.NewGuid():N}@example.com";

		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);
		await CreateExpiredStaffInvitationAsync(expiredEmail);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "accepted, expired", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Accepted"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(expiredEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Expired"
		);
		_ = data.Should().OnlyContain(item =>
			item.Status == "Accepted" || item.Status == "Expired"
		);
	}

	[Fact]
	public async Task
	ItShouldReturnOnlyPendingStaffInvitationsWhenFilterIsPending() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string pendingEmail = $"staff-only-pending-{Guid.NewGuid():N}@example.com";
		string acceptedEmail = $"staff-only-pending-accepted-{Guid.NewGuid():N}@example.com";
		string revokedEmail = $"staff-only-pending-revoked-{Guid.NewGuid():N}@example.com";

		_ = await CreateStaffInvitationAsync(staffToken, pendingEmail);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);
		Guid revokedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			revokedEmail
		);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);
		await RevokeStaffInvitationAsync(staffToken, revokedInvitationId);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "pending", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Pending"
		);
		_ = data.Should().NotContain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
		);
		_ = data.Should().NotContain(item =>
			item.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase)
		);
		_ = data.Should().OnlyContain(item => item.Status == "Pending");
	}

	[Fact]
	public async Task
	ItShouldReturnAllStatusesWhenFilterIncludesEveryStatus() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string pendingEmail = $"staff-all-pending-{Guid.NewGuid():N}@example.com";
		string acceptedEmail = $"staff-all-accepted-{Guid.NewGuid():N}@example.com";
		string revokedEmail = $"staff-all-revoked-{Guid.NewGuid():N}@example.com";
		string expiredEmail = $"staff-all-expired-{Guid.NewGuid():N}@example.com";

		_ = await CreateStaffInvitationAsync(staffToken, pendingEmail);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);
		Guid revokedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			revokedEmail
		);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);
		await RevokeStaffInvitationAsync(staffToken, revokedInvitationId);
		await CreateExpiredStaffInvitationAsync(expiredEmail);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(
				staffToken,
				status: "pending,accepted,expired,revoked",
				limit: 100
			)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Pending"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Accepted"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Revoked"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(expiredEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Expired"
		);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenStatusFilterContainsInvalidToken() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "foo")
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldDedupeDuplicateStaffInvitationStatusValues() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string pendingEmail = $"staff-dup-pending-{Guid.NewGuid():N}@example.com";
		string acceptedEmail = $"staff-dup-accepted-{Guid.NewGuid():N}@example.com";

		_ = await CreateStaffInvitationAsync(staffToken, pendingEmail);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);

		using HttpResponseMessage dedupedResponse = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "pending,pending", limit: 100)
		);
		using HttpResponseMessage singleResponse = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "pending", limit: 100)
		);

		_ = dedupedResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		_ = singleResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? deduped = await dedupedResponse.Content
			.ReadFromJsonAsync<FindResponse>();
		FindResponse? single = await singleResponse.Content
			.ReadFromJsonAsync<FindResponse>();
		_ = deduped.Should().NotBeNull();
		_ = single.Should().NotBeNull();

		List<InvitationListItemDto> dedupedData = deduped?.Data ?? [];
		List<InvitationListItemDto> singleData = single?.Data ?? [];

		_ = dedupedData.Should().HaveCount(singleData.Count);
		_ = dedupedData.Select(item => item.Id)
			.Should()
			.BeEquivalentTo(singleData.Select(item => item.Id));
		_ = dedupedData.Should().Contain(item =>
			item.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase)
		);
		_ = dedupedData.Should().NotContain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
		);
		_ = dedupedData.Should().OnlyContain(item => item.Status == "Pending");
	}

	[Fact]
	public async Task
	ItShouldAcceptMixedCaseStaffInvitationStatusValues() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string pendingEmail = $"staff-mixed-pending-{Guid.NewGuid():N}@example.com";
		string acceptedEmail = $"staff-mixed-accepted-{Guid.NewGuid():N}@example.com";
		string revokedEmail = $"staff-mixed-revoked-{Guid.NewGuid():N}@example.com";

		_ = await CreateStaffInvitationAsync(staffToken, pendingEmail);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			acceptedEmail
		);
		Guid revokedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			revokedEmail
		);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);
		await RevokeStaffInvitationAsync(staffToken, revokedInvitationId);

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "Pending,Accepted", limit: 100)
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? result = await response.Content.ReadFromJsonAsync<FindResponse>();
		_ = result.Should().NotBeNull();
		List<InvitationListItemDto> data = result?.Data ?? [];

		_ = data.Should().Contain(item =>
			item.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Pending"
		);
		_ = data.Should().Contain(item =>
			item.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase)
			&& item.Status == "Accepted"
		);
		_ = data.Should().NotContain(item =>
			item.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase)
		);
		_ = data.Should().OnlyContain(item =>
			item.Status == "Pending" || item.Status == "Accepted"
		);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenSortIdIsInvalid() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, sortId: "invalid")
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenCursorIsNotAGuid() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, cursor: "not-a-guid")
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldPaginateAcrossNextCursorWithStatusFilter() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		// Create 3 pending staff invitations + 1 accepted to confirm the filter
		// is preserved across pages.
		string tag = Guid.NewGuid().ToString("N")[..8];
		List<Guid> pendingIds = [];
		for (int i = 0; i < 3; i++) {
			Guid id = await CreateStaffInvitationAsync(
				staffToken,
				$"staff-page-{tag}-pending-{i}-{Guid.NewGuid():N}@example.com"
			);
			pendingIds.Add(id);
		}
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			staffToken,
			$"staff-page-{tag}-accepted-{Guid.NewGuid():N}@example.com"
		);
		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);

		// Page 1: limit=2 to force a nextCursor with at least one extra row left.
		using HttpResponseMessage page1Response = await _http.SendAsync(
			CreateFindRequest(staffToken, status: "pending", limit: 2)
		);
		_ = page1Response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? page1 = await page1Response.Content
			.ReadFromJsonAsync<FindResponse>();
		_ = page1.Should().NotBeNull();
		Assert.NotNull(page1);
		_ = page1.Data.Should().HaveCount(2);
		_ = page1.Data.Should().OnlyContain(item => item.Status == "Pending");
		_ = page1.NextCursor.Should().NotBeNullOrEmpty();

		// Page 2: same filter, follow the cursor. Must keep returning Pending only,
		// with no overlap with page 1.
		using HttpResponseMessage page2Response = await _http.SendAsync(
			CreateFindRequest(
				staffToken,
				status: "pending",
				limit: 2,
				cursor: page1.NextCursor
			)
		);
		_ = page2Response.StatusCode.Should().Be(HttpStatusCode.OK);

		FindResponse? page2 = await page2Response.Content
			.ReadFromJsonAsync<FindResponse>();
		_ = page2.Should().NotBeNull();
		Assert.NotNull(page2);
		_ = page2.Data.Should().OnlyContain(item => item.Status == "Pending");

		HashSet<Guid> page1Ids = page1.Data.Select(item => item.Id).ToHashSet();
		HashSet<Guid> page2Ids = page2.Data.Select(item => item.Id).ToHashSet();
		_ = page2Ids.Should().NotIntersectWith(page1Ids);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryEmailPageWithoutOverlapOrGap() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string tag = Guid.NewGuid().ToString("N")[..8];
		// Deterministic, anti-correlated emails: insertion order is c,b,a while
		// the lexical (sort) order is a,b,c. The walk must return them in
		// lexical order, so a keySelector swap to the id (insertion) order
		// turns this assertion RED.
		List<string> emails = [];
		for (int i = 0; i < 3; i++) {
			string email = $"email-walk-{tag}-{(char)('a' + (2 - i))}-{Guid.NewGuid():N}@example.com";
			await CreateStaffInvitationAsync(staffToken, email);
			emails.Add(email);
		}
		emails.Sort(StringComparer.OrdinalIgnoreCase);

		List<string> visitedEmails = [];
		string? cursor = null;
		int pages = 0;
		do {
			using HttpResponseMessage response = await _http.SendAsync(
				CreateFindRequest(
					staffToken,
					limit: 1,
					sortId: "email",
					sortOrder: "asc",
					cursor: cursor
				)
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			FindResponse? page = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedEmails.AddRange(page.Data.Select(item => item.Email));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the tie-breaker/cursor filter regresses.
			_ = pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers the whole list: no row may repeat, and our three
		// rows must come out once each, in keyset order relative to each other.
		_ = visitedEmails.Should().OnlyHaveUniqueItems();
		_ = visitedEmails.Where(emails.Contains).Should().Equal(emails);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryAcceptedAtPageWithoutOverlapOrGapWithNullCoercion() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		string tag = Guid.NewGuid().ToString("N")[..8];

		// 3 pending invitations (null AcceptedAt) + 3 accepted with distinct
		// AcceptedAt values. The factory coerces null to DateTime.MinValue, so
		// pending rows must sort to the front in ascending order; the accepted
		// rows must keep their AcceptedAt order. This is the most subtle migrated
		// wiring (the ?? DateTime.MinValue substitution) and the one most likely
		// to regress silently.
		List<Guid> pendingIds = [];
		for (int i = 0; i < 3; i++) {
			pendingIds.Add(await CreateStaffInvitationAsync(
				staffToken,
				$"acc-null-{tag}-{i}-{Guid.NewGuid():N}@example.com"
			));
		}

		var acceptedSpecs = new List<(Guid Id, DateTime AcceptedAt)>();
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		for (int i = 0; i < 3; i++) {
			Guid id = await CreateStaffInvitationAsync(
				staffToken,
				$"acc-val-{tag}-{i}-{Guid.NewGuid():N}@example.com"
			);
			// Anti-correlated with insertion: i=0 -> +2d, i=1 -> +0d, i=2 -> +1d,
			// so the AcceptedAt sorted order is NOT the insertion order. A
			// keySelector swap to the id order turns the assertion below RED.
			DateTime acceptedAt = baseDate.AddDays((3 - i) % 3);
			await SetAcceptedAtAsync(id, acceptedAt);
			acceptedSpecs.Add((id, acceptedAt));
		}

		List<Guid> visitedIds = [];
		string? cursor = null;
		int pages = 0;
		do {
			using HttpResponseMessage response = await _http.SendAsync(
				CreateFindRequest(
					staffToken,
					limit: 1,
					sortId: "accepted_at",
					sortOrder: "asc",
					cursor: cursor
				)
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			FindResponse? page = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(item => item.Id));
			cursor = page.NextCursor;

			// Guard against an infinite loop if the tie-breaker/cursor filter regresses.
			_ = pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers the whole list: no row may repeat across pages.
		_ = visitedIds.Should().OnlyHaveUniqueItems();

		// Every one of our rows is visited exactly once.
		foreach (Guid id in pendingIds.Concat(acceptedSpecs.Select(s => s.Id))) {
			_ = visitedIds.Count(x => x == id).Should().Be(1);
		}

		// Pending (null AcceptedAt -> MinValue) rows precede every accepted row.
		int firstAcceptedPos = visitedIds.FindIndex(
			id => acceptedSpecs.Any(s => s.Id == id)
		);
		_ = firstAcceptedPos.Should().BeGreaterThanOrEqualTo(0);
		foreach (Guid pendingId in pendingIds) {
			_ = visitedIds.IndexOf(pendingId).Should().BeLessThan(firstAcceptedPos);
		}

		// Accepted rows appear in AcceptedAt ascending order relative to each other.
		List<Guid> expectedAcceptedOrder =
			acceptedSpecs.OrderBy(s => s.AcceptedAt).Select(s => s.Id).ToList();
		List<Guid> visitedAcceptedOrder = visitedIds
			.Where(id => acceptedSpecs.Any(s => s.Id == id))
			.ToList();
		_ = visitedAcceptedOrder.Should().Equal(expectedAcceptedOrder);
	}

	[Fact]
	public async Task
	ItShouldAcceptAnUppercaseSortId() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, limit: 5, sortId: "CREATED_AT")
		);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await _http.SendAsync(
			CreateFindRequest(staffToken, cursor: Guid.NewGuid().ToString())
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	private static HttpRequestMessage CreateFindRequest(
		string staffToken,
		string? status = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? cursor = null
	) {
		string url = GetFindUrl(status, limit, sortId, sortOrder, cursor);
		return new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);
	}

	private static string GetFindUrl(
		string? status = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? cursor = null
	) {
		var queryParams = new List<string>();

		if (status is not null) {
			queryParams.Add($"status={Uri.EscapeDataString(status)}");
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

		if (cursor is not null) {
			queryParams.Add($"cursor={Uri.EscapeDataString(cursor)}");
		}

		string url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			Routes.Invitations.ForStaff.Find
		);

		if (queryParams.Count == 0) {
			return url;
		}

		return $"{url}?{string.Join("&", queryParams)}";
	}

	private async Task<Guid> CreateStaffInvitationAsync(
		string staffToken,
		string email
	) {
		Guid profileId = await GetAnyStaffProfileIdAsync();
		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(Routes.Staff.Root, Routes.Invitations.ForStaff.Root)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			email,
			profileId = profileId.ToString()
		});

		using HttpResponseMessage response = await _http.SendAsync(request);
		_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

		InvitationCreatedResponse? body = await response.Content
			.ReadFromJsonAsync<InvitationCreatedResponse>();
		_ = body.Should().NotBeNull();

		return body?.InvitationId ?? Guid.Empty;
	}

	private async Task RevokeStaffInvitationAsync(
		string staffToken,
		Guid invitationId
	) {
		string url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			Routes.Invitations.ForStaff.RevokeByIdFn(invitationId.ToString())
		);
		HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Delete, url)
			.WithSessionToken(staffToken);

		using HttpResponseMessage response = await _http.SendAsync(request);
		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task MarkStaffInvitationAcceptedAsync(Guid invitationId) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Invitation? invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstOrDefaultAsync();
		_ = invitation.Should().NotBeNull();
		if (invitation is null) {
			return;
		}

		invitation.Status = InvitationStatus.Accepted;
		invitation.AcceptedAt = DateTime.UtcNow;

		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<Guid> CreateExpiredStaffInvitationAsync(string email) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Profile staffProfile = await dbContext.Profile
			.Where(profile =>
				profile.Scope == ProfileScope.Staff
				&& !profile.IsDeleted
			)
			.OrderBy(profile => profile.Name)
			.FirstAsync();
		User staffUser = await dbContext.User
			.Where(user => user.Email == SeedConstants.Staff.AdminEmail)
			.FirstAsync();

		Invitation invitation = Invitation.CreateStaffInvitationWithProfiles(
			email,
			[staffProfile.GetRequiredId()],
			staffUser.GetRequiredId(),
			DateTime.UtcNow.AddDays(-1),
			Guid.NewGuid().ToString("N")[..32]
		);

		_ = await dbContext.Invitation.AddAsync(invitation);
		_ = await dbContext.SaveChangesAsync();

		return invitation.GetRequiredId();
	}

	private async Task SetAcceptedAtAsync(Guid invitationId, DateTime acceptedAt) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Invitation? invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstOrDefaultAsync();
		_ = invitation.Should().NotBeNull();
		if (invitation is null) {
			return;
		}

		invitation.AcceptedAt = acceptedAt;

		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<Guid> GetAnyStaffProfileIdAsync() {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Profile profile = await dbContext.Profile
			.Where(profile =>
				profile.Scope == ProfileScope.Staff
				&& !profile.IsDeleted
			)
			.OrderBy(profile => profile.Name)
			.FirstAsync();

		return profile.GetRequiredId();
	}

	private sealed record FindResponse {
		public List<InvitationListItemDto> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record InvitationListItemDto {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string Scope { get; init; } = string.Empty;
		public string ProfileName { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
		public DateTime ExpiresAt { get; init; }
		public DateTime? AcceptedAt { get; init; }
		public DateTime CreatedAt { get; init; }
		public string? InvitedByName { get; init; }
	}

	private sealed record InvitationCreatedResponse {
		public Guid InvitationId { get; init; }
	}
}
