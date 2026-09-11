
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Profiles.Services;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class DeleteTenantProfileAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public DeleteTenantProfileAsStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.DeleteFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await _GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

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
			HttpMethod.Delete,
			_GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

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
			HttpMethod.Delete,
			_GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingProfile() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRejectDeletingDefaultProfile() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var defaultProfileId = await _GetDefaultTenantProfileIdAsync(tenantId);
		var profileGuid = defaultProfileId;

		var auditLogBefore = await _GetLatestAuditLogAsync(
			AuditActions.TenantProfileDeleted,
			profileGuid
		);
		auditLogBefore.Should().BeNull();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetUrl(tenantId.ToString(), defaultProfileId.ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(
					ResponseKeys.TenantProfileDefaultDeleteNotAllowed
				);
		problem.Detail.Should().Be("Default tenant profile cannot be deleted");

		var auditLogAfter = await _GetLatestAuditLogAsync(
			AuditActions.TenantProfileDeleted,
			profileGuid
		);
		auditLogAfter.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldDeleteProfileAndRemoveItFromGetById() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var createdProfile = await _CreateProfileAsync(token, tenantId);
		var profileId = createdProfile.ProfileId;
		var profileName = createdProfile.ProfileName;
		var profileGuid = Guid.Parse(profileId);

		using var deleteRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);

		using var deleteResponse = await _Http.SendAsync(deleteRequest);
		deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var auditLog = await _GetLatestAuditLogAsync(
			AuditActions.TenantProfileDeleted,
			profileGuid
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantProfileDeleted);
		_AssertAuditDetails(
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

		using var getResponse = await _Http.SendAsync(getRequest);
		getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> _GetDefaultTenantProfileIdAsync(Guid tenantId) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var profileService =
			scope.ServiceProvider.GetRequiredService<ITenantProfileAsStaffService>();
		var profile = await profileService.GetOrCreateDefaultTenantProfileAsync(tenantId);

		profile.Should().NotBeNull("the seeded tenant should always have a default profile");
		Assert.NotNull(profile);
		return profile.GetRequiredId();
	}

	private async Task<(string ProfileId, string ProfileName)> _CreateProfileAsync(
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

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		return (payload.Profile.Id.ToString(), profileName);
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

	private static void _AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		string expectedProfileName,
		bool expectedIsDefault
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
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
