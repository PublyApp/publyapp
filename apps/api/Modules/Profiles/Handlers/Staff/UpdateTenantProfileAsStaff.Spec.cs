
using System.Net;
using System.Net.Http.Json;
using System.Text;
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
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
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
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
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
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.ProfileNameAlreadyExists);
	}

	[Fact]
	public async Task ItShouldUpdateNameAndDescription() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		var profileGuid = Guid.Parse(profileId);
		await AddProfilePermissionAsync(
			profileGuid,
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key
		);
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
		Assert.NotNull(payload);
		payload.Profile.Description.Should().Be(updatedDescription);
		payload.Profile.PermissionsCount.Should().Be(1);
		payload.Profile.CreatedAt.Should().NotBe(default);
		payload.Profile.UpdatedAt.Should().NotBe(default);

		var persistedProfile = await GetProfileAsync(profileGuid);
		payload.Profile.CreatedAt.Should()
			.BeCloseTo(persistedProfile.CreatedAt, TimeSpan.FromMicroseconds(1));
		payload.Profile.UpdatedAt.Should()
			.BeCloseTo(persistedProfile.UpdatedAt, TimeSpan.FromMicroseconds(1));

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			Guid.Parse(profileId)
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantProfileUpdated);
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
		Assert.NotNull(payload);
		payload.Profile.Description.Should().BeNull();

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			profileGuid
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantProfileUpdated);
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
	public async Task ItShouldSetIconAndTone() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			icon = "users-group",
			tone = "6",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Profile.Icon.Should().Be("users-group");
		payload.Profile.Tone.Should().Be("6");

		var persistedProfile = await GetProfileAsync(Guid.Parse(profileId));
		persistedProfile.Icon.Should().Be("users-group");
		persistedProfile.Tone.Should().Be("6");
	}

	[Fact]
	public async Task ItShouldWriteAuditLogWhenOnlyIconChanges() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		var profileGuid = Guid.Parse(profileId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { icon = "users-group" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			profileGuid
		);
		AssertStyleAuditDetails(
			auditLog,
			tenantId,
			profileGuid,
			payload.Profile.Name,
			new Dictionary<string, (string? Old, string? New)> {
				["icon"] = (null, "users-group"),
			}
		);
	}

	[Fact]
	public async Task ItShouldWriteAuditLogWhenOnlyToneChanges() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		var profileGuid = Guid.Parse(profileId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { tone = "6" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			profileGuid
		);
		AssertStyleAuditDetails(
			auditLog,
			tenantId,
			profileGuid,
			payload.Profile.Name,
			new Dictionary<string, (string? Old, string? New)> {
				["tone"] = (null, "6"),
			}
		);
	}

	[Fact]
	public async Task ItShouldClearIconAndToneWhenNullIsProvided() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		await SetProfileStyleAsync(Guid.Parse(profileId), "shield", "2");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = new StringContent(
			"{\"icon\":null,\"tone\":null}",
			Encoding.UTF8,
			"application/json"
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Profile.Icon.Should().BeNull();
		payload.Profile.Tone.Should().BeNull();

		var persistedProfile = await GetProfileAsync(Guid.Parse(profileId));
		persistedProfile.Icon.Should().BeNull();
		persistedProfile.Tone.Should().BeNull();

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUpdated,
			Guid.Parse(profileId)
		);
		AssertStyleAuditDetails(
			auditLog,
			tenantId,
			Guid.Parse(profileId),
			payload.Profile.Name,
			new Dictionary<string, (string? Old, string? New)> {
				["icon"] = ("shield", null),
				["tone"] = ("2", null),
			}
		);
	}

	[Fact]
	public async Task ItShouldLeaveIconAndToneUnchangedWhenOmitted() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);
		await SetProfileStyleAsync(Guid.Parse(profileId), "briefcase", "3");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			description = "Style fields omitted",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Profile.Icon.Should().Be("briefcase");
		payload.Profile.Tone.Should().Be("3");

		var persistedProfile = await GetProfileAsync(Guid.Parse(profileId));
		persistedProfile.Icon.Should().Be("briefcase");
		persistedProfile.Tone.Should().Be("3");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidTone() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { tone = "8" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Tone");
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
		Assert.NotNull(payload);
		payload.Profile.Description.Should().Be(noOpDescription);

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
			name = name ?? ("Tenant Profile " + Guid.NewGuid().ToString("N")[..8]),
			description = "Profile created for update tests",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		return payload.Profile.Id.ToString();
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
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private async Task SetProfileStyleAsync(
		Guid profileId,
		string icon,
		string tone
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var profile = await dbContext.Profile.SingleAsync(item => item.Id == profileId);
		profile.Icon = icon;
		profile.Tone = tone;
		await dbContext.SaveChangesAsync();
	}

	private async Task AddProfilePermissionAsync(
		Guid profileId,
		string permissionKey
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
			ProfileId = profileId,
			PermissionKey = permissionKey,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<Profile> GetProfileAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.Profile
			.AsNoTracking()
			.SingleAsync(item => item.Id == profileId);
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
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
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

	private static void AssertStyleAuditDetails(
		AuditLog? auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		string expectedProfileName,
		IReadOnlyDictionary<string, (string? Old, string? New)> expectedChanges
	) {
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantProfileUpdated);
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);

		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;
		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("ProfileId").GetGuid().Should().Be(expectedProfileId);
		details.GetProperty("ProfileName").GetString().Should().Be(expectedProfileName);

		var changedFields = details.GetProperty("ChangedFields");
		changedFields.EnumerateObject()
			.Select(property => property.Name)
			.Should()
			.BeEquivalentTo(expectedChanges.Keys);

		foreach (var expectedChange in expectedChanges) {
			var changedField = changedFields.GetProperty(expectedChange.Key);
			GetNullableString(changedField.GetProperty("Old"))
				.Should().Be(expectedChange.Value.Old);
			GetNullableString(changedField.GetProperty("New"))
				.Should().Be(expectedChange.Value.New);
		}
	}

	private static string? GetNullableString(JsonElement element) {
		if (element.ValueKind == JsonValueKind.Null) {
			return null;
		}

		return element.GetString();
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
