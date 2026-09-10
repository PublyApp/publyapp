
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public sealed class DeleteTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public DeleteTenantAsStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.DeleteFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldSoftDeleteSuspendedTenant() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);

		// Suspend first (precondition for delete)
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_Http, staffToken, tenantId
			);
		suspendResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Delete the suspended tenant
		using var deleteResponse =
			await TenantTestHelper.DeleteTenantAsync(
				_Http, staffToken, tenantId
			);

		deleteResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await deleteResponse.Content
			.ReadFromJsonAsync<ApiResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Key.Should()
					.Be("tenant-deleted-success");

		// Verify tenant is now not found
		var getUrl = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.GetByIdFn(
				tenantId.ToString()
			)
		);
		var getRequest = new HttpRequestMessage(
			HttpMethod.Get, getUrl
		).WithSessionToken(staffToken);

		using var getResponse =
			await _Http.SendAsync(getRequest);

		getResponse.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldPersistSoftDeleteStateAndWriteAuditLog() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await _SeedTenantAsync(
				"Tenant Delete Audit",
				TenantStatus.Suspended
			);

		using var response =
			await TenantTestHelper.DeleteTenantAsync(
				_Http,
				staffToken,
				seededTenant.TenantId
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var deletedTenant = await _GetTenantIgnoringFiltersAsync(
			seededTenant.TenantId
		);
		deletedTenant.Should().NotBeNull();
		if (deletedTenant is null) {
			throw new InvalidOperationException(
				"Deleted tenant row could not be loaded."
			);
		}
		deletedTenant.IsDeleted.Should().BeTrue();
		deletedTenant.DeletedAt.Should().NotBeNull();
		deletedTenant.Status.Should()
			.Be(TenantStatus.Suspended);

		var auditLog = await _GetLatestAuditLogAsync(
			AuditActions.TenantDeleted,
			seededTenant.TenantId
		);
		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException(
				"Tenant delete audit log was not written."
			);
		}

		_AssertDeleteAuditDetails(
			auditLog,
			expectedTenantName: seededTenant.Name
		);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantNotSuspended() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Try to delete an active tenant (not suspended)
		using var response =
			await TenantTestHelper.DeleteTenantAsync(
				_Http, staffToken, tenantId
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be("tenant-not-suspended-cannot-delete");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var url = _GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _Http.SendAsync(request);

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
			await _AuthClient.LoginAsStaffAdminAsync();
		var url = _GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be("malformed-id");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForAlreadyDeletedTenant() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Multi-step setup: suspend → delete → try delete again
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_Http, staffToken, tenantId
			);
		suspendResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		using var firstDelete =
			await TenantTestHelper.DeleteTenantAsync(
				_Http, staffToken, tenantId
			);
		firstDelete.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Try to delete again — should be not found
		using var secondDelete =
			await TenantTestHelper.DeleteTenantAsync(
				_Http, staffToken, tenantId
			);

		secondDelete.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var url = _GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Login as tenant admin (not staff)
		var tenantToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = _GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(tenantToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _AuthClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = _GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	private async Task<SeededTenantSnapshot> _SeedTenantAsync(
		string namePrefix,
		TenantStatus status
	) {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = 10,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return new SeededTenantSnapshot(
			TenantId: tenant.GetRequiredId(),
			Name: tenant.Name
		);
	}

	private async Task<Tenant?> _GetTenantIgnoringFiltersAsync(
		Guid tenantId
	) {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from tenant in dbContext.Tenant.IgnoreQueryFilters()
			where tenant.Id == tenantId
			select tenant;

		return await query.FirstOrDefaultAsync();
	}

	private async Task<AuditLog?> _GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from log in dbContext.AuditLog
			where log.Action == action
				&& log.TargetId == targetId
			orderby log.CreatedAt descending
			select log;

		return await query.FirstOrDefaultAsync();
	}

	private static void _AssertDeleteAuditDetails(
		AuditLog auditLog,
		string expectedTenantName
	) {
		auditLog.Details.Should().NotBeNull();
		if (auditLog.Details is null) {
			throw new InvalidOperationException(
				"Tenant delete audit log details were empty."
			);
		}

		using var document = JsonDocument.Parse(
			auditLog.Details
		);
		var details = document.RootElement;

		details.GetProperty("TenantName").GetString()
			.Should().Be(expectedTenantName);
	}

	private sealed record SeededTenantSnapshot(
		Guid TenantId,
		string Name
	);
}
