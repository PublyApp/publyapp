
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
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class TenantProfileUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantProfileUsersAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetToggleUrl(
		string tenantId,
		string profileId,
		string userAccountId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Users.UpsertFn(profileId, userAccountId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForAssignWithoutSession() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				Guid.NewGuid().ToString()
			)
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForAssignWithoutPermission() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForUnassignWithoutPermission() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Theory]
	[InlineData("not-a-guid", null, null)]
	[InlineData(null, "not-a-guid", null)]
	[InlineData(null, null, "not-a-guid")]
	public async Task ItShouldReturnBadRequestForMalformedIdsOnAssign(
		string? malformedTenantId,
		string? malformedProfileId,
		string? malformedUserAccountId
	) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				malformedTenantId ?? tenantId.ToString(),
				malformedProfileId ?? Guid.NewGuid().ToString(),
				malformedUserAccountId ?? Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Theory]
	[InlineData("not-a-guid", null, null)]
	[InlineData(null, "not-a-guid", null)]
	[InlineData(null, null, "not-a-guid")]
	public async Task ItShouldReturnBadRequestForMalformedIdsOnUnassign(
		string? malformedTenantId,
		string? malformedProfileId,
		string? malformedUserAccountId
	) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(
				malformedTenantId ?? tenantId.ToString(),
				malformedProfileId ?? Guid.NewGuid().ToString(),
				malformedUserAccountId ?? Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAssignWithMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await GetTenantUserAccountIdAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAssignWithMissingMember() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				profileId.ToString(),
				Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRejectAssignForStaffScopeProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await GetTenantUserAccountIdAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail
		);
		var staffProfileId = await CreateStaffProfileAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				staffProfileId.ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// A staff-scope profile must never gain a tenant member through this route.
		(await CountAssignmentsAsync(userAccountId, staffProfileId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldRejectAssignForMemberOfAnotherTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var techStartTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
		var acmeProfileId = await CreateTenantProfileAsync(acmeTenantId);
		var foreignUserAccountId = await GetTenantUserAccountIdAsync(
			techStartTenantId,
			SeedConstants.Tenants.TechStartUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				acmeTenantId.ToString(),
				acmeProfileId.ToString(),
				foreignUserAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		(await CountAssignmentsAsync(foreignUserAccountId, acmeProfileId))
			.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldAssignMemberToTenantProfileWithAuditEntry() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await GetTenantUserAccountIdAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(1);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUserAssigned,
			profileId
		);
		Assert.NotNull(auditLog);
		AssertAuditDetails(auditLog, tenantId, profileId, userAccountId);
	}

	[Fact]
	public async Task ItShouldTreatRepeatedAssignAsIdempotentSuccess() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await GetTenantUserAccountIdAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail
		);

		await AssignAsync(token, tenantId, profileId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		// Idempotent: the composite key still holds exactly one membership row.
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldUnassignMemberFromTenantProfileWithAuditEntry() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await GetTenantUserAccountIdAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail
		);

		await AssignAsync(token, tenantId, profileId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		// Unassignment hard-deletes the junction row; history lives in the audit log.
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(0);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUserUnassigned,
			profileId
		);
		Assert.NotNull(auditLog);
		AssertAuditDetails(auditLog, tenantId, profileId, userAccountId);
	}

	[Fact]
	public async Task ItShouldTreatUnassignOfUnassignedProfileAsNoOp() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await GetTenantUserAccountIdAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(0);

		// A no-op must not fabricate audit history.
		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUserUnassigned,
			profileId
		);
		auditLog.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenMaxProfilesPerUserExceeded() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await CreateTenantMemberAsync(tenantId);
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		// Fill the member's quota exactly.
		for (var i = 0; i < maxProfilesPerUser; i++) {
			var filledProfileId = await CreateTenantProfileAsync(tenantId);
			await AssignAsync(token, tenantId, filledProfileId, userAccountId);
		}

		var overflowProfileId = await CreateTenantProfileAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				overflowProfileId.ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MaxProfilesPerUserExceeded);
		problem.Errors.Should().ContainKey("userAccountId");

		(await CountAssignmentsAsync(userAccountId, overflowProfileId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldAllowRepeatedAssignOfExistingProfileWhenAtCap() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await CreateTenantMemberAsync(tenantId);
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		var assignedProfileIds = new List<Guid>();
		for (var i = 0; i < maxProfilesPerUser; i++) {
			var filledProfileId = await CreateTenantProfileAsync(tenantId);
			await AssignAsync(token, tenantId, filledProfileId, userAccountId);
			assignedProfileIds.Add(filledProfileId);
		}

		// Re-asserting an assignment the member already holds must stay idempotent even
		// though the member sits exactly at the cap.
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				assignedProfileIds[0].ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, assignedProfileIds[0])).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldNotExceedCapForConcurrentAssigns() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await CreateTenantMemberAsync(tenantId);
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		// Leave exactly one free slot, then race more assigns than slots remain.
		for (var i = 0; i < maxProfilesPerUser - 1; i++) {
			var filledProfileId = await CreateTenantProfileAsync(tenantId);
			await AssignAsync(token, tenantId, filledProfileId, userAccountId);
		}

		var contendedProfileIds = new List<Guid>();
		for (var i = 0; i < 4; i++) {
			contendedProfileIds.Add(await CreateTenantProfileAsync(tenantId));
		}

		var responses = await Task.WhenAll(
			contendedProfileIds.Select(async contendedProfileId => {
				using var request = new HttpRequestMessage(
					HttpMethod.Post,
					GetToggleUrl(
						tenantId.ToString(),
						contendedProfileId.ToString(),
						userAccountId.ToString()
					)
				).WithSessionToken(token);

				using var response = await _http.SendAsync(request);
				return response.StatusCode;
			})
		);

		// Exactly one racer may take the last slot; the rest must be rejected, and the
		// stored count must never exceed the cap.
		responses.Count(status => status == HttpStatusCode.NoContent).Should().Be(1);
		responses.Count(status => status == HttpStatusCode.UnprocessableEntity)
			.Should().Be(contendedProfileIds.Count - 1);

		(await CountLiveProfilesForMemberAsync(userAccountId))
			.Should().Be(maxProfilesPerUser);
	}

	private async Task AssignAsync(
		string staffToken,
		Guid tenantId,
		Guid profileId,
		Guid userAccountId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
	}

	private async Task<Guid> GetTenantIdAsync(string tenantName) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(_http, token, tenantName);
	}

	private async Task<Guid> CreateTenantProfileAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			name: "Tenant Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Profile created for member assignment tests"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> CreateStaffProfileAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateStaffProfile(
			name: "Staff Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Staff profile created for member assignment tests"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> GetTenantUserAccountIdAsync(Guid tenantId, string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var normalizedEmail = email.ToLowerInvariant();
		var userAccountId = await (
			from ua in dbContext.UserAccount
			from u in dbContext.User
			where u.Id == ua.UserId
				&& u.Email == normalizedEmail
				&& ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
			select ua.Id
		).FirstOrDefaultAsync();

		if (userAccountId is not Guid resolved) {
			throw new InvalidOperationException(
				$"No tenant account found for {email} in tenant {tenantId}"
			);
		}

		return resolved;
	}

	/// <summary>
	/// Creates a dedicated tenant member so cap tests never contend with seeded
	/// accounts that other specs also assign profiles to.
	/// </summary>
	private async Task<Guid> CreateTenantMemberAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var user = new User {
			Email = $"member-{suffix}@example.com",
			Password = "hash",
			FirstName = "Cap",
			LastName = "Member",
			Status = UserStatus.Active,
			IsVerified = true
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var account = new UserAccount {
			UserId = user.GetRequiredId(),
			TenantId = tenantId,
			Scope = AccountScope.Tenant,
			Level = AccountLevel.User,
			Status = AccountStatus.Active,
		};

		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		return account.GetRequiredId();
	}

	private async Task<int> CountAssignmentsAsync(Guid userAccountId, Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.UserAccountProfile
			.Where(uap => uap.UserAccountId == userAccountId && uap.ProfileId == profileId)
			.CountAsync();
	}

	private async Task<int> CountLiveProfilesForMemberAsync(Guid userAccountId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from uap in dbContext.UserAccountProfile
			from p in dbContext.Profile
			where p.Id == uap.ProfileId
				&& uap.UserAccountId == userAccountId
				&& !p.IsDeleted
			select uap.ProfileId
		).CountAsync();
	}

	private async Task<AuditLog?> GetLatestAuditLogAsync(string action, Guid targetId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private static void AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		Guid expectedUserAccountId
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("ProfileId").GetGuid().Should().Be(expectedProfileId);
		details.GetProperty("UserAccountId").GetGuid().Should().Be(expectedUserAccountId);
	}
}
