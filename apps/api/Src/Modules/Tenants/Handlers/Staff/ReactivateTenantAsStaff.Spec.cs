namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Xunit;

public sealed class
ReactivateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public ReactivateTenantAsStaffSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithActiveStatusForSuspendedTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend first
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspendResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		try {
			// Reactivate
			using var response =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, tenantId
					);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					TenantReactivatedResponse
				>();
			result.Should().NotBeNull();
			result!.TenantId.Should().Be(tenantId);
			result.Status.Should().Be("Active");
		} finally {
			// Safety net: reactivate if assertions
			// failed before the reactivate call
			// or if reactivate response was not OK
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, tenantId
						);
			} catch {
				// Ignore — tenant may already be active
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnConflictForActiveTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Tenant starts active — reactivate should fail
		using var response =
			await TenantTestHelper.ReactivateTenantAsync(
				_http, staffToken, tenantId
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Conflict);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("tenant-not-suspended");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonexistentTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var randomId = Guid.NewGuid();

		using var response =
			await TenantTestHelper.ReactivateTenantAsync(
				_http, staffToken, randomId
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("tenant-not-found");
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutAuth() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantTestHelper.GetReactivateUrl(tenantId)
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
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

		// Suspend first so reactivate is valid
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			// Login as tenant admin (not staff)
			var tenantToken =
				await _authClient.LoginAsync(
					TestConstants.AcmeAdminEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Post,
				TenantTestHelper.GetReactivateUrl(
					tenantId
				)
			).WithSessionToken(tenantToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);
		} finally {
			// Cleanup
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, tenantId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tempId = Guid.NewGuid();
		var url = TenantTestHelper
			.GetReactivateUrl(tempId)
			.Replace(
				tempId.ToString(),
				"not-a-guid",
				StringComparison.Ordinal
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldSucceedFullSuspendReactivateCycle() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);

		// Suspend
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspendResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var suspended = await suspendResponse.Content
			.ReadFromJsonAsync<TenantSuspendedResponse>();
		suspended.Should().NotBeNull();
		suspended!.Status.Should().Be("Suspended");

		// Reactivate
		using var reactivateResponse =
			await TenantTestHelper.ReactivateTenantAsync(
				_http, staffToken, tenantId
			);
		reactivateResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var reactivated = await reactivateResponse.Content
			.ReadFromJsonAsync<TenantReactivatedResponse>();
		reactivated.Should().NotBeNull();
		reactivated!.Status.Should().Be("Active");
	}

	private record TenantSuspendedResponse {
		public Guid TenantId { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}

	private record TenantReactivatedResponse {
		public Guid TenantId { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}
}
