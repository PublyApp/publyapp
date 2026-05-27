
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Data.Seeding;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Localization;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.Tenants.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Modules.Tenants.Handlers.Staff;
public sealed class
ReactivateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public ReactivateTenantAsStaffSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
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
	ItShouldWriteAuditLogWhenTenantReactivated() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Reactivate Audit",
				TenantStatus.Suspended
			);

		using var response =
			await TenantTestHelper.ReactivateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantReactivated,
			seededTenant.TenantId
		);
		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException(
				"Tenant reactivate audit log was not written."
			);
		}

		AssertReactivateAuditDetails(
			auditLog,
			expectedTenantName: seededTenant.Name
		);
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
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Reactivate Forbidden",
				TenantStatus.Suspended
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantTestHelper.GetReactivateUrl(
				seededTenant.TenantId
			)
		).WithSessionToken(token);

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

	private async Task<SeededTenantSnapshot> SeedTenantAsync(
		string namePrefix,
		TenantStatus status
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

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

	private async Task<AuditLog?> GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var query =
			from log in dbContext.AuditLog
			where log.Action == action
				&& log.TargetId == targetId
			orderby log.CreatedAt descending
			select log;

		return await query.FirstOrDefaultAsync();
	}

	private static void AssertReactivateAuditDetails(
		AuditLog auditLog,
		string expectedTenantName
	) {
		auditLog.Details.Should().NotBeNull();
		if (auditLog.Details is null) {
			throw new InvalidOperationException(
				"Tenant reactivate audit log details were empty."
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
