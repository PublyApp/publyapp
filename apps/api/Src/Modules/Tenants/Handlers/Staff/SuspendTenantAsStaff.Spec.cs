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

public sealed class SuspendTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public SuspendTenantAsStaffSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithSuspendedStatusForActiveTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var response =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<TenantSuspendedResponse>();
			result.Should().NotBeNull();
			result!.TenantId.Should().Be(tenantId);
			result.Status.Should().Be("Suspended");
		} finally {
			// Safety net: don't let cleanup failures
			// hide the real assertion failure.
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

	[Fact]
	public async Task
	ItShouldReturnOkWhenReasonProvided() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		using var response =
			await TenantTestHelper
				.SuspendTenantWithReasonAsync(
					_http,
					staffToken,
					tenantId,
					"Terms of service violation"
				);

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<TenantSuspendedResponse>();
			result.Should().NotBeNull();
			result!.Status.Should().Be("Suspended");
		} finally {
			// Safety net: don't let cleanup failures
			// hide the real assertion failure.
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

	[Fact]
	public async Task
	ItShouldReturnValidationErrorWhenReasonExceeds500Chars() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var longReason = new string('x', 501);

		using var response =
			await TenantTestHelper
				.SuspendTenantWithReasonAsync(
					_http,
					staffToken,
					tenantId,
					longReason
				);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonexistentTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var randomId = Guid.NewGuid();

		using var response =
			await TenantTestHelper.SuspendTenantAsync(
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
	ItShouldReturnConflictForAlreadySuspendedTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);

		// Suspend first time
		using var first =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		first.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			// Suspend again
			using var second =
				await TenantTestHelper.SuspendTenantAsync(
					_http, staffToken, tenantId
				);

			second.StatusCode.Should()
				.Be(HttpStatusCode.Conflict);

			var problem = await second.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			problem.Should().NotBeNull();
			problem!.TranslationKey.Should()
				.Be("tenant-already-suspended");
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
			TenantTestHelper.GetSuspendUrl(tenantId)
		);
		request.Content = JsonContent.Create(new { });

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

		// Login as tenant admin (not staff)
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantTestHelper.GetSuspendUrl(tenantId)
		).WithSessionToken(tenantToken);

		request.Content = JsonContent.Create(new { });

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tempId = Guid.NewGuid();
		var url = TenantTestHelper
			.GetSuspendUrl(tempId)
			.Replace(
				tempId.ToString(),
				"not-a-guid",
				StringComparison.Ordinal
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new { });

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

	private record TenantSuspendedResponse {
		public Guid TenantId { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}
}
