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
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class DeleteStaffUserSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public DeleteStaffUserSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetDeleteUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.DeleteFn(userId)
		);
	}

	private static string _GetFindUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		) + "?limit=100";
	}

	private static string _GetByIdUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.GetByIdFn(userId)
		);
	}

	private static string _GetRolesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Roles.GetFn(userId)
		);
	}

	private static string _GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
		);
	}

	private static string _GetUpdateRolesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Roles.UpdateFn(userId)
		);
	}

	private static string _GetCreateRoleUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);
	}

	private static async Task<T> _ReadRequiredJsonAsync<T>(HttpContent content) {
		var value = await content.ReadFromJsonAsync<T>();
		if (value is null) {
			throw new InvalidOperationException($"Failed to deserialize {typeof(T).Name}.");
		}

		return value;
	}

	[Fact]
	public async Task ItShouldSoftDeleteSuspendedStaffUserAndHideThemFromAllStaffSurfaces() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var email = $"delete-{Guid.NewGuid():N}@example.com";
		var userId = await this._CreateStaffUserAsync(staffToken, email);
		var firstRoleId = await this._CreateStaffRoleAsync(staffToken);
		var secondRoleId = await this._CreateStaffRoleAsync(staffToken);

		await this._AssignRolesAsync(
			staffToken,
			userId,
			firstRoleId,
			secondRoleId
		);
		await this._SuspendStaffUserAsync(staffToken, userId);

		using var response = await this._DeleteStaffUserAsync(staffToken, userId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var body = await DeleteStaffUserSpec._ReadRequiredJsonAsync<ApiResponse>(response.Content);
		body.Key.Should().Be(ResponseKeys.StaffUserDeletedSuccess);

		await this._AssertSoftDeletedRowsAsync(userId, expectedRoleLinkCount: 0);
		await this._AssertFindStaffUsersDoesNotContainAsync(staffToken, userId);
		await this._AssertGetStaffUserReturnsNotFoundAsync(staffToken, userId);
		await this._AssertGetStaffUserRolesReturnsNotFoundAsync(staffToken, userId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenDeletingWithMalformedId() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._DeleteStaffUserAsync(staffToken, "not-a-guid");

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var body = await DeleteStaffUserSpec._ReadRequiredJsonAsync<AppProblemDetails>(response.Content);
		body.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenDeletingMissingStaffUser() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._DeleteStaffUserAsync(
			staffToken,
			Guid.NewGuid().ToString()
		);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var body = await DeleteStaffUserSpec._ReadRequiredJsonAsync<AppProblemDetails>(response.Content);
		body.TranslationKey.Should().Be(ResponseKeys.UserNotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenDeletingANonSuspendedStaffUser() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var userId = await this._CreateStaffUserAsync(
			staffToken,
			$"not-suspended-{Guid.NewGuid():N}@example.com"
		);

		using var response = await this._DeleteStaffUserAsync(staffToken, userId);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var body = await DeleteStaffUserSpec._ReadRequiredJsonAsync<AppProblemDetails>(response.Content);
		body.TranslationKey.Should().Be(ResponseKeys.StaffUserNotSuspendedCannotDelete);
	}

	private async Task _AssertSoftDeletedRowsAsync(
		string userId,
		int expectedRoleLinkCount
	) {
		var userIdGuid = Guid.Parse(userId);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x => x.Id == userIdGuid);
		user.Should().NotBeNull();
		Assert.NotNull(user);
		user.IsDeleted.Should().BeTrue();
		user.DeletedAt.Should().NotBeNull();

		var staffAccount = await dbContext.UserAccount
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x =>
				x.UserId == userIdGuid
				&& x.Scope == AccountScope.Staff
			);
		staffAccount.Should().NotBeNull();
		Assert.NotNull(staffAccount);
		staffAccount.IsDeleted.Should().BeTrue();
		staffAccount.DeletedAt.Should().NotBeNull();

		var userAccountRoles = await dbContext.UserAccountRole
			.IgnoreQueryFilters()
			.Where(x => x.UserAccountId == staffAccount.GetRequiredId())
			.ToListAsync();

		// Role links are active-state rows; deleting the staff account removes them.
		userAccountRoles.Should().HaveCount(expectedRoleLinkCount);
	}

	private async Task<string> _CreateStaffUserAsync(string staffToken, string email) {
		_ = staffToken;
		// Direct create is intentionally unmapped; delete tests seed setup users directly.
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			email,
			firstName: "Staff",
			lastName: "DeleteTarget"
		);
		return userId.ToString();
	}

	private async Task<string> _CreateStaffRoleAsync(string staffToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			DeleteStaffUserSpec._GetCreateRoleUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = "Delete Staff User " + Guid.NewGuid().ToString("N")[..8],
				description = "Role used by DeleteStaffUserSpec",
				permissions = new[] { AppPermissions.Staff.Users.LIST_FOR_STAFF.Key },
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

	private async Task _AssignRolesAsync(
		string staffToken,
		string userId,
		params string[] roleIds
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			DeleteStaffUserSpec._GetUpdateRolesUrl(userId)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { roleIds });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task _SuspendStaffUserAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			DeleteStaffUserSpec._GetSuspendUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<HttpResponseMessage> _DeleteStaffUserAsync(string staffToken, string userId) {
		var request = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteStaffUserSpec._GetDeleteUrl(userId)
		).WithSessionToken(staffToken);

		return await this._Http.SendAsync(request);
	}

	private async Task _AssertFindStaffUsersDoesNotContainAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			DeleteStaffUserSpec._GetFindUrl()
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().NotContain(x => x.Id == Guid.Parse(userId));
	}

	private async Task _AssertGetStaffUserReturnsNotFoundAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			DeleteStaffUserSpec._GetByIdUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task _AssertGetStaffUserRolesReturnsNotFoundAsync(
		string staffToken,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			DeleteStaffUserSpec._GetRolesUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private sealed class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private sealed record StaffUserItem {
		public Guid Id { get; init; }
	}

	private sealed record StaffRoleCreatedResponse {
		public Guid RoleId { get; init; }
	}
}
