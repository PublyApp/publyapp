
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class ResolveStaffRoleUserAssignmentsSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public ResolveStaffRoleUserAssignmentsSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Users.ResolveAssignmentFn(roleId)
		);
	}

	private static string _GetCreateRoleUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);
	}

	private static string _GetFindStaffUsersUrl(string? q = null) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		);

		if (q is null) {
			return url;
		}

		return url + $"?q={Uri.EscapeDataString(q)}&limit=50";
	}

	private static string _GetUpdateUserRolesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Roles.UpdateFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var response = await this._Http.PostAsJsonAsync(
			ResolveStaffRoleUserAssignmentsSpec._GetUrl(Guid.NewGuid().ToString()),
			new { userIds = new[] { Guid.NewGuid().ToString() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenRoleDoesNotExist() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveStaffRoleUserAssignmentsSpec._GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldResolveAssignmentsForRequestedUsers() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		var roleId = await this._CreateStaffRoleAsync(token);
		var staffUserId = await this._GetStaffUserIdByEmailAsync(
			TestConstants.StaffAdminEmail,
			token
		);
		// Keep the seeded admin's full-access role: the update replaces the whole set, and
		// removing the last full-access holder is refused by the staff last-admin guard.
		var fullAccessRoleId = await this._GetStaffFullAccessRoleIdAsync();

		// Assign the role to the staff user so the resolver has something to find.
		using (var updateRequest = new HttpRequestMessage(
			HttpMethod.Put,
			ResolveStaffRoleUserAssignmentsSpec._GetUpdateUserRolesUrl(staffUserId)
		).WithSessionToken(token)) {
			updateRequest.Content = JsonContent.Create(
				new { roleIds = new[] { roleId, fullAccessRoleId.ToString() } }
			);

			using var updateResponse = await this._Http.SendAsync(updateRequest);
			updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveStaffRoleUserAssignmentsSpec._GetUrl(roleId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userIds = new[] { staffUserId, Guid.NewGuid().ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveStaffRoleUserAssignmentsResult>();

		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Assignments.Should().Contain(x =>
					x.UserId.ToString() == staffUserId
					&& x.IsAssigned
				);
	}

	private async Task<Guid> _GetStaffFullAccessRoleIdAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await FullAccessRoleTestHelper.EnsureStaffRoleAsync(dbContext);
	}

	private async Task<string> _CreateStaffRoleAsync(string staffToken) {
		var name = "Test Role Resolve " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveStaffRoleUserAssignmentsSpec._GetCreateRoleUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test role used by ResolveStaffRoleUserAssignmentsSpec",
				permissions = new[] {
					AppPermissions.Staff.Roles.LIST_FOR_STAFF.Key
				},
				emails = Array.Empty<string>(),
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content
			.ReadFromJsonAsync<StaffRoleCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.RoleId.ToString();
	}

	private async Task<string> _GetStaffUserIdByEmailAsync(
		string email,
		string staffToken
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			ResolveStaffRoleUserAssignmentsSpec._GetFindStaffUsersUrl(email)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		result.Should().NotBeNull();

		Assert.NotNull(result);
		var user = result.Data.FirstOrDefault(u =>
					string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)
				);

		if (user is null) {
			throw new InvalidOperationException(
				$"Staff user with email '{email}' not found"
			);
		}

		return user.Id.ToString();
	}

	// -- Response DTOs --
	private record StaffRoleCreatedResponse {
		public Guid RoleId { get; init; }
	}

	private record FindStaffUsersResponse {
		public List<StaffUserItem> Data { get; init; } = [];
	}

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
	}
}
