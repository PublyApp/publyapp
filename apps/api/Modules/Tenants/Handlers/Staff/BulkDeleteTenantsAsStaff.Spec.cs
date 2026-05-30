
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

public sealed class BulkDeleteTenantsAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkDeleteTenantsAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldSoftDeleteSuspendedTenantsAndWriteAuditLog() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var firstTenant = await SeedTenantAsync(
			"Bulk Delete Suspended A",
			TenantStatus.Suspended
		);
		var secondTenant = await SeedTenantAsync(
			"Bulk Delete Suspended B",
			TenantStatus.Suspended
		);

		using var response = await _http.SendAsync(
			CreateRequest(
				staffToken,
				new {
					tenantIds = new[] {
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
				"Bulk delete response was empty."
			);
		}
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertTenantDeletedAsync(firstTenant.TenantId);
		await AssertTenantDeletedAsync(secondTenant.TenantId);

		var auditLog = await TenantBulkActionSpecSupport
			.GetLatestAuditLogAsync(
				_fixture,
				AuditActions.TenantBulkDeleted
			);
		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException(
				"Bulk delete audit log was not written."
			);
		}
		TenantBulkActionSpecSupport.AssertAuditDetails(
			auditLog,
			expectedCount: 2,
			expectedFailedCount: 0
		);
	}

	[Fact]
	public async Task
	ItShouldReturnPartialResultForNonDeletableTenants() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var suspendedTenant = await SeedTenantAsync(
			"Bulk Delete Partial Suspended",
			TenantStatus.Suspended
		);
		var activeTenant = await SeedTenantAsync(
			"Bulk Delete Partial Active",
			TenantStatus.Active
		);
		var missingTenantId = Guid.NewGuid();

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
				"Bulk delete response was empty."
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

		await AssertTenantDeletedAsync(suspendedTenant.TenantId);
		await AssertTenantNotDeletedAsync(activeTenant.TenantId);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToBulkDelete() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				_fixture,
				_authClient,
				"bulk-delete",
				AppPermissions.Staff.Tenants.DELETE.Key
			);
		var tenant = await SeedTenantAsync(
			"Bulk Delete Permissioned",
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
			"Bulk Delete Unauthorized",
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
			"Bulk Delete Tenant User",
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
				"bulk-delete-no-permission"
			);
		var tenant = await SeedTenantAsync(
			"Bulk Delete No Permission",
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
				TenantBulkActionSpecSupport.GetBulkDeleteUrl(),
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
			TenantBulkActionSpecSupport.GetBulkDeleteUrl(),
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

	private async Task AssertTenantDeletedAsync(
		Guid tenantId
	) {
		var tenant = await TenantBulkActionSpecSupport
			.GetTenantIgnoringFiltersAsync(_fixture, tenantId);
		tenant.Should().NotBeNull();
		if (tenant is null) {
			throw new InvalidOperationException(
				"Seeded tenant could not be loaded."
			);
		}

		tenant.IsDeleted.Should().BeTrue();
		tenant.DeletedAt.Should().NotBeNull();
		tenant.Status.Should().Be(TenantStatus.Suspended);
	}

	private async Task AssertTenantNotDeletedAsync(
		Guid tenantId
	) {
		var tenant = await TenantBulkActionSpecSupport
			.GetTenantIgnoringFiltersAsync(_fixture, tenantId);
		tenant.Should().NotBeNull();
		if (tenant is null) {
			throw new InvalidOperationException(
				"Seeded tenant could not be loaded."
			);
		}

		tenant.IsDeleted.Should().BeFalse();
		tenant.DeletedAt.Should().BeNull();
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
