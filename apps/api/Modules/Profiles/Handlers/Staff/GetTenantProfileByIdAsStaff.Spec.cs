
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class GetTenantProfileByIdAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetTenantProfileByIdAsStaffSpec(ApiFixture fixture) {
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.GetFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await _GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
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
			HttpMethod.Get,
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
			HttpMethod.Get,
			_GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
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
			HttpMethod.Get,
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
			HttpMethod.Get,
			_GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnCreatedProfileById() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await _GetTenantIdAsync();
		var profileId = await _CreateTenantProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Profile.Id.Should().Be(Guid.Parse(profileId));
		payload.Profile.Name.Should().StartWith("Tenant Profile");
		payload.Profile.IsDefault.Should().BeFalse();
		// Timestamps are exposed for the profile Overview tab (staff view). A
		// freshly created profile has non-default audit timestamps.
		payload.Profile.CreatedAt.Should().NotBe(default);
		payload.Profile.UpdatedAt.Should().NotBe(default);
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> _CreateTenantProfileAsync(
		string staffToken,
		Guid tenantId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Profiles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Profiles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = "Tenant Profile " + Guid.NewGuid().ToString("N")[..8],
				description = "Profile created for get-by-id tests",
			}
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<GetTenantProfileByIdResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.Profile.Id.ToString();
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
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
