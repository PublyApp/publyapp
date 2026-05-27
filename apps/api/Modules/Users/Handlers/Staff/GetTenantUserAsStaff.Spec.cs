
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Data.Seeding;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Localization;

using Xunit;

namespace MainApi.Modules.Users.Handlers.Staff;
public sealed class GetTenantUserAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantUserAsStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(
		string tenantId,
		string userId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.GetByIdFn(tenantId, userId)
		);
	}

	[Fact]
	public async Task
	ItShouldReturnTenantUserWhenMembershipExists() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		result.Should().NotBeNull();
		result!.Id.ToString().Should().Be(userId);
		result.TenantId.Should().Be(tenantId);
		result.Email.Should().Be(TestConstants.AcmeUserEmail);
		result.Level.Should().NotBeNullOrWhiteSpace();
		result.Status.Should().NotBeNullOrWhiteSpace();
		result.CreatedAt.Should().NotBe(default);
		result.UpdatedAt.Should().NotBe(default);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenUserIdIsMalformed() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenMembershipDoesNotExist() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.NotFound);
		problem.Detail.Should().Be("User not found in tenant");
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), userId)
		).WithSessionToken(tenantToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static async Task<string> GetUserIdByEmailAsync(
		HttpClient http,
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
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response = await http.SendAsync(request);
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

	private sealed record FindUsersResponse {
		public List<TenantUserItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record TenantUserItem {
		public string Id { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}

	private sealed record TenantUserDetailsResponse {
		public Guid Id { get; init; }
		public Guid TenantId { get; init; }
		public string Email { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
