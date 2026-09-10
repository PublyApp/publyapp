
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
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public sealed class CreateStaffInvitationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateStaffInvitationSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToCreateStaffInvitation() {
		string staffUserToken = await _LoginAsStaffUserWithInvitationPermissionAsync(
			AppPermissions.Staff.Invitations.CREATE_FOR_STAFF.Key
		);
		string email = $"staff-create-permissioned-{Guid.NewGuid():N}@example.com";
		Guid profileId = await _GetAnyStaffProfileIdAsync();

		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(Routes.Staff.Root, Routes.Invitations.ForStaff.Root)
		).WithSessionToken(staffUserToken);

		request.Content = JsonContent.Create(new {
			email,
			profileId = profileId.ToString()
		});

		using HttpResponseMessage response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Created);
	}

	private async Task<string> _LoginAsStaffUserWithInvitationPermissionAsync(
		string permissionKey
	) {
		using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
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

		Profile profile = Profile.CreateStaffProfile(
			$"staff-create-permission-{Guid.NewGuid():N}",
			"Test-only staff profile for create invitation permission"
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
			ProfileId = profile.GetRequiredId(),
			PermissionKey = permissionKey
		});
		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = staffAccount.GetRequiredId(),
			ProfileId = profile.GetRequiredId()
		});
		await dbContext.SaveChangesAsync();

		return await _AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);
	}

	private async Task<Guid> _GetAnyStaffProfileIdAsync() {
		using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Profile profile = await dbContext.Profile
			.Where(profile =>
				profile.Scope == ProfileScope.Staff
				&& !profile.IsDeleted
			)
			.OrderBy(profile => profile.Name)
			.FirstAsync();

		return profile.GetRequiredId();
	}
}
