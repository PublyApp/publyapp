namespace MainApi.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Localization;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.Tenants.Entities;

using Xunit;

public sealed class BulkSuspendTenantsAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkSuspendTenantsAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldSuspendActiveTenantsAndWriteAuditLog() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var firstTenant = await SeedTenantAsync(
			"Bulk Suspend Active A",
			TenantStatus.Active
		);
		var secondTenant = await SeedTenantAsync(
			"Bulk Suspend Active B",
			TenantStatus.Active
		);
		var reason = "Bulk compliance review";

		using var response = await _http.SendAsync(
			CreateRequest(
				staffToken,
				new {
					tenantIds = new[] {
						firstTenant.TenantId,
						secondTenant.TenantId,
					},
					reason,
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkTenantActionResponse>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Bulk suspend response was empty."
			);
		}
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertTenantStatusAsync(
			firstTenant.TenantId,
			TenantStatus.Suspended
		);
		await AssertTenantStatusAsync(
			secondTenant.TenantId,
			TenantStatus.Suspended
		);

		var auditLog = await TenantBulkActionSpecSupport
			.GetLatestAuditLogAsync(
				_fixture,
				AuditActions.TenantBulkSuspended
			);
		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException(
				"Bulk suspend audit log was not written."
			);
		}
		TenantBulkActionSpecSupport.AssertAuditDetails(
			auditLog,
			expectedCount: 2,
			expectedFailedCount: 0,
			expectedReason: reason
		);
	}

	[Fact]
	public async Task
	ItShouldReturnPartialResultForNonSuspendableTenants() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var activeTenant = await SeedTenantAsync(
			"Bulk Suspend Partial Active",
			TenantStatus.Active
		);
		var suspendedTenant = await SeedTenantAsync(
			"Bulk Suspend Partial Suspended",
			TenantStatus.Suspended
		);
		var pendingTenant = await SeedTenantAsync(
			"Bulk Suspend Partial Pending",
			TenantStatus.Pending
		);
		var missingTenantId = Guid.NewGuid();

		using var response = await _http.SendAsync(
			CreateRequest(
				staffToken,
				new {
					tenantIds = new[] {
						activeTenant.TenantId,
						suspendedTenant.TenantId,
						pendingTenant.TenantId,
						missingTenantId,
					},
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkTenantActionResponse>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Bulk suspend response was empty."
			);
		}
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(3);
		result.FailedItems.Should().Contain(item =>
			item.TenantId == suspendedTenant.TenantId
			&& item.Error == "Already suspended"
		);
		result.FailedItems.Should().Contain(item =>
			item.TenantId == pendingTenant.TenantId
			&& item.Error == "Tenant is not active"
		);
		result.FailedItems.Should().Contain(item =>
			item.TenantId == missingTenantId
			&& item.Error == "Tenant not found"
		);

		await AssertTenantStatusAsync(
			activeTenant.TenantId,
			TenantStatus.Suspended
		);
		await AssertTenantStatusAsync(
			pendingTenant.TenantId,
			TenantStatus.Pending
		);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToBulkSuspend() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				_fixture,
				_authClient,
				"bulk-suspend",
				AppPermissions.Staff.Tenants.SUSPEND.Key
			);
		var tenant = await SeedTenantAsync(
			"Bulk Suspend Permissioned",
			TenantStatus.Active
		);

		using var response = await _http.SendAsync(
			CreateRequest(
				staffToken,
				new { tenantIds = new[] { tenant.TenantId } }
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var tenant = await SeedTenantAsync(
			"Bulk Suspend Unauthorized",
			TenantStatus.Active
		);

		using var response = await _http.SendAsync(
			CreateRequest(
				sessionToken: null,
				body: new { tenantIds = new[] { tenant.TenantId } }
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenant = await SeedTenantAsync(
			"Bulk Suspend Tenant User",
			TenantStatus.Active
		);

		using var response = await _http.SendAsync(
			CreateRequest(
				tenantToken,
				new { tenantIds = new[] { tenant.TenantId } }
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithoutPermissionAsync(
				_fixture,
				_authClient,
				"bulk-suspend-no-permission"
			);
		var tenant = await SeedTenantAsync(
			"Bulk Suspend No Permission",
			TenantStatus.Active
		);

		using var response = await _http.SendAsync(
			CreateRequest(
				staffToken,
				new { tenantIds = new[] { tenant.TenantId } }
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Theory]
	[MemberData(nameof(InvalidBodies))]
	public async Task
	ItShouldReturnUnprocessableEntityWhenBodyIsInvalid(
		string body,
		string expectedField
	) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			TenantBulkActionSpecSupport.CreateRawJsonRequest(
				TenantBulkActionSpecSupport.GetBulkSuspendUrl(),
				staffToken,
				body
			)
		);

		await AssertValidationProblemAsync(
			response,
			expectedField
		);
	}

	public static TheoryData<string, string> InvalidBodies() {
		return new TheoryData<string, string> {
			{ """{}""", "TenantIds" },
			{ """{ "tenantIds": null }""", "TenantIds" },
			{ """{ "tenantIds": "not-an-array" }""", "TenantIds" },
			{ """{ "tenantIds": [] }""", "TenantIds" },
			{ """{ "tenantIds": ["not-a-guid"] }""", "TenantIds" },
			{
			$$"""
			{
				"tenantIds": ["{{Guid.NewGuid()}}"],
				"reason": 123
			}
			""",
			"Reason"
			},
			{
			$$"""
			{
				"tenantIds": ["{{Guid.NewGuid()}}"],
				"reason": "{{new string('x', 501)}}"
			}
			""",
			"Reason"
			},
			{
			$$"""
			{
				"tenantIds": [
					{{BulkTenantIdJsonFactory.CreateTooManyTenantIdsJson()}}
				]
			}
			""",
			"TenantIds"
			},
		};
	}

	private static HttpRequestMessage CreateRequest(
		string? sessionToken,
		object body
	) {
		return TenantBulkActionSpecSupport.CreateJsonRequest(
			TenantBulkActionSpecSupport.GetBulkSuspendUrl(),
			sessionToken,
			body
		);
	}

	private Task<SeededTenantSnapshot> SeedTenantAsync(
		string namePrefix,
		TenantStatus status
	) {
		return TenantBulkActionSpecSupport.SeedTenantAsync(
			_fixture,
			namePrefix,
			status
		);
	}

	private async Task AssertTenantStatusAsync(
		Guid tenantId,
		TenantStatus expectedStatus
	) {
		var tenant = await TenantBulkActionSpecSupport
			.GetTenantIgnoringFiltersAsync(_fixture, tenantId);
		tenant.Should().NotBeNull();
		if (tenant is null) {
			throw new InvalidOperationException(
				"Seeded tenant could not be loaded."
			);
		}

		tenant.Status.Should().Be(expectedStatus);
	}

	private static async Task AssertValidationProblemAsync(
		HttpResponseMessage response,
		string expectedField
	) {
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			throw new InvalidOperationException(
				"Validation problem response was empty."
			);
		}
		problem.TranslationKey.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed.Value);
		problem.Errors.Keys.Should()
			.Contain(expectedField);
	}
}
