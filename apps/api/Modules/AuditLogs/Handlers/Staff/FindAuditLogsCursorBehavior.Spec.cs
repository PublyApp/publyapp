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
using PublyApp.Api.Modules.AuditLogs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

/// <summary>
/// Behaviour-pinning specs for the shared cursor-pagination contract of
/// <c>AuditLogQueryService.FindAsync</c> (#220 refactor safety net).
/// The service keeps its sort-handler table local; these tests anchor the
/// wire behaviour that must not move while the table is refactored:
/// a cursor pointing at a deleted/missing row is a transparent 400,
/// uppercase <c>sort_id</c> values stay case-insensitive, and a full
/// multi-page walk sees every row exactly once (the contract that
/// matters for a keyset cursor).
/// </summary>
public sealed class FindAuditLogsCursorBehaviorSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindAuditLogsCursorBehaviorSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var staffUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_fixture.Factory,
			SeedConstants.Staff.AdminEmail
		);

		// 3 logs with distinct CreatedAt; the walk must visit each once in
		// ascending CreatedAt order with no gap or duplicate.
		var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		var seededIds = new List<Guid>();
		for (var i = 0; i < 3; i++) {
			seededIds.Add(await SeedAuditLogAtAsync(
				staffUserId,
				$"audit-walk-{i}-{Guid.NewGuid():N}",
				baseDate.AddDays(i)
			));
		}

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = AuditLogTestHelper.GetFindUrl(
				limit: 1,
				sortId: "created_at",
				sortOrder: "asc",
				cursor: cursor
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindAuditLogsResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(page.Data.Select(log => log.Id));
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
		var token = await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			cursor: Guid.NewGuid().ToString()
		);
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

		var url = AuditLogTestHelper.GetFindUrl(
			limit: 5,
			sortId: "CREATED_AT"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<Guid> SeedAuditLogAtAsync(
		Guid userId,
		string action,
		DateTime createdAt
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var log = new AuditLog {
			UserId = userId,
			Action = action,
			TargetId = null,
			Details = null,
			IpAddress = "127.0.0.1",
			UserAgent = "test-agent",
		};
		log.CreatedAt = createdAt;

		await dbContext.AuditLog.AddAsync(log);
		await dbContext.SaveChangesAsync();

		return log.GetRequiredId();
	}

	private sealed record FindAuditLogsResponse {
		public List<AuditLogItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record AuditLogItem {
		public Guid Id { get; init; }
		public DateTime CreatedAt { get; init; }
	}
}
