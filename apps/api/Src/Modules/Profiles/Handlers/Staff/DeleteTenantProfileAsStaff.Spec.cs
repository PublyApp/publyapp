namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class DeleteTenantProfileAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public DeleteTenantProfileAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.DeleteFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

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
			HttpMethod.Delete,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

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
			HttpMethod.Delete,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRejectDeletingDefaultProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var defaultProfileId = await GetDefaultTenantProfileIdAsync(tenantId);
		var profileGuid = defaultProfileId;

		var auditLogBefore = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileDeleted,
			profileGuid
		);
		auditLogBefore.Should().BeNull();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetUrl(tenantId.ToString(), defaultProfileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(
			ResponseKeys.TenantProfileDefaultDeleteNotAllowed
		);
		problem.Detail.Should().Be("Default tenant profile cannot be deleted");

		var auditLogAfter = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileDeleted,
			profileGuid
		);
		auditLogAfter.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldDeleteProfileAndRemoveItFromGetById() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var createdProfile = await CreateProfileAsync(token, tenantId);
		var profileId = createdProfile.ProfileId;
		var profileName = createdProfile.ProfileName;
		var profileGuid = Guid.Parse(profileId);

		using var deleteRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);

		using var deleteResponse = await _http.SendAsync(deleteRequest);
		deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileDeleted,
			profileGuid
		);
		auditLog.Should().NotBeNull();
		auditLog!.Action.Should().Be(AuditActions.TenantProfileDeleted);
		AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedProfileId: profileGuid,
			expectedProfileName: profileName,
			expectedIsDefault: false
		);

		using var getRequest = new HttpRequestMessage(
			HttpMethod.Get,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Profiles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Profiles.ForTenantAsStaff.GetFn(profileId)
			)
		).WithSessionToken(token);

		using var getResponse = await _http.SendAsync(getRequest);
		getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> GetDefaultTenantProfileIdAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var profileService =
			scope.ServiceProvider.GetRequiredService<IProfileAsStaffService>();
		var profile = await profileService.GetOrCreateDefaultTenantProfileAsync(tenantId);

		profile.Should().NotBeNull("the seeded tenant should always have a default profile");
		return profile!.GetRequiredId();
	}

	private async Task<(string ProfileId, string ProfileName)> CreateProfileAsync(
		string staffToken,
		Guid tenantId
	) {
		var profileName = "Delete Tenant Profile " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Profiles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Profiles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			name = profileName,
			description = "Profile created for delete tests",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		return (payload!.Profile.Id.ToString(), profileName);
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

	private static void AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		string expectedProfileName,
		bool expectedIsDefault
	) {
		auditLog.Details.Should().NotBeNull();
		using var document = JsonDocument.Parse(auditLog.Details!);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("ProfileId").GetGuid().Should().Be(expectedProfileId);
		details.GetProperty("ProfileName").GetString().Should().Be(expectedProfileName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);
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
