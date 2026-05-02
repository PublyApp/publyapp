using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

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
		result!.Data.Should().Contain(user =>
			string.Equals(user.Email, alphaEmail, StringComparison.OrdinalIgnoreCase)
		);
		result.Data.Should().NotContain(user =>
			string.Equals(user.Email, betaEmail, StringComparison.OrdinalIgnoreCase)
		);
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
		result!.Data.Should().ContainSingle(user => user.Id == suspendedId);
		result.Data.Should().NotContain(user => user.Id == activeId);
	}

	[Fact]
	public async Task ItShouldReturnPendingStatusForNewlyCreatedStaffUsers() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var email = $"pending-{Guid.NewGuid():N}@example.com";

		var userId = await CreateStaffUserAsync(token, email);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(limit: 50, status: "pending")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().ContainSingle(user =>
			user.Id == userId
			&& string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase)
			&& user.Status == "Pending"
		);
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
		problem!.Errors.Should().ContainKey("Status");
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
		problem!.Errors.Should().ContainKey("Status");
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
		problem!.Errors.Should().ContainKey("Status");
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
		firstResult!.Data.Should().HaveCount(1);
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
		secondResult!.Data.Should().HaveCount(1);
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
		problem!.Status.Should().Be((int)HttpStatusCode.BadRequest);
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
		problem!.Status.Should().Be((int)HttpStatusCode.BadRequest);
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
		problem!.Status.Should().Be((int)HttpStatusCode.BadRequest);
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
		result!.Data.Should().Contain(user =>
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
		result!.Data.Should().NotContain(user =>
			string.Equals(user.Email, deletedUserEmail, StringComparison.OrdinalIgnoreCase)
		);
		result.Data.Should().NotContain(user =>
			string.Equals(user.Email, deletedAccountEmail, StringComparison.OrdinalIgnoreCase)
		);
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
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.Create
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email,
				lastName = "Staff",
				firstName = "Test",
				avatarUrl = (string?)null,
				accountLevel = "User",
				sendNotification = false,
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<CreateStaffUserResponse>();
		created.Should().NotBeNull();
		return created!.Id;
	}

	private async Task SetStaffUserStatusAsync(Guid userId, UserStatus status) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = await dbContext.User.FirstAsync(u => u.Id == userId);
		user.Status = status;

		await dbContext.SaveChangesAsync();
	}

	private async Task SetStaffUserDeletedStateAsync(
		Guid userId,
		bool deleteUser = false,
		bool deleteAccount = false
	) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = await dbContext.User.FirstAsync(u => u.Id == userId);
		var account = await dbContext.UserAccount.FirstAsync(ua =>
			ua.UserId == user.Id && ua.Scope == AccountScope.Staff
		);

		user.IsDeleted = deleteUser;
		account.IsDeleted = deleteAccount;

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

	private record CreateStaffUserResponse {
		public Guid Id { get; init; }
		public Guid AccountId { get; init; }
	}

	private static async Task<AppProblemDetails?> ReadProblemAsync(
		HttpResponseMessage response
	) {
		return await response.Content.ReadFromJsonAsync<AppProblemDetails>();
	}
}
