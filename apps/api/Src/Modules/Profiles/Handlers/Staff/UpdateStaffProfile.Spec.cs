namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text;

using FluentAssertions;

using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class UpdateStaffProfileSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateStaffProfileSpec(ApiFixture fixture) {
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

	private static string GetUpdateProfileUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.UpdateFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateProfileUrl(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { name = "Any name" });

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
			HttpMethod.Patch,
			GetUpdateProfileUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Any name" });

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
			HttpMethod.Patch,
			GetUpdateProfileUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Any name" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateProfileUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Any name" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForEmptyPatchBody() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token, "Update Empty Patch");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateProfileUrl(profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidName() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token, "Update Invalid Name");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateProfileUrl(profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "a" });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.Errors.Should().ContainKey("Name");
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenProfileNameAlreadyExists() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var profileId1 = await CreateStaffProfileAsync(token, "Update Name Exists A");
		var profileId2 = await CreateStaffProfileAsync(token, "Update Name Exists B");

		var existingName = await GetProfileNameAsync(token, profileId2);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateProfileUrl(profileId1)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = existingName });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be("profile-name-already-exists");
	}

	[Fact]
	public async Task ItShouldUpdateProfileNameAndDescription() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token, "Update Happy Path");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateProfileUrl(profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = "Renamed " + Guid.NewGuid().ToString("N")[..8],
			description = "New description",
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var updated = await response.Content.ReadFromJsonAsync<GetStaffProfileByIdResponse>();
		updated.Should().NotBeNull();
		updated!.Profile.Name.Should().StartWith("Renamed ");
		updated.Profile.Description.Should().Be("New description");
	}

	[Fact]
	public async Task ItShouldClearDescriptionWhenNullIsProvided() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token, "Update Clear Desc", "Has description");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateProfileUrl(profileId)
		).WithSessionToken(token);

		// Use raw JSON to ensure `description: null` is present in the payload.
		// This verifies the PATCH semantics: null means "clear", undefined means "omit/no change".
		request.Content = new StringContent(
			"{\"description\":null}",
			Encoding.UTF8,
			"application/json"
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var updated = await response.Content.ReadFromJsonAsync<GetStaffProfileByIdResponse>();
		updated.Should().NotBeNull();
		updated!.Profile.Description.Should().BeNull();
	}

	// -- Helpers --

	private async Task<string> CreateStaffProfileAsync(
		string staffToken,
		string namePrefix,
		string? description = "Initial description"
	) {
		var url = GetCreateProfileUrl();
		var name = namePrefix + " " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description,
				permissions = new[] {
					AppPermissions.Staff.Profiles.LIST_FOR_STAFF.Key
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

	private async Task<string> GetProfileNameAsync(string staffToken, string profileId) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.GetFn(profileId)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<GetStaffProfileByIdResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize profile payload");
		}

		return payload.Profile.Name;
	}

	// -- Response DTOs --

	private record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}

	private record GetStaffProfileByIdResponse {
		public required StaffProfileItemResponse Profile { get; init; }
	}

	private record StaffProfileItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
	}
}
