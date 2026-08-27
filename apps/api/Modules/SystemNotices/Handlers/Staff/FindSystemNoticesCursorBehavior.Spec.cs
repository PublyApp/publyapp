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
using PublyApp.Api.Modules.SystemNotices.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

/// <summary>
/// Behaviour-pinning specs for the shared cursor-pagination contract of
/// <c>SystemNoticeService.FindAsync</c> (#220 refactor safety net):
/// a cursor pointing at a deleted/missing notice stays a transparent 400,
/// uppercase <c>sort_id</c> values stay case-insensitive, and a full
/// multi-page walk sees every row exactly once (the contract that
/// matters for a keyset cursor).
/// </summary>
public sealed class FindSystemNoticesCursorBehaviorSpec
	: IClassFixture<ApiFixture> {
	private static readonly string FindUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.SystemNotices.ForStaff.Root,
		Routes.SystemNotices.ForStaff.Find
	);

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindSystemNoticesCursorBehaviorSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var staffUserId = await GetStaffAdminIdAsync();

		// 3 notices with distinct, deliberately NOT insertion-ordered
		// CreatedAt (anti-correlated with insertion). The walk must visit each
		// once in ascending CreatedAt order, not in insertion order, so a
		// keySelector swap to another same-type field (e.g. StartsAt or
		// UpdatedAt) turns this assertion RED.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			var id = await SeedNoticeAtAsync(
				staffUserId,
				$"notice-walk-{i}-{Guid.NewGuid():N}",
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
			var url = FindUrl
				+ "?limit=1&sort_id=created_at&sort_order=asc";
			if (cursor is not null) {
				url += $"&cursor={Uri.EscapeDataString(cursor)}";
			}

			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindSystemNoticesResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(notice => notice.Id));
			visitedCreatedAtOrder.AddRange(page.Data.Select(notice => notice.CreatedAt));
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
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var url = FindUrl + $"?cursor={Guid.NewGuid()}";
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

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
		var token = await _authClient.LoginAsStaffAdminAsync();

		var url = FindUrl + "?limit=5&sort_id=CREATED_AT";
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<Guid> GetStaffAdminIdAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.Where(u => u.Email == SeedConstants.Staff.AdminEmail)
			.FirstAsync();
		return user.GetRequiredId();
	}

	private async Task<Guid> SeedNoticeAtAsync(
		Guid staffUserId,
		string title,
		DateTime createdAt
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var notice = new SystemNotice {
			Severity = NoticeSeverity.Info,
			Title = title,
			Message = "walk seed",
			StartsAt = createdAt,
			CreatedByStaffId = staffUserId,
		};
		// Insert first (interceptor stamps CreatedAt/UpdatedAt = now), then
		// re-fetch and overwrite CreatedAt as a Modified row. On Modified the
		// interceptor only touches UpdatedAt, so the seeded CreatedAt sticks.
		await dbContext.SystemNotice.AddAsync(notice);
		await dbContext.SaveChangesAsync();
		var id = notice.GetRequiredId();

		var tracked = await dbContext.SystemNotice
			.Where(n => n.Id == id)
			.FirstAsync();
		tracked.CreatedAt = createdAt;
		await dbContext.SaveChangesAsync();

		return id;
	}

	private sealed record FindSystemNoticesResponse {
		public List<SystemNoticeItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record SystemNoticeItem {
		public Guid Id { get; init; }
		public DateTime CreatedAt { get; init; }
	}
}
