namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class DeleteTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public DeleteTenantAsStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.DeleteFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldSoftDeleteSuspendedTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);

		// Suspend first (precondition for delete)
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspendResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Delete the suspended tenant
		using var deleteResponse =
			await TenantTestHelper.DeleteTenantAsync(
				_http, staffToken, tenantId
			);

		deleteResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await deleteResponse.Content
			.ReadFromJsonAsync<ApiResponse>();
		result.Should().NotBeNull();
		result!.Key.Should()
			.Be("tenant-deleted-success");

		// Verify tenant is now not found
		var getUrl = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.GetByIdFn(
				tenantId.ToString()
			)
		);
		var getRequest = new HttpRequestMessage(
			HttpMethod.Get, getUrl
		).WithSessionToken(staffToken);

		using var getResponse =
			await _http.SendAsync(getRequest);

		getResponse.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantNotSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Try to delete an active tenant (not suspended)
		using var response =
			await TenantTestHelper.DeleteTenantAsync(
				_http, staffToken, tenantId
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("tenant-not-suspended-cannot-delete");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("malformed-id");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForAlreadyDeletedTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Multi-step setup: suspend → delete → try delete again
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspendResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		using var firstDelete =
			await TenantTestHelper.DeleteTenantAsync(
				_http, staffToken, tenantId
			);
		firstDelete.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Try to delete again — should be not found
		using var secondDelete =
			await TenantTestHelper.DeleteTenantAsync(
				_http, staffToken, tenantId
			);

		secondDelete.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Login as tenant admin (not staff)
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(tenantToken);

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

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}
}
