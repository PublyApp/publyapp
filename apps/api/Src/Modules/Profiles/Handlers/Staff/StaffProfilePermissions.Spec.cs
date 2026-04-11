namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class StaffProfilePermissionsSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public StaffProfilePermissionsSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	private static string GetListPermissionsUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Permissions.FindFn(profileId)
		);
	}

	private static string GetPermissionToggleUrl(string profileId, string permissionKey) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Permissions.UpsertFn(profileId, permissionKey)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListPermissionsUrl(Guid.NewGuid().ToString())
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListPermissionsUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListPermissionsUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListPermissionsUrl("not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListPermissionsUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnAssignedPermissionKeysSorted() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListPermissionsUrl(profileId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		payload.Should().NotBeNull();
		payload!.PermissionKeys.Should().NotBeEmpty();
		payload.PermissionKeys.Should().BeInAscendingOrder();
	}

	[Fact]
	public async Task ItShouldAssignAndUnassignPermissions() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token);

		var permissionKey = AppPermissions.Staff.Users.LIST_FOR_STAFF.Key;

		// Assign: POST is idempotent.
		using (var assignRequest = new HttpRequestMessage(
			HttpMethod.Post,
			GetPermissionToggleUrl(profileId, permissionKey)
		).WithSessionToken(token)) {
			using var assignResponse = await _http.SendAsync(assignRequest);
			assignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		// Assign again (idempotent)
		using (var assignRequest2 = new HttpRequestMessage(
			HttpMethod.Post,
			GetPermissionToggleUrl(profileId, permissionKey)
		).WithSessionToken(token)) {
			using var assignResponse2 = await _http.SendAsync(assignRequest2);
			assignResponse2.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var afterAssign = await GetPermissionKeysAsync(token, profileId);
		afterAssign.Should().Contain(permissionKey);
		afterAssign.Should().OnlyHaveUniqueItems();

		// Unassign: DELETE is idempotent.
		using (var unassignRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			GetPermissionToggleUrl(profileId, permissionKey)
		).WithSessionToken(token)) {
			using var unassignResponse = await _http.SendAsync(unassignRequest);
			unassignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var afterUnassign = await GetPermissionKeysAsync(token, profileId);
		afterUnassign.Should().NotContain(permissionKey);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAssigningUnknownPermissionKey() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetPermissionToggleUrl(profileId, "staff.this.does.not.exist")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldTreatUnassignUnknownPermissionKeyAsNoOp() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetPermissionToggleUrl(profileId, "staff.this.does.not.exist")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);
	}

	// -- Helpers --

	private async Task<string> CreateStaffProfileAsync(string staffToken) {
		var url = GetCreateProfileUrl();
		var name = "Test Profile Perms " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile used by StaffProfilePermissionsSpec",
				permissions = new[] {
					AppPermissions.Staff.Profiles.LIST_FOR_STAFF.Key,
					AppPermissions.Staff.Profiles.GET_FOR_STAFF.Key,
				},
				emails = Array.Empty<string>(),
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		return created!.ProfileId.ToString();
	}

	private async Task<List<string>> GetPermissionKeysAsync(string staffToken, string profileId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListPermissionsUrl(profileId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize permission list payload");
		}

		return payload.PermissionKeys;
	}

	// -- Response DTOs --

	private record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}

	private record ListPermissionsResponse {
		public List<string> PermissionKeys { get; init; } = [];
	}
}
