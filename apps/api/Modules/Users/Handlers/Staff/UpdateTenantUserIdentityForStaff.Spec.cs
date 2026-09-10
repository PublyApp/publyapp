
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

public sealed class UpdateTenantUserIdentityForStaffSpec
	: IClassFixture<ApiFixture> {
	private static readonly JsonSerializerOptions _TenantUserDetailsJsonOptions = new() {
		PropertyNameCaseInsensitive = true,
	};

	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public UpdateTenantUserIdentityForStaffSpec(ApiFixture fixture) {
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
	ItShouldUpdateTenantUserIdentityWhenFieldsAreValid() {
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

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new {
				firstName = "Tenant",
				lastName = "Identity"
			}
		);

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
		result.FirstName.Should().Be("Tenant");
		result.LastName.Should().Be("Identity");
		result.CompanyCount.Should().Be(1);

		var document = JsonDocument.Parse(json);
		document.RootElement.TryGetProperty(
			"companies",
			out _
		).Should().BeFalse();

		await _ResetUserNameAsync(staffToken, userId);
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantUserIdentityWhenNoLiveCompaniesRemain() {
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

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new {
				firstName = "Zero",
				lastName = "Companies"
			}
		);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Id.ToString().Should().Be(userId);
		result.FirstName.Should().Be("Zero");
		result.LastName.Should().Be("Companies");
		result.CompanyCount.Should().Be(0);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenNoFieldsAreProvided() {
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

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new { });

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenFirstNameExceedsMaxLength() {
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

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { firstName = new string('a', 129) }
		);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("FirstName");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenAvatarUrlExceedsMaxLength() {
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

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new {
				avatarUrl =
					$"https://example.com/{new string('a', 1025)}"
			}
		);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("AvatarUrl");
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenUserIdIsMalformed() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl("not-a-guid")
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { firstName = "Test" }
		);

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

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { firstName = "Test" }
		);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	private async Task _ResetUserNameAsync(
		string staffToken,
		string userId
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new {
				firstName = "User",
				lastName = "Acme"
			}
		);

		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
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
		public int CompanyCount { get; init; }
	}
}
