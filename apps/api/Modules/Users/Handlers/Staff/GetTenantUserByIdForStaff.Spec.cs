
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class GetTenantUserByIdForStaffSpec
	: IClassFixture<ApiFixture> {
	private static readonly JsonSerializerOptions _TenantUserDetailsJsonOptions = new() {
		PropertyNameCaseInsensitive = true,
	};

	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetTenantUserByIdForStaffSpec(ApiFixture fixture) {
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			"/tenant-users",
			$"/{userId}"
		);
	}

	private static string _GetRemoveUrl(
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

	[Fact]
	public async Task
	ItShouldReturnTenantUserDetailsWithoutEmbeddedCompaniesWhenTenantUserExists() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await _GetUserIdByEmailAsync(
			_Http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var json = await response.Content.ReadAsStringAsync();
		var result = JsonSerializer.Deserialize<TenantUserDetailsResponse>(
			json,
			_TenantUserDetailsJsonOptions
		);
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Id.ToString().Should().Be(userId);
		result.Email.Should().Be(TestConstants.AcmeUserEmail);
		result.Status.Should().NotBeNullOrWhiteSpace();
		result.CreatedAt.Should().NotBe(default);
		result.UpdatedAt.Should().NotBe(default);
		result.CompanyCount.Should().Be(1);

		var document = JsonDocument.Parse(json);
		document.Should().NotBeNull();
		document.RootElement.TryGetProperty(
			"companies",
			out _
		).Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnTenantUserDetailsWhenLastCompanyMembershipWasRemoved() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var techStartTenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);
		var globalTenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);
		var userId = await _GetUserIdByEmailAsync(
			_Http,
			staffToken,
			techStartTenantId,
			SeedConstants.CrossTenant.BobEmail
		);

		// Removing every live membership should not be interpreted as deleting
		// the shared tenant-user identity page.
		await _RemoveTenantMembershipAsync(
			staffToken,
			techStartTenantId,
			userId
		);
		await _RemoveTenantMembershipAsync(
			staffToken,
			globalTenantId,
			userId
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Id.ToString().Should().Be(userId);
		result.Email.Should().Be(SeedConstants.CrossTenant.BobEmail);
		result.CompanyCount.Should().Be(0);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenUserIdIsMalformed() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl("not-a-guid")
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenUserDoesNotExist() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);

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
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await _GetUserIdByEmailAsync(
			_Http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);
		var tenantToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(userId)
		).WithSessionToken(tenantToken);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static async Task<string> _GetUserIdByEmailAsync(
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

	private async Task _RemoveTenantMembershipAsync(
		string staffToken,
		Guid tenantId,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetRemoveUrl(tenantId, userId)
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private sealed record FindUsersResponse {
		public List<TenantUserItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record TenantUserItem {
		public string Id { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
	}

	private sealed record TenantUserDetailsResponse {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string? FirstName { get; init; }
		public string? LastName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Status { get; init; } = string.Empty;
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
		public int CompanyCount { get; init; }
	}
}
