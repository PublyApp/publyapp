
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class StaffRolePermissionsSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public StaffRolePermissionsSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetCreateRoleUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);
	}

	private static string _GetListPermissionsUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Permissions.FindFn(roleId)
		);
	}

	private static string _GetPermissionToggleUrl(string roleId, string permissionKey) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Permissions.UpsertFn(roleId, permissionKey)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			StaffRolePermissionsSpec._GetListPermissionsUrl(Guid.NewGuid().ToString())
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			StaffRolePermissionsSpec._GetListPermissionsUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			StaffRolePermissionsSpec._GetListPermissionsUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			StaffRolePermissionsSpec._GetListPermissionsUrl("not-a-guid")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			StaffRolePermissionsSpec._GetListPermissionsUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnAssignedPermissionKeysSorted() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			StaffRolePermissionsSpec._GetListPermissionsUrl(roleId)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.PermissionKeys.Should().NotBeEmpty();
		payload.PermissionKeys.Should().BeInAscendingOrder();
	}

	[Fact]
	public async Task ItShouldAssignAndUnassignPermissions() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token);

		var permissionKey = AppPermissions.Staff.Users.LIST_FOR_STAFF.Key;

		// Assign: POST is idempotent.
		using (var assignRequest = new HttpRequestMessage(
			HttpMethod.Post,
			StaffRolePermissionsSpec._GetPermissionToggleUrl(roleId, permissionKey)
		).WithSessionToken(token)) {
			using var assignResponse = await this._Http.SendAsync(assignRequest);
			assignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		// Assign again (idempotent)
		using (var assignRequest2 = new HttpRequestMessage(
			HttpMethod.Post,
			StaffRolePermissionsSpec._GetPermissionToggleUrl(roleId, permissionKey)
		).WithSessionToken(token)) {
			using var assignResponse2 = await this._Http.SendAsync(assignRequest2);
			assignResponse2.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var afterAssign = await this._GetPermissionKeysAsync(token, roleId);
		afterAssign.Should().Contain(permissionKey);
		afterAssign.Should().OnlyHaveUniqueItems();

		// Unassign: DELETE is idempotent.
		using (var unassignRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			StaffRolePermissionsSpec._GetPermissionToggleUrl(roleId, permissionKey)
		).WithSessionToken(token)) {
			using var unassignResponse = await this._Http.SendAsync(unassignRequest);
			unassignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var afterUnassign = await this._GetPermissionKeysAsync(token, roleId);
		afterUnassign.Should().NotContain(permissionKey);
	}

	[Fact]
	public async Task ItShouldHardDeletePermissionRowWhenUnassigned() {
		// The public DELETE contract is still idempotent, but internally the row must be
		// gone so the composite primary key represents only active grants.
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token);
		var roleGuid = Guid.Parse(roleId);
		var permissionKey = AppPermissions.Staff.Users.GET_FOR_STAFF.Key;

		using (var assignRequest = new HttpRequestMessage(
			HttpMethod.Post,
			StaffRolePermissionsSpec._GetPermissionToggleUrl(roleId, permissionKey)
		).WithSessionToken(token)) {
			using var assignResponse = await this._Http.SendAsync(assignRequest);
			assignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		(await this._CountRolePermissionRowsAsync(roleGuid, permissionKey))
			.Should().Be(1);

		using (var unassignRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			StaffRolePermissionsSpec._GetPermissionToggleUrl(roleId, permissionKey)
		).WithSessionToken(token)) {
			using var unassignResponse = await this._Http.SendAsync(unassignRequest);
			unassignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		(await this._CountRolePermissionRowsAsync(roleGuid, permissionKey))
			.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAssigningUnknownPermissionKey() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			StaffRolePermissionsSpec._GetPermissionToggleUrl(roleId, "staff.this.does.not.exist")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldTreatUnassignUnknownPermissionKeyAsNoOp() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			StaffRolePermissionsSpec._GetPermissionToggleUrl(roleId, "staff.this.does.not.exist")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);
	}

	// -- Helpers --

	private async Task<string> _CreateStaffRoleAsync(string staffToken) {
		var url = StaffRolePermissionsSpec._GetCreateRoleUrl();
		var name = "Test Role Perms " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test role used by StaffRolePermissionsSpec",
				permissions = new[] {
					AppPermissions.Staff.Roles.LIST_FOR_STAFF.Key,
					AppPermissions.Staff.Roles.GET_FOR_STAFF.Key,
				},
				emails = Array.Empty<string>(),
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffRoleCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.RoleId.ToString();
	}

	private async Task<List<string>> _GetPermissionKeysAsync(string staffToken, string roleId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			StaffRolePermissionsSpec._GetListPermissionsUrl(roleId)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize permission list payload");
		}

		return payload.PermissionKeys;
	}

	private async Task<int> _CountRolePermissionRowsAsync(
		Guid roleId,
		string permissionKey
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.RolePermission
			.IgnoreQueryFilters()
			.CountAsync(pp =>
				pp.RoleId == roleId
				&& pp.PermissionKey == permissionKey
			);
	}

	// -- Response DTOs --

	private record StaffRoleCreatedResponse {
		public Guid RoleId { get; init; }
	}

	private record ListPermissionsResponse {
		public List<string> PermissionKeys { get; init; } = [];
	}
}
