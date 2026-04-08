namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class GetTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantAsStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.GetByIdFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

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
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url = GetUrl(Guid.NewGuid().ToString());
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

		var url = GetUrl(Guid.NewGuid().ToString());
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

		var url = GetUrl(Guid.NewGuid().ToString());
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
	ItShouldReturnTenantWhenSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend the tenant
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspendResponse.EnsureSuccessStatusCode();

		try {
			// GET the suspended tenant as staff
			var url = GetUrl(tenantId.ToString());
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			result!.TenantId.Should().Be(tenantId);
			result.Code.Should().NotBeNullOrEmpty();
			result.Status.Should().Be("Suspended");
			result.MaxUsers.Should().BeGreaterThan(0);
		} finally {
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, tenantId
						);
			} catch {
				// Ignore — cleanup best-effort
			}
		}
	}
}
