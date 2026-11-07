
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
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public sealed class CreateStaffInvitationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateStaffInvitationSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToCreateStaffInvitation() {
		string staffUserToken = await this._LoginAsStaffUserWithInvitationPermissionAsync(
			AppPermissions.Staff.Invitations.CREATE_FOR_STAFF.Key
		);
		string email = $"staff-create-permissioned-{Guid.NewGuid():N}@example.com";
		Guid roleId = await this._GetAnyStaffRoleIdAsync();

		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(Routes.Staff.Root, Routes.Invitations.ForStaff.Root)
		).WithSessionToken(staffUserToken);

		request.Content = JsonContent.Create(new {
			email,
			roleId = roleId.ToString()
		});

		using HttpResponseMessage response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Created);
	}

	private async Task<string> _LoginAsStaffUserWithInvitationPermissionAsync(
		string permissionKey
	) {
		using IServiceScope scope = this._Fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		User staffUser = await dbContext.User
			.Where(user => user.Email == TestConstants.StaffUserEmail)
			.FirstAsync();
		UserAccount staffAccount = await dbContext.UserAccount
			.Where(account =>
				account.UserId == staffUser.GetRequiredId()
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			)
			.FirstAsync();

		Role role = Role.CreateStaffRole(
			$"staff-create-permission-{Guid.NewGuid():N}",
			"Test-only staff role for create invitation permission"
		);

		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		await dbContext.RolePermission.AddAsync(new RolePermission {
			RoleId = role.GetRequiredId(),
			PermissionKey = permissionKey
		});
		await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
			UserAccountId = staffAccount.GetRequiredId(),
			RoleId = role.GetRequiredId()
		});
		await dbContext.SaveChangesAsync();

		return await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);
	}

	private async Task<Guid> _GetAnyStaffRoleIdAsync() {
		using IServiceScope scope = this._Fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Role role = await dbContext.Role
			.Where(role =>
				role.Scope == RoleScope.Staff
				&& !role.IsDeleted
			)
			.OrderBy(role => role.Name)
			.FirstAsync();

		return role.GetRequiredId();
	}
}
