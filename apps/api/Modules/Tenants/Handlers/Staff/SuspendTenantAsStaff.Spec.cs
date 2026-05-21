namespace MainApi.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Data.DbContext;
using MainApi.Data.Seeding;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.Tenants.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class SuspendTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public SuspendTenantAsStaffSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
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
	ItShouldWriteAuditLogWhenReasonProvided() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Suspend Audit",
				TenantStatus.Active
			);
		var reason = "Compliance review";

		using var response =
			await TenantTestHelper
				.SuspendTenantWithReasonAsync(
					_http,
					staffToken,
					seededTenant.TenantId,
					reason
				);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantSuspended,
			seededTenant.TenantId
		);
		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException(
				"Tenant suspend audit log was not written."
			);
		}

		AssertSuspendAuditDetails(
			auditLog,
			expectedTenantName: seededTenant.Name,
			expectedReason: reason
		);
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
	ItShouldReturnValidationErrorWhenReasonIsNotString() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Invalid Suspend Reason",
				TenantStatus.Active
			);

		using var response =
			await _http.SendAsync(
				CreateRawSuspendRequest(
					staffToken,
					seededTenant.TenantId,
					"""{ "reason": 123 }"""
				)
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed.Value);
		problem.Errors.Keys.Should()
			.Contain("Reason");
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
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Suspend Forbidden",
				TenantStatus.Active
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantTestHelper.GetSuspendUrl(
				seededTenant.TenantId
			)
		).WithSessionToken(token);
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

	private static HttpRequestMessage CreateRawSuspendRequest(
		string staffToken,
		Guid tenantId,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantTestHelper.GetSuspendUrl(tenantId)
		).WithSessionToken(staffToken);

		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return request;
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

	private static void AssertSuspendAuditDetails(
		AuditLog auditLog,
		string expectedTenantName,
		string expectedReason
	) {
		auditLog.Details.Should().NotBeNull();
		if (auditLog.Details is null) {
			throw new InvalidOperationException(
				"Tenant suspend audit log details were empty."
			);
		}

		using var document = JsonDocument.Parse(
			auditLog.Details
		);
		var details = document.RootElement;

		details.GetProperty("TenantName").GetString()
			.Should().Be(expectedTenantName);
		details.GetProperty("Reason").GetString()
			.Should().Be(expectedReason);
	}

	private sealed record SeededTenantSnapshot(
		Guid TenantId,
		string Name
	);
}
