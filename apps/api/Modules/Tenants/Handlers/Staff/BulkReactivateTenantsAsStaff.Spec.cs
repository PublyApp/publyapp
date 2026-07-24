
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public sealed class BulkReactivateTenantsAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkReactivateTenantsAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReactivateDistinctTenantsAndWritePerTargetAuditLogs() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var firstTenant = await SeedTenantAsync(
			"Bulk Reactivate Suspended A",
			TenantStatus.Suspended
		);
		var secondTenant = await SeedTenantAsync(
			"Bulk Reactivate Suspended B",
			TenantStatus.Suspended
		);
		var startedAt = DateTime.UtcNow;

		using var response = await _http.SendAsync(
			CreateRequest(
				staffToken,
				new {
					tenantIds = new[] {
						firstTenant.TenantId,
						firstTenant.TenantId,
						secondTenant.TenantId,
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
				"Bulk reactivate response was empty."
			);
		}
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertTenantStatusAsync(
			firstTenant.TenantId,
			TenantStatus.Active
		);
		await AssertTenantStatusAsync(
			secondTenant.TenantId,
			TenantStatus.Active
		);

		var auditLogs = await TenantBulkActionSpecSupport.GetAuditLogsAsync(
			_fixture,
			AuditActions.TenantBulkReactivated,
			actorUserId,
			startedAt
		);
		auditLogs.Should().HaveCount(2);
		auditLogs.Select(auditLog => auditLog.TargetId)
			.Should().BeEquivalentTo([
				firstTenant.TenantId,
				secondTenant.TenantId,
			]);
		auditLogs.Select(auditLog => auditLog.TargetId)
			.Should().NotContain(actorUserId);
		foreach (var auditLog in auditLogs) {
			TenantBulkActionSpecSupport.AssertAuditDetails(
				auditLog,
				expectedCount: 2,
				expectedFailedCount: 0
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnPartialResultForNonReactivatableTenants() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var suspendedTenant = await SeedTenantAsync(
			"Bulk Reactivate Partial Suspended",
			TenantStatus.Suspended
		);
		var activeTenant = await SeedTenantAsync(
			"Bulk Reactivate Partial Active",
			TenantStatus.Active
		);
		var missingTenantId = Guid.NewGuid();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var startedAt = DateTime.UtcNow;

		using var response = await _http.SendAsync(
			CreateRequest(
				staffToken,
				new {
					tenantIds = new[] {
						suspendedTenant.TenantId,
						activeTenant.TenantId,
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
				"Bulk reactivate response was empty."
			);
		}
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().Contain(item =>
			item.TenantId == activeTenant.TenantId
			&& item.Error == "Tenant is not suspended"
		);
		result.FailedItems.Should().Contain(item =>
			item.TenantId == missingTenantId
			&& item.Error == "Tenant not found"
		);

		await AssertTenantStatusAsync(
			suspendedTenant.TenantId,
			TenantStatus.Active
		);
		await AssertTenantStatusAsync(
			activeTenant.TenantId,
			TenantStatus.Active
		);

		var auditLogs = await TenantBulkActionSpecSupport.GetAuditLogsAsync(
			_fixture,
			AuditActions.TenantBulkReactivated,
			actorUserId,
			startedAt
		);
		auditLogs.Should().ContainSingle();
		auditLogs.Single().TargetId.Should().Be(suspendedTenant.TenantId);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToBulkReactivate() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				_fixture,
				_authClient,
				"bulk-reactivate",
				AppPermissions.Staff.Tenants.REACTIVATE.Key
			);
		var tenant = await SeedTenantAsync(
			"Bulk Reactivate Permissioned",
			TenantStatus.Suspended
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
			"Bulk Reactivate Unauthorized",
			TenantStatus.Suspended
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
			"Bulk Reactivate Tenant User",
			TenantStatus.Suspended
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
				"bulk-reactivate-no-permission"
			);
		var tenant = await SeedTenantAsync(
			"Bulk Reactivate No Permission",
			TenantStatus.Suspended
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
		string body
	) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			TenantBulkActionSpecSupport.CreateRawJsonRequest(
				TenantBulkActionSpecSupport.GetBulkReactivateUrl(),
				staffToken,
				body
			)
		);

		await AssertValidationProblemAsync(response);
	}

	public static TheoryData<string> InvalidBodies() {
		return new TheoryData<string> {
			"""{}""",
			"""{ "tenantIds": null }""",
			"""{ "tenantIds": "not-an-array" }""",
			"""{ "tenantIds": [] }""",
			"""{ "tenantIds": ["not-a-guid"] }""",
			$$"""
			{
				"tenantIds": [
					{{BulkTenantIdJsonFactory.CreateTooManyTenantIdsJson()}}
				]
			}
			""",
		};
	}

	private static HttpRequestMessage CreateRequest(
		string? sessionToken,
		object body
	) {
		return TenantBulkActionSpecSupport.CreateJsonRequest(
			TenantBulkActionSpecSupport.GetBulkReactivateUrl(),
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
		HttpResponseMessage response
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
			.Contain("TenantIds");
	}
}
