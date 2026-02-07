namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing;

using Xunit;

public sealed class GetTenantAuthDataIntegrationTests
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantAuthDataIntegrationTests(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	TenantAuthData_ActiveTenant_ReturnsOk() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetTenantAuthData}"
			+ $"?tenantId={acmeId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<TenantAuthDataResponse>();
		result.Should().NotBeNull();
		result!.Id.Should().Be(acmeId);
		result.Code.Should().Be(
			SeedConstants.Tenants.AcmeCode
		);
		result.Name.Should().Be(
			SeedConstants.Tenants.AcmeName
		);
		result.IsAdmin.Should().BeTrue();
	}

	[Fact]
	public async Task
	TenantAuthData_StaffScope_ReturnsStaffData() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		var url = $"{Routes.Auth.GetTenantAuthData}"
			+ "?tenantId=staff";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<StaffAuthDataResponse>();
		result.Should().NotBeNull();
		result!.Code.Should().Be("staff");
		result.IsAdmin.Should().BeTrue();
	}

	[Fact]
	public async Task
	TenantAuthData_StaffScope_NonStaff_ReturnsForbidden() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetTenantAuthData}"
			+ "?tenantId=staff";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("not-a-staff-user");
	}

	[Fact]
	public async Task
	TenantAuthData_InvalidGuidTenantId_ReturnsForbidden() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetTenantAuthData}"
			+ "?tenantId=not-a-valid-guid";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	TenantAuthData_SuspendedTenant_Returns403WithKey() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var acmeAdminToken =
				await _authClient.LoginAsync(
					TestConstants.AcmeAdminEmail,
					TestConstants.SeedPassword
				);

			var url = $"{Routes.Auth.GetTenantAuthData}"
				+ $"?tenantId={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(acmeAdminToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);

			var problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			problem.Should().NotBeNull();
			problem!.TranslationKey.Should()
				.Be("tenant-suspended");
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	TenantAuthData_NonMember_ReturnsGeneric403() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Acme admin is NOT a member of TechStart
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetTenantAuthData}"
			+ $"?tenantId={techStartId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		// Non-member: generic forbidden, NOT
		// "tenant-suspended"
		problem!.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	TenantAuthData_AfterReactivation_ReturnsOk() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend then reactivate
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		using var reactivate =
			await TenantTestHelper.ReactivateTenantAsync(
				_http, staffToken, acmeId
			);
		reactivate.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now access should work again
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetTenantAuthData}"
			+ $"?tenantId={acmeId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private record TenantAuthDataResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Code { get; init; } = string.Empty;
		public string AccountLevel { get; init; }
			= string.Empty;
		public bool IsAdmin { get; init; }
		public List<string> Permissions { get; init; } = [];
	}

	private record StaffAuthDataResponse {
		public string Code { get; init; } = string.Empty;
		public string AccountLevel { get; init; }
			= string.Empty;
		public bool IsAdmin { get; init; }
		public List<string> Permissions { get; init; } = [];
	}
}
