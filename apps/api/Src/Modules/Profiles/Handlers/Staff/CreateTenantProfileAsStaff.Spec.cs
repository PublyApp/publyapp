namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.Profiles.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class CreateTenantProfileAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateTenantProfileAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Create
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var missingTenantId = Guid.NewGuid();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(missingTenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldCreateTenantProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created through tenant profile CRUD",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		payload!.Profile.Name.Should().Be(name);
		payload.Profile.Description.Should().Be("Created through tenant profile CRUD");
		payload.Profile.IsDefault.Should().BeFalse();

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileCreated,
			payload.Profile.Id
		);
		auditLog.Should().NotBeNull();
		auditLog!.Action.Should().Be(AuditActions.TenantProfileCreated);
		AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedProfileId: payload.Profile.Id,
			expectedProfileName: name,
			expectedIsDefault: false,
			expectedInitialPermissionKeys: [],
			expectedInitialPermissionCount: 0
		);
	}

	[Fact]
	public async Task ItShouldCreateTenantProfileWithInitialPermissions() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];
		var permissionKeys = new[] {
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
			AppPermissions.Tenant.Modules.ACCESS_BILLING.Key
		};

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with initial permissions",
			permissionKeys
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();

		var persistedPermissionKeys = await GetPermissionKeysAsync(payload!.Profile.Id);
		persistedPermissionKeys.Should().BeEquivalentTo(permissionKeys);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileCreated,
			payload.Profile.Id
		);
		auditLog.Should().NotBeNull();
		AssertAuditDetails(
			auditLog!,
			expectedTenantId: tenantId,
			expectedProfileId: payload.Profile.Id,
			expectedProfileName: name,
			expectedIsDefault: false,
			expectedInitialPermissionKeys: permissionKeys,
			expectedInitialPermissionCount: permissionKeys.Length
		);
	}

	[Fact]
	public async Task ItShouldRejectInvalidPermissionKeysWithoutCreatingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with invalid permissions",
			permissionKeys = new[] {
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
				"tenant.modules.does_not_exist"
			}
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var profile = await GetTenantProfileByNameAsync(tenantId, name);
		profile.Should().BeNull();

		var auditLogCount = await GetAuditLogCountAsync(
			AuditActions.TenantProfileCreated,
			name
		);
		auditLogCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldDeduplicateInitialPermissionKeys() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];
		var duplicatedPermissionKey = AppPermissions.Tenant.Modules.ACCESS_USERS.Key;

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with duplicate permissions",
			permissionKeys = new[] {
				duplicatedPermissionKey,
				duplicatedPermissionKey
			}
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();

		var persistedPermissionKeys = await GetPermissionKeysAsync(payload!.Profile.Id);
		persistedPermissionKeys.Should().Equal(duplicatedPermissionKey);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileCreated,
			payload.Profile.Id
		);
		auditLog.Should().NotBeNull();
		AssertAuditDetails(
			auditLog!,
			expectedTenantId: tenantId,
			expectedProfileId: payload.Profile.Id,
			expectedProfileName: name,
			expectedIsDefault: false,
			expectedInitialPermissionKeys: [duplicatedPermissionKey],
			expectedInitialPermissionCount: 1
		);
	}

	[Fact]
	public async Task ItShouldRejectDuplicateNamesWithinTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var name = "Duplicate Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		await CreateProfileAsync(token, tenantId, name);
		var auditLogCountBefore = await GetAuditLogCountAsync(
			AuditActions.TenantProfileCreated,
			name
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Second profile with duplicate name",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.ProfileNameAlreadyExists);

		var auditLogCountAfter = await GetAuditLogCountAsync(
			AuditActions.TenantProfileCreated,
			name
		);
		auditLogCountAfter.Should().Be(auditLogCountBefore);
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> CreateProfileAsync(
		string staffToken,
		Guid tenantId,
		string name
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name,
			description = "Helper profile",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		return payload!.Profile.Id.ToString();
	}

	private async Task<AuditLog?> GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private async Task<int> GetAuditLogCountAsync(
		string action,
		string? detailsContains = null
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		if (detailsContains is null) {
			return await dbContext.AuditLog.CountAsync(log => log.Action == action);
		}

		return await dbContext.AuditLog.CountAsync(log =>
			log.Action == action
			&& log.Details != null
			&& log.Details.Contains(detailsContains)
		);
	}

	private async Task<List<string>> GetPermissionKeysAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		return await (
			from pp in dbContext.ProfilePermission
			where pp.ProfileId == profileId && !pp.IsDeleted
			orderby pp.PermissionKey
			select pp.PermissionKey
		).ToListAsync();
	}

	private async Task<Profile?> GetTenantProfileByNameAsync(
		Guid tenantId,
		string name
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		return await (
			from p in dbContext.Profile
			where p.TenantId == tenantId
				&& p.Scope == ProfileScope.Tenant
				&& !p.IsDeleted
				&& p.Name == name
			select p
		).FirstOrDefaultAsync();
	}

	private static void AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		string expectedProfileName,
		bool expectedIsDefault,
		IReadOnlyCollection<string> expectedInitialPermissionKeys,
		int expectedInitialPermissionCount
	) {
		auditLog.Details.Should().NotBeNull();
		using var document = JsonDocument.Parse(auditLog.Details!);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("ProfileId").GetGuid().Should().Be(expectedProfileId);
		details.GetProperty("ProfileName").GetString().Should().Be(expectedProfileName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);
		details.GetProperty("InitialPermissionCount")
			.GetInt32()
			.Should()
			.Be(expectedInitialPermissionCount);
		details.GetProperty("InitialPermissionKeys")
			.EnumerateArray()
			.Select(x => x.GetString())
			.Should()
			.BeEquivalentTo(expectedInitialPermissionKeys);
	}

	private sealed record GetTenantProfileByIdResponse {
		public required TenantProfileItemResponse Profile { get; init; }
	}

	private sealed record TenantProfileItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public bool IsDefault { get; init; }
		public int UserAccountCount { get; init; }
	}
}
