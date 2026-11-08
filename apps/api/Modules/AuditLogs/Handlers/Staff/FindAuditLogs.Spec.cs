
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Reflection;

using FluentAssertions;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.AuditLogs.Entities;

using Xunit;

using FromQueryAttribute = Microsoft.AspNetCore.Mvc.FromQueryAttribute;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

public sealed class FindAuditLogsSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;
	private readonly ApiFixture _Fixture;
	public static TheoryData<string> MalformedActionsCsv {
		get {
			return new() {
			",",
			$"{AuditActions.LoginSucceeded},",
			$"{AuditActions.LoginSucceeded},,"
				+ AuditActions.InvitationCreated,
		};
		}
	}

	public static TheoryData<string, string> QueryParameterNames {
		get {
			return new() {
			{ nameof(FindAuditLogsQuery.UserId), "user_id" },
			{ nameof(FindAuditLogsQuery.Actions), "actions" },
			{ nameof(FindAuditLogsQuery.TargetId), "target_id" },
			{ nameof(FindAuditLogsQuery.StartDate), "start_date" },
			{ nameof(FindAuditLogsQuery.EndDate), "end_date" },
		};
		}
	}

	public FindAuditLogsSpec(ApiFixture fixture) {
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
		this._Fixture = fixture;
	}

	[Theory]
	[MemberData(nameof(FindAuditLogsSpec.QueryParameterNames))]
	public void
	ItShouldDeclareSnakeCaseQueryParameterNames(
		string propertyName,
		string expectedName
	) {
		var property = typeof(FindAuditLogsQuery)
			.GetProperty(propertyName);
		var attribute = property?
			.GetCustomAttribute<FromQueryAttribute>();

		attribute.Should().NotBeNull();
		if (attribute is null) {
			return;
		}
		attribute.Name.Should().Be(expectedName);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithDefaultPagination() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		var logId =
			await AuditLogTestHelper
				.SeedAuditLogAsync(
					this._Fixture.Factory,
					userId,
					AuditActions.InvitationCreated
				);

		var url = AuditLogTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().NotBeNull();
		result.Data.Should().Contain(
			a => a.Id == logId
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNextCursorWhenMoreResultsExist() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		for (var i = 0; i < 3; i++) {
			await AuditLogTestHelper.SeedAuditLogAsync(
				this._Fixture.Factory,
				userId,
				AuditActions.LoginSucceeded
			);
		}

		var url = AuditLogTestHelper.GetFindUrl(
			limit: 2
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Count.Should().Be(2);
		result.NextCursor.Should()
			.NotBeNullOrEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnWholeHistoryCountsForTheStatCardsAndPanels() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		// A fresh actor, so its panel counter is exactly what this test seeds;
		// the action and window figures only have to contain the new rows.
		var marker = $"counts-{Guid.NewGuid():N}";
		var actorId = await StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			$"{marker}@example.com",
			firstName: marker,
			lastName: "Actor"
		);

		for (var index = 0; index < 2; index++) {
			await AuditLogTestHelper.SeedAuditLogAsync(
				this._Fixture.Factory,
				actorId,
				AuditActions.LoginFailed
			);
		}

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			AuditLogTestHelper.GetFindUrl(limit: 1)
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// The figures are whole-history facets, not the page's own length.
		result.Data.Should().HaveCount(1);
		result.Counts.Today.Should().BeGreaterOrEqualTo(2);
		result.Counts.Last30Days
			.Should().BeGreaterOrEqualTo(result.Counts.Today);
		result.Counts.ByAction
			.Should()
			.Contain(count =>
				count.Action == AuditActions.LoginFailed
				&& count.Count >= 2
			);
		var actorRow = result.Counts.ByActor
			.Should()
			.ContainSingle(count =>
				count.UserId == actorId
			)
			.Subject;
		actorRow.Name.Should().Be($"{marker} Actor");
		actorRow.Count.Should().Be(2);
	}

	[Fact]
	public async Task
	ItShouldScopeByActionFacetToTheRequestedWindow() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var actorId =
			await AuditLogTestHelper.GetUserIdByEmailAsync(
				this._Fixture.Factory,
				TestConstants.StaffAdminEmail
			);

		// One row inside the window, one outside it. Both are the same
		// action, so the only thing separating them is the period.
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			actorId,
			AuditActions.PostCreated,
			createdAt: new DateTime(
				2019, 5, 2, 12, 0, 0, DateTimeKind.Utc
			)
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			actorId,
			AuditActions.PostCreated,
			createdAt: new DateTime(
				2019, 5, 10, 12, 0, 0, DateTimeKind.Utc
			)
		);

		var scoped = await this._GetCountsAsync(
			AuditLogTestHelper.GetFindUrl(
				startDate: "2019-05-01",
				endDate: "2019-05-03"
			),
			token
		);
		var scopedRow = scoped.ByAction
			.Should()
			.ContainSingle(count =>
				count.Action == AuditActions.PostCreated
			)
			.Subject;
		scopedRow.Count.Should().Be(1);

		var unscoped = await this._GetCountsAsync(
			AuditLogTestHelper.GetFindUrl(),
			token
		);
		var unscopedRow = unscoped.ByAction
			.Should()
			.ContainSingle(count =>
				count.Action == AuditActions.PostCreated
			)
			.Subject;
		unscopedRow.Count.Should().BeGreaterOrEqualTo(2);
	}

	private async Task<AuditLogCounts> _GetCountsAsync(
		string url,
		string token
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(
				HttpStatusCode.OK,
				await response.Content.ReadAsStringAsync()
			);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		return result.Counts;
	}

	[Fact]
	public async Task
	ItShouldFilterByAction() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			userId,
			AuditActions.TenantSuspended
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			userId,
			AuditActions.TenantReactivated
		);

		var url = AuditLogTestHelper.GetFindUrl(
			actions: [AuditActions.TenantSuspended]
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().AllSatisfy(
					a => a.Action.Should()
						.Be(AuditActions.TenantSuspended)
				);
	}

	[Fact]
	public async Task
	ItShouldFilterByMultipleActionsWhenActionsProvided() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		var firstLogId =
			await AuditLogTestHelper.SeedAuditLogAsync(
				this._Fixture.Factory,
				userId,
				AuditActions.LoginSucceeded
			);
		var secondLogId =
			await AuditLogTestHelper.SeedAuditLogAsync(
				this._Fixture.Factory,
				userId,
				AuditActions.InvitationCreated
			);
		var thirdLogId =
			await AuditLogTestHelper.SeedAuditLogAsync(
				this._Fixture.Factory,
				userId,
				AuditActions.TenantSuspended
			);

		var url = AuditLogTestHelper.GetFindUrl(
			actions: [
				AuditActions.LoginSucceeded,
				AuditActions.InvitationCreated,
			]
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().Contain(
					a => a.Id == firstLogId
				);
		result.Data.Should().Contain(
			a => a.Id == secondLogId
		);
		result.Data.Should().NotContain(
			a => a.Id == thirdLogId
		);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenAnyActionIsUnknown() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			actions: [
				AuditActions.LoginSucceeded,
				"totally.fake",
			]
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("actions");
		problem.Errors.Should().NotContainKey(string.Empty);
	}

	[Theory]
	[MemberData(nameof(FindAuditLogsSpec.MalformedActionsCsv))]
	public async Task
	ItShouldReturn422WithActionsErrorWhenActionsCsvContainsEmptyToken(
		string actions
	) {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl()
			+ "?actions="
			+ Uri.EscapeDataString(actions);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("actions");
		problem.Errors.Should().NotContainKey(string.Empty);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenMoreActionsThanTheRegistryHoldsAreProvided() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		// The bound is the registry's own size — a category selection may
		// already list more than the old fixed 50 (#2286).
		var actions = new List<string>();
		for (var i = 0; i <= AuditActionsRegistry.All.Count; i++) {
			actions.Add(AuditActions.LoginSucceeded);
		}

		var url = AuditLogTestHelper.GetFindUrl(
			actions: actions
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("actions");
		problem.Errors.Should().NotContainKey(string.Empty);
	}

	[Fact]
	public async Task
	ItShouldReturnWireNamedMessagesForQueryValidationErrors() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl()
			+ "?user_id=abc&start_date=not-a-date";
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors["user_id"].Should()
			.Contain("user_id must be a valid GUID");
		problem.Errors["start_date"].Should()
			.Contain("start_date must be a valid ISO 8601 date");
	}

	[Fact]
	public async Task
	ItShouldFilterByUserId() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			userId,
			AuditActions.SystemNoticeCreated
		);

		var url = AuditLogTestHelper.GetFindUrl(
			userId: userId.ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().AllSatisfy(
					a => a.UserId.Should().Be(userId)
				);
	}

	[Fact]
	public async Task
	ItShouldFilterByDateRange() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			this._Fixture.Factory,
			userId,
			AuditActions.ImpersonationStarted
		);

		var now = DateTime.UtcNow;
		var startDate = now
			.AddMinutes(-5).ToString("o");
		var endDate = now
			.AddMinutes(5).ToString("o");

		var url = AuditLogTestHelper.GetFindUrl(
			startDate: startDate,
			endDate: endDate
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldAcceptDateOnlyStartDateAndFilterAsUtc() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					this._Fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		var logId =
			await AuditLogTestHelper
				.SeedAuditLogAsync(
					this._Fixture.Factory,
					userId,
					AuditActions.ImpersonationStarted
				);

		// The dashboard sends a date-only start_date (its wire form). It must
		// be read as UTC midnight: an Unspecified DateTime is rejected by
		// Npgsql for a timestamptz column, which surfaced as a 500.
		var yesterday = DateTime.UtcNow
			.AddDays(-1).ToString(
				"yyyy-MM-dd",
				CultureInfo.InvariantCulture
			);
		var tomorrow = DateTime.UtcNow
			.AddDays(1).ToString(
				"yyyy-MM-dd",
				CultureInfo.InvariantCulture
			);

		var startRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AuditLogTestHelper.GetFindUrl(
				startDate: yesterday,
				limit: 1
			)
		).WithSessionToken(token);

		using var startResponse =
			await this._Http.SendAsync(startRequest);

		startResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var startResult = await startResponse.Content
			.ReadFromJsonAsync<FindResponse>();
		startResult.Should().NotBeNull();
		Assert.NotNull(startResult);
		startResult.Data.Should()
			.Contain(a => a.Id == logId);

		var futureRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AuditLogTestHelper.GetFindUrl(
				startDate: tomorrow,
				limit: 1
			)
		).WithSessionToken(token);

		using var futureResponse =
			await this._Http.SendAsync(futureRequest);

		futureResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var futureResult = await futureResponse.Content
			.ReadFromJsonAsync<FindResponse>();
		futureResult.Should().NotBeNull();
		Assert.NotNull(futureResult);
		futureResult.Data.Should()
			.NotContain(a => a.Id == logId);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForInvalidCursor() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			cursor: "not-a-guid"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenStartDateAfterEndDate() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			startDate: "2025-12-31T00:00:00Z",
			endDate: "2025-01-01T00:00:00Z"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("start_date");
		problem.Errors.Should().NotContainKey(string.Empty);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenStartDateIsMalformed() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			startDate: "not-a-date"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenUserIdIsNotValidGuid() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			userId: "abc"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url = AuditLogTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await this._AuthClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = AuditLogTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await this._AuthClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = AuditLogTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	private record FindResponse {
		public List<AuditLogListItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
		public AuditLogCounts Counts { get; init; } = new();
	}

	private record AuditLogCounts {
		public int Today { get; init; }
		public int Last30Days { get; init; }
		public List<AuditLogActionCount> ByAction { get; init; } = [];
		public List<AuditLogActorCount> ByActor { get; init; } = [];
	}

	private record AuditLogActionCount {
		public string Action { get; init; } = string.Empty;
		public int Count { get; init; }
	}

	private record AuditLogActorCount {
		public Guid UserId { get; init; }
		public string Name { get; init; } = string.Empty;
		public int Count { get; init; }
	}

	private record AuditLogListItem {
		public Guid Id { get; init; }
		public Guid UserId { get; init; }
		public string UserName { get; init; }
			= string.Empty;
		public string UserEmail { get; init; }
			= string.Empty;
		public string Action { get; init; }
			= string.Empty;
		public Guid? TargetId { get; init; }
		public string? IpAddress { get; init; }
		public DateTime CreatedAt { get; init; }
	}
}
