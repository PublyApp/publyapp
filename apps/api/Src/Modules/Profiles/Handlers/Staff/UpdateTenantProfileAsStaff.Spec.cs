namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text;
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

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class UpdateTenantProfileAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateTenantProfileAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.UpdateFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { name = "Updated" });

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
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

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
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

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
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForEmptyPatchBody() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRejectDuplicateNamesWithinTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId, "Update A");
		var existingProfileId = await CreateProfileAsync(token, tenantId, "Update B");

		var existingName = await GetProfileNameAsync(token, tenantId, existingProfileId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = existingName });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.ProfileNameAlreadyExists);
	}

	[Fact]
	public async Task ItShouldUpdateNameAndDescription() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		var originalName = await GetProfileNameAsync(token, tenantId, profileId);
		var originalDescription = "Profile created for update tests";
		var updatedName = "Renamed " + Guid.NewGuid().ToString("N")[..8];
		var updatedDescription = "Updated description";

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = updatedName,
			description = updatedDescription,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		payload!.Profile.Description.Should().Be(updatedDescription);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			Guid.Parse(profileId)
		);
		auditLog.Should().NotBeNull();
		auditLog!.Action.Should().Be(AuditActions.TenantProfileUpdated);
		AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedProfileId: Guid.Parse(profileId),
			expectedProfileName: updatedName,
			expectedIsDefault: false,
			expectedNameOld: originalName,
			expectedNameNew: updatedName,
			expectedDescriptionOld: originalDescription,
			expectedDescriptionNew: updatedDescription
		);
	}

	[Fact]
	public async Task ItShouldClearDescriptionWhenNullIsProvided() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		var profileGuid = Guid.Parse(profileId);

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = new StringContent(
			"{\"description\":null}",
			Encoding.UTF8,
			"application/json"
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		payload!.Profile.Description.Should().BeNull();

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			profileGuid
		);
		auditLog.Should().NotBeNull();
		auditLog!.Action.Should().Be(AuditActions.TenantProfileUpdated);
		AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedProfileId: profileGuid,
			expectedProfileName: payload.Profile.Name,
			expectedIsDefault: false,
			expectedNameOld: null,
			expectedNameNew: null,
			expectedDescriptionOld: "Profile created for update tests",
			expectedDescriptionNew: null
		);
	}

	[Fact]
	public async Task ItShouldNotWriteAuditLogWhenPatchNormalizesToNoChange() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		var profileGuid = Guid.Parse(profileId);
		var noOpDescription = "Profile created for update tests";

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			description = noOpDescription,
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		payload!.Profile.Description.Should().Be(noOpDescription);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			profileGuid
		);
		auditLog.Should().BeNull();
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
		string? name = null
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Profiles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Profiles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name = name ?? "Tenant Profile " + Guid.NewGuid().ToString("N")[..8],
			description = "Profile created for update tests",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		return payload!.Profile.Id.ToString();
	}

	private async Task<string> GetProfileNameAsync(
		string staffToken,
		Guid tenantId,
		string profileId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Profiles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Profiles.ForTenantAsStaff.GetFn(profileId)
			)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize tenant profile");
		}

		return payload.Profile.Name;
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
		bool expectedIsDefault,
		string? expectedNameOld,
		string? expectedNameNew,
		string? expectedDescriptionOld,
		string? expectedDescriptionNew
	) {
		auditLog.Details.Should().NotBeNull();
		using var document = JsonDocument.Parse(auditLog.Details!);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("ProfileId").GetGuid().Should().Be(expectedProfileId);
		details.GetProperty("ProfileName").GetString().Should().Be(expectedProfileName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);

		var changedFields = details.GetProperty("ChangedFields");
		if (expectedNameOld is not null || expectedNameNew is not null) {
			var name = changedFields.GetProperty("name");
			name.GetProperty("Old").GetString().Should().Be(expectedNameOld);
			name.GetProperty("New").GetString().Should().Be(expectedNameNew);
		}

		if (expectedDescriptionOld is not null || expectedDescriptionNew is not null) {
			var description = changedFields.GetProperty("description");
			description.GetProperty("Old").GetString().Should().Be(expectedDescriptionOld);
			if (expectedDescriptionNew is null) {
				description.GetProperty("New").ValueKind.Should().Be(JsonValueKind.Null);
			} else {
				description.GetProperty("New").GetString().Should().Be(expectedDescriptionNew);
			}
		}
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
