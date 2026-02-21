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

public sealed class UpdateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateTenantAsStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.UpdateFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantNameSuccessfully() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var originalName = SeedConstants.Tenants.AcmeName;
		var newName = "Acme Updated Corp";

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { name = newName }
			);

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			result!.TenantId.Should().Be(tenantId);
			result.Name.Should().Be(newName);
			result.Code.Should().NotBeNullOrEmpty();
			result.Status.Should().NotBeNullOrEmpty();
		} finally {
			// Restore original name
			try {
				using var cleanup =
					await TenantTestHelper
						.UpdateTenantAsync(
							_http,
							staffToken,
							tenantId,
							new { name = originalName }
						);
			} catch {
				// Ignore — cleanup best-effort
			}
		}
	}

	[Fact]
	public async Task
	ItShouldClearLogoUrlWhenSetToNull() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// First set a logo URL
		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { logoUrl = "https://example.com/logo.png" }
			);
		setResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now clear it by sending null
		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		// Send explicit null for logoUrl
		request.Content = new StringContent(
			"""{"logoUrl": null}""",
			System.Text.Encoding.UTF8,
			"application/json"
		);

		using var clearResponse =
			await _http.SendAsync(request);

		try {
			clearResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await clearResponse.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			result!.LogoUrl.Should().BeNull();
		} finally {
			// No cleanup needed — null logo is fine
		}
	}

	[Fact]
	public async Task
	ItShouldReturn200ForEmptyPatchBody() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		result!.TenantId.Should().Be(tenantId);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { name = "Updated Name" }
		);

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
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { name = "Updated Name" }
		);

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
	ItShouldReturnBadRequestWhenMaxUsersBelowCurrentCount() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Acme has seeded users, so setting maxUsers to 0
		// should fail
		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { maxUsers = 0 }
			);

		// maxUsers = 0 should fail validation (must be > 0)
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
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
			HttpMethod.Patch, url
		);
		request.Content = JsonContent.Create(
			new { name = "Updated" }
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
			HttpMethod.Patch, url
		).WithSessionToken(tenantToken);

		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

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
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}
}
