namespace MainApi.Src.Lib.Filters;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Xunit;

public sealed class TenantAuthFilterSpec
	: IClassFixture<ApiFixture> {
	// The /test endpoint is behind tenantGroup
	// which applies session + tenant header + tenant auth
	private const string TestEndpoint = "/test";

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantAuthFilterSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkForActiveTenant() {
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

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TestEndpoint
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturn403ForSuspendedTenant() {
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

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				TestEndpoint
			)
				.WithSessionToken(acmeAdminToken)
				.WithTenantId(acmeId);

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
	ItShouldReturn403ForNonMember() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// TechStart admin is NOT a member of Acme
		var techStartAdminToken =
			await _authClient.LoginAsync(
				TestConstants.TechStartAdminEmail,
				TestConstants.SeedPassword
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TestEndpoint
		)
			.WithSessionToken(techStartAdminToken)
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		// Non-member gets generic forbidden, NOT
		// "tenant-suspended"
		problem!.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	ItShouldReturn403WhenStaffAccessesTenantEndpoint() {
		// Staff user has no tenant membership (mutual
		// exclusivity), so accessing a tenant endpoint
		// should return generic 403
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TestEndpoint
		)
			.WithSessionToken(staffToken)
			.WithTenantId(acmeId);

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
	ItShouldReturn400WhenTenantHeaderMissing() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TestEndpoint
		).WithSessionToken(acmeAdminToken);
		// Deliberately NOT setting tenant header

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("tenant-id-required");
	}

	[Fact]
	public async Task
	ItShouldReturn400WhenTenantHeaderIsInvalidGuid() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TestEndpoint
		).WithSessionToken(acmeAdminToken);

		request.Headers.TryAddWithoutValidation(
			TestConstants.TenantIdHeader,
			"not-a-valid-guid"
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("bad-request");
	}

	[Fact]
	public async Task
	ItShouldReturn401WhenSessionTokenMissing() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TestEndpoint
		).WithTenantId(acmeId);
		// Deliberately NOT setting session token

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturn401WhenSessionTokenInvalid() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TestEndpoint
		)
			.WithSessionToken("invalid-token")
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldRestoreAccessAfterReactivation() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			// Reactivate
			using var reactivate =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
			reactivate.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			// Now access should work
			var acmeAdminToken =
				await _authClient.LoginAsync(
					TestConstants.AcmeAdminEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				TestEndpoint
			)
				.WithSessionToken(acmeAdminToken)
				.WithTenantId(acmeId);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);
		} finally {
			// Safety net if reactivate didn't run
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, acmeId
						);
			} catch {
				// Ignore — tenant may already be active
			}
		}
	}
}
