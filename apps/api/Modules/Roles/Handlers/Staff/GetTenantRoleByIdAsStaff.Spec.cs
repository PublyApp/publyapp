
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class GetTenantRoleByIdAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetTenantRoleByIdAsStaffSpec(ApiFixture fixture) {
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string tenantId, string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.GetFn(roleId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetTenantRoleByIdAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsAcmeAdminAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Get,
			GetTenantRoleByIdAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString()),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Get,
			GetTenantRoleByIdAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString()),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Get,
			GetTenantRoleByIdAsStaffSpec._GetUrl("not-a-guid", Guid.NewGuid().ToString()),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		await response.ShouldBeProblemAsync(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Get,
			GetTenantRoleByIdAsStaffSpec._GetUrl(tenantId.ToString(), "not-a-guid"),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		await response.ShouldBeProblemAsync(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Get,
			GetTenantRoleByIdAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString()),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnCreatedRoleById() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateTenantRoleAsync(token, tenantId);

		var payload = await this._Http.GetOkAsync<GetTenantRoleByIdResponse>(
			GetTenantRoleByIdAsStaffSpec._GetUrl(tenantId.ToString(), roleId),
			token
		);
		payload.Role.Id.Should().Be(Guid.Parse(roleId));
		payload.Role.Name.Should().StartWith("Tenant Role");
		payload.Role.IsDefault.Should().BeFalse();
		// Timestamps are exposed for the role Overview tab (staff view). A
		// freshly created role has non-default audit timestamps.
		payload.Role.CreatedAt.Should().NotBe(default);
		payload.Role.UpdatedAt.Should().NotBe(default);
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> _CreateTenantRoleAsync(
		string staffToken,
		Guid tenantId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Roles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Roles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = "Tenant Role " + Guid.NewGuid().ToString("N")[..8],
				description = "Role created for get-by-id tests",
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.Role.Id.ToString();
	}

	private sealed record GetTenantRoleByIdResponse {
		public required TenantRoleItemResponse Role { get; init; }
	}

	private sealed record TenantRoleItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public bool IsDefault { get; init; }
		public int UserAccountCount { get; init; }
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
