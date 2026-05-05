namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class CreateStaffInvitationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateStaffInvitationSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToCreateStaffInvitation() {
		string staffUserToken = await LoginAsStaffUserWithInvitationPermissionAsync(
			AppPermissions.Staff.Invitations.CREATE_FOR_STAFF.Key
		);
		string email = $"staff-create-permissioned-{Guid.NewGuid():N}@example.com";
		Guid profileId = await GetAnyStaffProfileIdAsync();

		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(Routes.Staff.Root, Routes.Invitations.ForStaff.Root)
		).WithSessionToken(staffUserToken);

		request.Content = JsonContent.Create(new {
			email,
			profileId = profileId.ToString()
		});

		using HttpResponseMessage response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Created);
	}

	private async Task<string> LoginAsStaffUserWithInvitationPermissionAsync(
		string permissionKey
	) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		MainApiDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

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

		return await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);
	}

	private async Task<Guid> GetAnyStaffProfileIdAsync() {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		MainApiDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

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
