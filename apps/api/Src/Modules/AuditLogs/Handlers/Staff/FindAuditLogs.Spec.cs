namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Modules.AuditLogs.Entities;

using Xunit;

public sealed class FindAuditLogsSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;
	private readonly ApiFixture _fixture;

	public FindAuditLogsSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithDefaultPagination() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		var logId =
			await AuditLogTestHelper
				.SeedAuditLogAsync(
					_fixture.Factory,
					userId,
					AuditActions.InvitationCreated
				);

		var url = AuditLogTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().NotBeNull();
		result.Data.Should().Contain(
			a => a.Id == logId
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNextCursorWhenMoreResultsExist() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		for (var i = 0; i < 3; i++) {
			await AuditLogTestHelper.SeedAuditLogAsync(
				_fixture.Factory,
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
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Count.Should().Be(2);
		result.NextCursor.Should()
			.NotBeNullOrEmpty();
	}

	[Fact]
	public async Task
	ItShouldFilterByAction() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			AuditActions.TenantSuspended
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			AuditActions.TenantReactivated
		);

		var url = AuditLogTestHelper.GetFindUrl(
			action: AuditActions.TenantSuspended
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().AllSatisfy(
			a => a.Action.Should()
				.Be(AuditActions.TenantSuspended)
		);
	}

	[Fact]
	public async Task
	ItShouldFilterByUserId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
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
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().AllSatisfy(
			a => a.UserId.Should().Be(userId)
		);
	}

	[Fact]
	public async Task
	ItShouldFilterByDateRange() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
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
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForInvalidCursor() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			cursor: "not-a-guid"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenStartDateAfterEndDate() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			startDate: "2025-12-31T00:00:00Z",
			endDate: "2025-01-01T00:00:00Z"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenStartDateIsMalformed() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			startDate: "not-a-date"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenUserIdIsNotValidGuid() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			userId: "abc"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

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
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = AuditLogTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = AuditLogTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	private record FindResponse {
		public List<AuditLogListItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
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
