
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
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkReactivateTenantsAsStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task
	ItShouldReactivateDistinctTenantsAndWritePerTargetAuditLogs() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_Fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var firstTenant = await _SeedTenantAsync(
			"Bulk Reactivate Suspended A",
			TenantStatus.Suspended
		);
		var secondTenant = await _SeedTenantAsync(
			"Bulk Reactivate Suspended B",
			TenantStatus.Suspended
		);
		var startedAt = DateTime.UtcNow;

		using var response = await _Http.SendAsync(
			_CreateRequest(
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

		await _AssertTenantStatusAsync(
			firstTenant.TenantId,
			TenantStatus.Active
		);
		await _AssertTenantStatusAsync(
			secondTenant.TenantId,
			TenantStatus.Active
		);

		var auditLogs = await TenantBulkActionSpecSupport.GetAuditLogsAsync(
			_Fixture,
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
			await _AuthClient.LoginAsStaffAdminAsync();
		var suspendedTenant = await _SeedTenantAsync(
			"Bulk Reactivate Partial Suspended",
			TenantStatus.Suspended
		);
		var activeTenant = await _SeedTenantAsync(
			"Bulk Reactivate Partial Active",
			TenantStatus.Active
		);
		var missingTenantId = Guid.NewGuid();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_Fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var startedAt = DateTime.UtcNow;

		using var response = await _Http.SendAsync(
			_CreateRequest(
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

		await _AssertTenantStatusAsync(
			suspendedTenant.TenantId,
			TenantStatus.Active
		);
		await _AssertTenantStatusAsync(
			activeTenant.TenantId,
			TenantStatus.Active
		);

		var auditLogs = await TenantBulkActionSpecSupport.GetAuditLogsAsync(
			_Fixture,
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
				_Fixture,
				_AuthClient,
				"bulk-reactivate",
				AppPermissions.Staff.Tenants.REACTIVATE.Key
			);
		var tenant = await _SeedTenantAsync(
			"Bulk Reactivate Permissioned",
			TenantStatus.Suspended
		);

		using var response = await _Http.SendAsync(
			_CreateRequest(
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
		var tenant = await _SeedTenantAsync(
			"Bulk Reactivate Unauthorized",
			TenantStatus.Suspended
		);

		using var response = await _Http.SendAsync(
			_CreateRequest(
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
		var tenantToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenant = await _SeedTenantAsync(
			"Bulk Reactivate Tenant User",
			TenantStatus.Suspended
		);

		using var response = await _Http.SendAsync(
			_CreateRequest(
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
				_Fixture,
				_AuthClient,
				"bulk-reactivate-no-permission"
			);
		var tenant = await _SeedTenantAsync(
			"Bulk Reactivate No Permission",
			TenantStatus.Suspended
		);

		using var response = await _Http.SendAsync(
			_CreateRequest(
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
			await _AuthClient.LoginAsStaffAdminAsync();

		using var response = await _Http.SendAsync(
			TenantBulkActionSpecSupport.CreateRawJsonRequest(
				TenantBulkActionSpecSupport.GetBulkReactivateUrl(),
				staffToken,
				body
			)
		);

		await _AssertValidationProblemAsync(response);
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

	private static HttpRequestMessage _CreateRequest(
		string? sessionToken,
		object body
	) {
		return TenantBulkActionSpecSupport.CreateJsonRequest(
			TenantBulkActionSpecSupport.GetBulkReactivateUrl(),
			sessionToken,
			body
		);
	}

	private Task<SeededTenantSnapshot> _SeedTenantAsync(
		string namePrefix,
		TenantStatus status
	) {
		return TenantBulkActionSpecSupport.SeedTenantAsync(
			_Fixture,
			namePrefix,
			status
		);
	}

	private async Task _AssertTenantStatusAsync(
		Guid tenantId,
		TenantStatus expectedStatus
	) {
		var tenant = await TenantBulkActionSpecSupport
			.GetTenantIgnoringFiltersAsync(_Fixture, tenantId);
		tenant.Should().NotBeNull();
		if (tenant is null) {
			throw new InvalidOperationException(
				"Seeded tenant could not be loaded."
			);
		}

		tenant.Status.Should().Be(expectedStatus);
	}

	private static async Task _AssertValidationProblemAsync(
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
