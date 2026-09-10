
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
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Profiles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class CreateTenantProfileAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateTenantProfileAsStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Create
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await _GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await _GetTenantIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await _GetTenantIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingTenant() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var missingTenantId = Guid.NewGuid();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(missingTenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New profile" });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldCreateTenantProfile() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created through tenant profile CRUD",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Profile.Name.Should().Be(name);
		payload.Profile.Description.Should().Be("Created through tenant profile CRUD");
		payload.Profile.Icon.Should().BeNull();
		payload.Profile.Tone.Should().BeNull();
		payload.Profile.IsDefault.Should().BeFalse();

		var persistedProfile = await _GetTenantProfileByNameAsync(tenantId, name);
		persistedProfile.Should().NotBeNull();
		Assert.NotNull(persistedProfile);
		persistedProfile.Icon.Should().BeNull();
		persistedProfile.Tone.Should().BeNull();
		payload.Profile.PermissionsCount.Should().Be(0);
		payload.Profile.CreatedAt.Should()
			.BeCloseTo(persistedProfile.CreatedAt, TimeSpan.FromMicroseconds(1));
		payload.Profile.UpdatedAt.Should()
			.BeCloseTo(persistedProfile.UpdatedAt, TimeSpan.FromMicroseconds(1));
		payload.Profile.CreatedAt.Should().NotBe(default);
		payload.Profile.UpdatedAt.Should().NotBe(default);

		var auditLog = await _GetLatestAuditLogAsync(
			AuditActions.TenantProfileCreated,
			payload.Profile.Id
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantProfileCreated);
		_AssertAuditDetails(
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
	public async Task ItShouldCreateTenantProfileWithIconAndTone() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = "Styled Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with persisted card style",
			icon = "shield-check",
			tone = "4",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Profile.Icon.Should().Be("shield-check");
		payload.Profile.Tone.Should().Be("4");

		var persistedProfile = await _GetTenantProfileByNameAsync(tenantId, name);
		persistedProfile.Should().NotBeNull();
		Assert.NotNull(persistedProfile);
		persistedProfile.Icon.Should().Be("shield-check");
		persistedProfile.Tone.Should().Be("4");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidTone() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = "Invalid Tone " + Guid.NewGuid().ToString("N")[..8],
			tone = "8",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Tone");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForUnsupportedIcon() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = "Invalid Icon " + Guid.NewGuid().ToString("N")[..8],
			icon = "address-book",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Icon");
	}

	[Fact]
	public async Task ItShouldCreateTenantProfileWithInitialPermissions() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];
		var permissionKeys = new[] {
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
			AppPermissions.Tenant.Modules.ACCESS_BILLING.Key
		};

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with initial permissions",
			permissionKeys
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();

		Assert.NotNull(payload);
		payload.Profile.PermissionsCount.Should().Be(permissionKeys.Length);
		payload.Profile.CreatedAt.Should().NotBe(default);
		payload.Profile.UpdatedAt.Should().NotBe(default);
		var persistedPermissionKeys = await _GetPermissionKeysAsync(payload.Profile.Id);
		persistedPermissionKeys.Should().BeEquivalentTo(permissionKeys);

		var auditLog = await _GetLatestAuditLogAsync(
			AuditActions.TenantProfileCreated,
			payload.Profile.Id
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		_AssertAuditDetails(
					auditLog,
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with invalid permissions",
			permissionKeys = new[] {
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
				"tenant.modules.does_not_exist"
			}
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var profile = await _GetTenantProfileByNameAsync(tenantId, name);
		profile.Should().BeNull();

		var auditLogCount = await _GetAuditLogCountAsync(
			AuditActions.TenantProfileCreated,
			name
		);
		auditLogCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldDeduplicateInitialPermissionKeys() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8];
		var duplicatedPermissionKey = AppPermissions.Tenant.Modules.ACCESS_USERS.Key;

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with duplicate permissions",
			permissionKeys = new[] {
				duplicatedPermissionKey,
				duplicatedPermissionKey
			}
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();

		Assert.NotNull(payload);
		var persistedPermissionKeys = await _GetPermissionKeysAsync(payload.Profile.Id);
		persistedPermissionKeys.Should().Equal(duplicatedPermissionKey);

		var auditLog = await _GetLatestAuditLogAsync(
			AuditActions.TenantProfileCreated,
			payload.Profile.Id
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		_AssertAuditDetails(
					auditLog,
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
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var name = "Duplicate Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		await _CreateProfileAsync(token, tenantId, name);
		var auditLogCountBefore = await _GetAuditLogCountAsync(
			AuditActions.TenantProfileCreated,
			name
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Second profile with duplicate name",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.ProfileNameAlreadyExists);

		var auditLogCountAfter = await _GetAuditLogCountAsync(
			AuditActions.TenantProfileCreated,
			name
		);
		auditLogCountAfter.Should().Be(auditLogCountBefore);
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> _CreateProfileAsync(
		string staffToken,
		Guid tenantId,
		string name
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(tenantId.ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name,
			description = "Helper profile",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		return payload.Profile.Id.ToString();
	}

	private async Task<AuditLog?> _GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private async Task<int> _GetAuditLogCountAsync(
		string action,
		string? detailsContains = null
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		if (detailsContains is null) {
			return await dbContext.AuditLog.CountAsync(log => log.Action == action);
		}

		return await dbContext.AuditLog.CountAsync(log =>
			log.Action == action
			&& log.Details != null
			&& log.Details.Contains(detailsContains)
		);
	}

	private async Task<List<string>> _GetPermissionKeysAsync(Guid profileId) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// No IsDeleted filter here: profile_permissions now stores active grants only.
		return await (
			from pp in dbContext.ProfilePermission
			where pp.ProfileId == profileId
			orderby pp.PermissionKey
			select pp.PermissionKey
		).ToListAsync();
	}

	private async Task<Profile?> _GetTenantProfileByNameAsync(
		Guid tenantId,
		string name
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from p in dbContext.Profile
			where p.TenantId == tenantId
				&& p.Scope == ProfileScope.Tenant
				&& !p.IsDeleted
				&& p.Name == name
			select p
		).FirstOrDefaultAsync();
	}

	private static void _AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		string expectedProfileName,
		bool expectedIsDefault,
		IReadOnlyCollection<string> expectedInitialPermissionKeys,
		int expectedInitialPermissionCount
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
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
		public string? Icon { get; init; }
		public string? Tone { get; init; }
		public bool IsDefault { get; init; }
		public int UserAccountCount { get; init; }
		public int PermissionsCount { get; init; }
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
