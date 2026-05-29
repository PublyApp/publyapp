
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Data.Seeding;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Localization;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.Auth.Utils;
using MainApi.Modules.Tenants.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Modules.Tenants.Handlers.Staff;

public sealed class UpdateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateTenantAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.UpdateFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantNameSuccessfully() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var originalName = SeedConstants.Tenants.AcmeName;
		var newName = "Acme Updated Corp";

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { name = newName }
			);

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.TenantId.Should().Be(tenantId);
			result.Name.Should().Be(newName);
			result.Code.Should().NotBeNullOrEmpty();
			result.Status.Should().NotBeNullOrEmpty();
		} finally {
			// Restore original name
			try {
				using var cleanup =
					await TenantTestHelper
						.UpdateTenantAsync(
							_http,
							staffToken,
							tenantId,
							new { name = originalName }
						);
			} catch {
				// Ignore — cleanup best-effort
			}
		}
	}

	[Fact]
	public async Task
	ItShouldClearLogoUrlWhenSetToNull() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// First set a logo URL
		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { logoUrl = "https://example.com/logo.png" }
			);
		setResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now clear it by sending null
		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		// Send explicit null for logoUrl
		request.Content = new StringContent(
			"""{"logoUrl": null}""",
			System.Text.Encoding.UTF8,
			"application/json"
		);

		using var clearResponse =
			await _http.SendAsync(request);

		try {
			clearResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await clearResponse.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.LogoUrl.Should().BeNull();
		} finally {
			// No cleanup needed — null logo is fine
		}
	}

	[Fact]
	public async Task
	ItShouldSetLogoUrlWhenStringProvided() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Logo Update");
		var logoUrl =
			"https://cdn.example.com/tenant-logo.png";

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.TenantId.Should()
			.Be(seededTenant.TenantId);
		result.LogoUrl.Should()
			.Be(logoUrl);
	}

	[Fact]
	public async Task
	ItShouldUpdateMaxUsersSuccessfully() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Max Users Update",
				maxUsers: 5
			);

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { maxUsers = 12 }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.TenantId.Should()
			.Be(seededTenant.TenantId);
		result.MaxUsers.Should()
			.Be(12);
	}

	[Fact]
	public async Task
	ItShouldUpdateMultipleFieldsAndWriteAuditLog() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Multi Update",
				maxUsers: 4
			);
		var newName =
			$"Tenant Multi Updated {Guid.NewGuid():N}";
		var newLogoUrl =
			"https://cdn.example.com/tenant-multi.png";
		var newMaxUsers = 9;

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new {
					name = newName,
					logoUrl = newLogoUrl,
					maxUsers = newMaxUsers,
				}
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.Name.Should()
			.Be(newName);
		result.LogoUrl.Should()
			.Be(newLogoUrl);
		result.MaxUsers.Should()
			.Be(newMaxUsers);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantUpdated,
			seededTenant.TenantId
		);
		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException(
				"Tenant update audit log was not written."
			);
		}

		AssertUpdateAuditDetails(
			auditLog,
			expectedName: newName,
			expectedLogoUrl: newLogoUrl,
			expectedMaxUsers: newMaxUsers
		);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenMaxUsersBelowCurrentUserCount() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantWithUsersAsync(
				"Tenant Max Below Count",
				usersCount: 2,
				maxUsers: 5
			);

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { maxUsers = 1 }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.TenantMaxUsersBelowCount);
	}

	[Fact]
	public async Task
	ItShouldReturn400ForEmptyPatchBody() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { name = "Updated Name" }
		);

		using var response =
			await _http.SendAsync(request);

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
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { name = "Updated Name" }
		);

		using var response =
			await _http.SendAsync(request);

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
	ItShouldReturnBadRequestWhenMaxUsersBelowCurrentCount() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Acme has seeded users, so setting maxUsers to 0
		// should fail
		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { maxUsers = 0 }
			);

		// maxUsers = 0 should fail validation (must be > 0)
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[MemberData(nameof(InvalidUpdateTenantBodies))]
	public async Task
	ItShouldReturnUnprocessableEntityWhenPatchBodyIsInvalid(
		string body,
		string expectedField
	) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Invalid Patch");

		using var response =
			await _http.SendAsync(
				CreateRawUpdateRequest(
					staffToken,
					seededTenant.TenantId,
					body
				)
			);

		await AssertValidationProblemAsync(
			response,
			expectedField
		);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		);
		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
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

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(tenantToken);

		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

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

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	public static TheoryData<string, string>
	InvalidUpdateTenantBodies() {
		return new TheoryData<string, string> {
			{
			"""
			{ "name": 123 }
			""",
			"Name"
			},
			{
			"""
			{ "name": null }
			""",
			"Name"
			},
			{
			"""
			{ "name": "Tiny" }
			""",
			"Name"
			},
			{
			"""
			{ "logoUrl": 123 }
			""",
			"LogoUrl"
			},
			{
			"""
			{ "maxUsers": "10" }
			""",
			"MaxUsers"
			},
			{
			"""
			{ "maxUsers": 1.5 }
			""",
			"MaxUsers"
			},
			{
			"""
			{ "maxUsers": 999999999999999999999999999999 }
			""",
			"MaxUsers"
			},
			{
			"""
			{ "maxUsers": -1 }
			""",
			"MaxUsers"
			},
		};
	}

	private static HttpRequestMessage
	CreateRawUpdateRequest(
		string staffToken,
		Guid tenantId,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString())
		).WithSessionToken(staffToken);

		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return request;
	}

	private async Task<SeededTenantSnapshot>
	SeedTenantAsync(
		string namePrefix,
		TenantStatus status = TenantStatus.Active,
		int maxUsers = 10
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = maxUsers,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return new SeededTenantSnapshot(
			TenantId: tenant.GetRequiredId(),
			Name: tenant.Name,
			Code: tenant.Code,
			MaxUsers: tenant.MaxUsers
		);
	}

	private async Task<SeededTenantSnapshot>
	SeedTenantWithUsersAsync(
		string namePrefix,
		int usersCount,
		int maxUsers
	) {
		var seededTenant = await SeedTenantAsync(
			namePrefix,
			maxUsers: maxUsers
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		for (var i = 0; i < usersCount; i++) {
			var user = new User {
				Email = $"tenant-update-user-{Guid.NewGuid():N}@example.com",
				Password = PasswordUtils.HashPassword(
					TestConstants.SeedPassword
				),
				FirstName = "Tenant",
				LastName = $"User {i}",
				Status = UserStatus.Active,
				IsVerified = true,
			};

			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(
					user.GetRequiredId(),
					seededTenant.TenantId
				)
			);
		}

		await dbContext.SaveChangesAsync();

		return seededTenant;
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

	private static void AssertUpdateAuditDetails(
		AuditLog auditLog,
		string expectedName,
		string expectedLogoUrl,
		int expectedMaxUsers
	) {
		auditLog.Details.Should().NotBeNull();
		if (auditLog.Details is null) {
			throw new InvalidOperationException(
				"Tenant update audit log details were empty."
			);
		}

		using var document = JsonDocument.Parse(
			auditLog.Details
		);
		var details = document.RootElement;

		details.GetProperty("Name").GetString()
			.Should().Be(expectedName);
		details.GetProperty("LogoUrl").GetString()
			.Should().Be(expectedLogoUrl);
		details.GetProperty("MaxUsers").GetInt32()
			.Should().Be(expectedMaxUsers);
	}

	private static async Task AssertValidationProblemAsync(
		HttpResponseMessage response,
		string expectedField
	) {
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content
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

	private sealed record SeededTenantSnapshot(
		Guid TenantId,
		string Name,
		string Code,
		int MaxUsers
	);
}
