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
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

/// <summary>
/// #2322: the staff full-access system role is the source of every staff permission, so
/// suspending or deleting its last holder must be refused (same invariant and response keys as
/// the tenant last-admin guard). These specs drive the real endpoints; the guard itself lives in
/// <see cref="Services.StaffUserLifecycleService"/>.
/// </summary>
public sealed class StaffUserLastOwnerLifecycleSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public StaffUserLastOwnerLifecycleSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldRefuseToSuspendTheLastStaffOwnerWhenNoOtherActiveOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var adminUserId = await this._MakeSeededAdminTheSoleActiveOwnerAsync(token);

		using var response = await this._SuspendAsync(token, adminUserId);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.CannotSuspendLastAdmin);
		(await this._GetUserStatusAsync(adminUserId)).Should().Be(UserStatus.Active);
	}

	[Fact]
	public async Task ItShouldSuspendAStaffOwnerWhenAnotherActiveStaffOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var targetUserId = await this._SeedStaffOwnerAsync("suspend-allowed");

		using var response = await this._SuspendAsync(token, targetUserId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._GetUserStatusAsync(targetUserId)).Should().Be(UserStatus.Suspended);
	}

	[Fact]
	public async Task ItShouldRefuseToBulkSuspendTheLastStaffOwnerWhenNoOtherActiveOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var adminUserId = await this._MakeSeededAdminTheSoleActiveOwnerAsync(token);

		using var response = await this._BulkSuspendAsync(token, adminUserId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await StaffUserLastOwnerLifecycleSpec._ReadBulkResultAsync(response);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);

		var failed = result.FailedItems.Should().ContainSingle().Subject;
		failed.UserId.Should().Be(adminUserId);
		failed.Error.Should().Be("last-admin");
		(await this._GetUserStatusAsync(adminUserId)).Should().Be(UserStatus.Active);
	}

	[Fact]
	public async Task ItShouldBulkSuspendStaffOwnersWhenAnotherActiveStaffOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var firstUserId = await this._SeedStaffOwnerAsync("bulk-suspend-first");
		var secondUserId = await this._SeedStaffOwnerAsync("bulk-suspend-second");

		using var response = await this._BulkSuspendAsync(
			token,
			firstUserId,
			secondUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await StaffUserLastOwnerLifecycleSpec._ReadBulkResultAsync(response);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		(await this._GetUserStatusAsync(firstUserId)).Should().Be(UserStatus.Suspended);
		(await this._GetUserStatusAsync(secondUserId)).Should().Be(UserStatus.Suspended);
	}

	[Fact]
	public async Task ItShouldRefuseToDeleteTheLastStaffOwnerWhenNoOtherActiveOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var adminUserId = await this._MakeSeededAdminTheSoleActiveOwnerAsync(token);

		using var response = await this._DeleteAsync(token, adminUserId);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.CannotRemoveLastAdmin);
	}

	[Fact]
	public async Task ItShouldDeleteASuspendedStaffOwnerWhenAnotherActiveStaffOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var targetUserId = await this._SeedStaffOwnerAsync("delete-allowed");

		using var suspendResponse = await this._SuspendAsync(token, targetUserId);
		suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var response = await this._DeleteAsync(token, targetUserId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var body = await response.Content.ReadFromJsonAsync<ApiResponse>();
		body.Should().NotBeNull();
		Assert.NotNull(body);
		body.Key.Should().Be(ResponseKeys.StaffUserDeletedSuccess);
	}

	[Fact]
	public async Task ItShouldRefuseToBulkDeleteTheLastStaffOwnerWhenNoOtherActiveOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var adminUserId = await this._MakeSeededAdminTheSoleActiveOwnerAsync(token);

		using var response = await this._BulkDeleteAsync(token, adminUserId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await StaffUserLastOwnerLifecycleSpec._ReadBulkResultAsync(response);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);

		var failed = result.FailedItems.Should().ContainSingle().Subject;
		failed.UserId.Should().Be(adminUserId);
		failed.Error.Should().Be("last-admin");
	}

	[Fact]
	public async Task ItShouldBulkDeleteSuspendedStaffOwnersWhenAnotherActiveStaffOwnerRemains() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var firstUserId = await this._SeedStaffOwnerAsync("bulk-delete-first");
		var secondUserId = await this._SeedStaffOwnerAsync("bulk-delete-second");

		foreach (var targetUserId in new[] { firstUserId, secondUserId }) {
			using var suspendResponse = await this._SuspendAsync(token, targetUserId);
			suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using var response = await this._BulkDeleteAsync(token, firstUserId, secondUserId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await StaffUserLastOwnerLifecycleSpec._ReadBulkResultAsync(response);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
	}

	/// <summary>
	/// The seed can leave more than one full-access holder (owner bootstrap). Demote every other
	/// holder — each demotion is legitimate while a holder remains — so a refused call is
	/// provably the last-owner case.
	/// </summary>
	private async Task<Guid> _MakeSeededAdminTheSoleActiveOwnerAsync(string token) {
		var adminUserId = await this._GetSeededAdminUserIdAsync();

		foreach (var holderUserId in await this._GetActiveOwnerUserIdsAsync()) {
			if (holderUserId == adminUserId) {
				continue;
			}

			using var request = new HttpRequestMessage(
				HttpMethod.Put,
				PathUtils.Join(
					Routes.Staff.Root,
					Routes.Users.ForStaff.Root,
					Routes.Users.ForStaff.Roles.UpdateFn(holderUserId.ToString())
				)
			).WithSessionToken(token);
			request.Content = JsonContent.Create(new { roleIds = Array.Empty<string>() });

			using var response = await this._Http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		var remainingOwnerIds = await this._GetActiveOwnerUserIdsAsync();
		remainingOwnerIds.Should().ContainSingle(
			"the seeded admin must be the only active staff owner"
		);
		remainingOwnerIds[0].Should().Be(adminUserId);

		return adminUserId;
	}

	private async Task<Guid> _GetSeededAdminUserIdAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var email = TestConstants.StaffAdminEmail.Trim().ToLowerInvariant();

		var userId = await (
			from user in dbContext.User.AsNoTracking()
			where user.Email == email
			select user.Id
		).FirstOrDefaultAsync();

		if (userId is null) {
			throw new InvalidOperationException($"Seeded staff admin '{email}' was not found.");
		}

		return userId.Value;
	}

	private async Task<List<Guid>> _GetActiveOwnerUserIdsAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await FullAccessRoleQueries.ActiveStaffFullAccessAccounts(dbContext)
			.Select(account => account.UserId)
			.ToListAsync();
	}

	private async Task<UserStatus> _GetUserStatusAsync(Guid userId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.User
			.AsNoTracking()
			.Where(user => user.Id == userId)
			.Select(user => user.Status)
			.FirstAsync();
	}

	private Task<Guid> _SeedStaffOwnerAsync(string prefix) {
		return StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			$"{prefix}-{Guid.NewGuid():N}@example.com",
			firstName: "Staff",
			lastName: "Owner",
			fullAccess: true
		);
	}

	private async Task<HttpResponseMessage> _SuspendAsync(string token, Guid userId) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.SuspendFn(userId.ToString())
			)
		).WithSessionToken(token);

		return await this._Http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> _DeleteAsync(string token, Guid userId) {
		var request = new HttpRequestMessage(
			HttpMethod.Delete,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.DeleteFn(userId.ToString())
			)
		).WithSessionToken(token);

		return await this._Http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> _BulkSuspendAsync(string token, params Guid[] userIds) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.BulkSuspend
			)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds });

		return await this._Http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> _BulkDeleteAsync(string token, params Guid[] userIds) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.BulkDelete
			)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds });

		return await this._Http.SendAsync(request);
	}

	private static async Task<BulkStaffUserActionResponse> _ReadBulkResultAsync(
		HttpResponseMessage response
	) {
		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		if (result is null) {
			throw new InvalidOperationException("Failed to deserialize the bulk action result.");
		}

		return result;
	}

	private sealed record BulkStaffUserActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public required List<BulkStaffUserFailedItemResponse> FailedItems { get; init; }
	}

	private sealed record BulkStaffUserFailedItemResponse {
		public Guid UserId { get; init; }
		public string Error { get; init; } = string.Empty;
	}
}
