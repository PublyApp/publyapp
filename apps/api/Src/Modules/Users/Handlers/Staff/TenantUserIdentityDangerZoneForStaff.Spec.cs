namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class TenantUserIdentityDangerZoneForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantUserIdentityDangerZoneForStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetDetailsUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			"/tenant-users",
			$"/{userId}"
		);
	}

	private static string GetEmailUrl(string userId) {
		return PathUtils.Join(
			GetDetailsUrl(userId),
			"/email"
		);
	}

	private static string GetSuspendUrl(string userId) {
		return PathUtils.Join(
			GetDetailsUrl(userId),
			"/suspend"
		);
	}

	private static string GetReactivateUrl(string userId) {
		return PathUtils.Join(
			GetDetailsUrl(userId),
			"/reactivate"
		);
	}

	[Fact]
	public async Task
	ItShouldGloballySuspendAndReactivateTenantUserIdentity() {
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

		using var suspendRequest = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(userId)
		).WithSessionToken(staffToken);
		using var suspendResponse = await _http.SendAsync(suspendRequest);

		suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var suspendedResult = await suspendResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		suspendedResult.Should().NotBeNull();
		suspendedResult!.Status.Should().Be("Suspended");

		using var detailsRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetDetailsUrl(userId)
		).WithSessionToken(staffToken);
		using var detailsResponse = await _http.SendAsync(detailsRequest);
		var details = await detailsResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		details.Should().NotBeNull();
		details!.Status.Should().Be("Suspended");

		using var reactivateRequest = new HttpRequestMessage(
			HttpMethod.Post,
			GetReactivateUrl(userId)
		).WithSessionToken(staffToken);
		using var reactivateResponse =
			await _http.SendAsync(reactivateRequest);

		reactivateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var reactivatedResult = await reactivateResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		reactivatedResult.Should().NotBeNull();
		reactivatedResult!.Status.Should().Be("Active");
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantUserIdentityEmail() {
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
		var newEmail = $"tenant-user-email-{Guid.NewGuid():N}@example.com";

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetEmailUrl(userId)
			).WithSessionToken(staffToken);
			request.Content = JsonContent.Create(new { email = newEmail });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<TenantUserDetailsResponse>();
			result.Should().NotBeNull();
			result!.Id.ToString().Should().Be(userId);
			result.Email.Should().Be(newEmail);
		} finally {
			using var resetRequest = new HttpRequestMessage(
				HttpMethod.Patch,
				GetEmailUrl(userId)
			).WithSessionToken(staffToken);
			resetRequest.Content = JsonContent.Create(
				new { email = TestConstants.AcmeUserEmail }
			);

			using var resetResponse = await _http.SendAsync(resetRequest);
			if (resetResponse.StatusCode != HttpStatusCode.NotFound) {
				resetResponse.EnsureSuccessStatusCode();
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnValidationProblemWhenTenantUserEmailIsAlreadyInUse() {
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
			HttpMethod.Patch,
			GetEmailUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = TestConstants.StaffAdminEmail }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.EmailAlreadyInUse);
		problem.Errors.Should().ContainKey("email");
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
			HttpMethod.Get,
			url
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
		public string Status { get; init; } = string.Empty;
	}
}
