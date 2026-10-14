
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

public sealed class BulkSuspendTenantsAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkSuspendTenantsAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldSuspendDistinctActiveTenantsAndWritePerTargetAuditLogs() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			this._Fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var firstTenant = await this._SeedTenantAsync(
			"Bulk Suspend Active A",
			TenantStatus.Active
		);
		var secondTenant = await this._SeedTenantAsync(
			"Bulk Suspend Active B",
			TenantStatus.Active
		);
		var reason = "Bulk compliance review";
		var startedAt = DateTime.UtcNow;

		using var response = await this._Http.SendAsync(
			BulkSuspendTenantsAsStaffSpec._CreateRequest(
				staffToken,
				new {
					tenantIds = new[] {
						firstTenant.TenantId,
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

		await this._AssertTenantStatusAsync(
			firstTenant.TenantId,
			TenantStatus.Suspended
		);
		await this._AssertTenantStatusAsync(
			secondTenant.TenantId,
			TenantStatus.Suspended
		);

		var auditLogs = await TenantBulkActionSpecSupport.GetAuditLogsAsync(
			this._Fixture,
			AuditActions.TenantBulkSuspended,
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
				expectedFailedCount: 0,
				expectedReason: reason
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnPartialResultForNonSuspendableTenants() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var activeTenant = await this._SeedTenantAsync(
			"Bulk Suspend Partial Active",
			TenantStatus.Active
		);
		var suspendedTenant = await this._SeedTenantAsync(
			"Bulk Suspend Partial Suspended",
			TenantStatus.Suspended
		);
		var pendingTenant = await this._SeedTenantAsync(
			"Bulk Suspend Partial Pending",
			TenantStatus.Pending
		);
		var missingTenantId = Guid.NewGuid();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			this._Fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var startedAt = DateTime.UtcNow;

		using var response = await this._Http.SendAsync(
			BulkSuspendTenantsAsStaffSpec._CreateRequest(
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

		await this._AssertTenantStatusAsync(
			activeTenant.TenantId,
			TenantStatus.Suspended
		);
		await this._AssertTenantStatusAsync(
			pendingTenant.TenantId,
			TenantStatus.Pending
		);

		var auditLogs = await TenantBulkActionSpecSupport.GetAuditLogsAsync(
			this._Fixture,
			AuditActions.TenantBulkSuspended,
			actorUserId,
			startedAt
		);
		auditLogs.Should().ContainSingle();
		auditLogs.Single().TargetId.Should().Be(activeTenant.TenantId);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToBulkSuspend() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				this._Fixture,
				this._AuthClient,
				"bulk-suspend",
				AppPermissions.Staff.Tenants.SUSPEND.Key
			);
		var tenant = await this._SeedTenantAsync(
			"Bulk Suspend Permissioned",
			TenantStatus.Active
		);

		using var response = await this._Http.SendAsync(
			BulkSuspendTenantsAsStaffSpec._CreateRequest(
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
		var tenant = await this._SeedTenantAsync(
			"Bulk Suspend Unauthorized",
			TenantStatus.Active
		);

		using var response = await this._Http.SendAsync(
			BulkSuspendTenantsAsStaffSpec._CreateRequest(
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
		var tenantToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenant = await this._SeedTenantAsync(
			"Bulk Suspend Tenant User",
			TenantStatus.Active
		);

		using var response = await this._Http.SendAsync(
			BulkSuspendTenantsAsStaffSpec._CreateRequest(
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
				this._Fixture,
				this._AuthClient,
				"bulk-suspend-no-permission"
			);
		var tenant = await this._SeedTenantAsync(
			"Bulk Suspend No Permission",
			TenantStatus.Active
		);

		using var response = await this._Http.SendAsync(
			BulkSuspendTenantsAsStaffSpec._CreateRequest(
				staffToken,
				new { tenantIds = new[] { tenant.TenantId } }
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Theory]
	[MemberData(nameof(BulkSuspendTenantsAsStaffSpec.InvalidBodies))]
	public async Task
	ItShouldReturnUnprocessableEntityWhenBodyIsInvalid(
		string body,
		string expectedField
	) {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._Http.SendAsync(
			TenantBulkActionSpecSupport.CreateRawJsonRequest(
				TenantBulkActionSpecSupport.GetBulkSuspendUrl(),
				staffToken,
				body
			)
		);

		await BulkSuspendTenantsAsStaffSpec._AssertValidationProblemAsync(
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

	private static HttpRequestMessage _CreateRequest(
		string? sessionToken,
		object body
	) {
		return TenantBulkActionSpecSupport.CreateJsonRequest(
			TenantBulkActionSpecSupport.GetBulkSuspendUrl(),
			sessionToken,
			body
		);
	}

	private Task<SeededTenantSnapshot> _SeedTenantAsync(
		string namePrefix,
		TenantStatus status
	) {
		return TenantBulkActionSpecSupport.SeedTenantAsync(
			this._Fixture,
			namePrefix,
			status
		);
	}

	private async Task _AssertTenantStatusAsync(
		Guid tenantId,
		TenantStatus expectedStatus
	) {
		var tenant = await TenantBulkActionSpecSupport
			.GetTenantIgnoringFiltersAsync(this._Fixture, tenantId);
		tenant.Should().NotBeNull();
		if (tenant is null) {
			throw new InvalidOperationException(
				"Seeded tenant could not be loaded."
			);
		}

		tenant.Status.Should().Be(expectedStatus);
	}

	private static async Task _AssertValidationProblemAsync(
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
