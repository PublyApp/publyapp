
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class UpdateStaffUserSuspensionInvariantSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public UpdateStaffUserSuspensionInvariantSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
		);
	}

	private static string _GetReactivateUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.ReactivateFn(userId)
		);
	}

	[Fact]
	public async Task
	ItShouldSetIsSuspendedAndBlockLoginWhenStatusSetToSuspended() {
		var adminToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var userId = await _GetUserIdByEmailAsync(
			TestConstants.StaffUserEmail
		);

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetSuspendUrl(userId)
		).WithSessionToken(adminToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<StaffUserSuspendedResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be(UserStatus.Suspended);

		await using (
			var scope =
				_Fixture.Factory.Services.CreateAsyncScope()
		) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var user = await dbContext.User
				.AsNoTracking()
				.FirstOrDefaultAsync(u =>
					u.Id == Guid.Parse(userId)
				);

			user.Should().NotBeNull();
			Assert.NotNull(user);
			user.Status.Should().Be(UserStatus.Suspended);
		}

		using var loginResponse =
			await _Http.PostAsJsonAsync(
				Routes.Auth.Login,
				new {
					email = TestConstants.StaffUserEmail,
					password = TestConstants.SeedPassword,
				}
			);

		loginResponse.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await loginResponse.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();

		// Cleanup: keep the seed staff user active so other specs can reuse it safely.
		using var reactivateRequest = new HttpRequestMessage(
			HttpMethod.Post,
			_GetReactivateUrl(userId)
		).WithSessionToken(adminToken);
		using var reactivateResponse = await _Http.SendAsync(reactivateRequest);
		reactivateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldClearIsSuspendedAndAllowLoginWhenStatusSetBackToActive() {
		const string targetEmail = TestConstants.StaffUserEmail;

		var adminToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var userId = await _GetUserIdByEmailAsync(targetEmail);

		var suspendRequest = new HttpRequestMessage(
			HttpMethod.Post,
			_GetSuspendUrl(userId)
		).WithSessionToken(adminToken);

		using var suspendResponse =
			await _Http.SendAsync(suspendRequest);
		suspendResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var reactivateRequest = new HttpRequestMessage(
			HttpMethod.Post,
			_GetReactivateUrl(userId)
		).WithSessionToken(adminToken);

		using var reactivateResponse =
			await _Http.SendAsync(reactivateRequest);

		reactivateResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await reactivateResponse.Content
			.ReadFromJsonAsync<StaffUserReactivatedResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be(UserStatus.Active);

		await using (
			var scope =
				_Fixture.Factory.Services.CreateAsyncScope()
		) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var user = await dbContext.User
				.AsNoTracking()
				.FirstOrDefaultAsync(u =>
					u.Id == Guid.Parse(userId)
				);

			user.Should().NotBeNull();
			Assert.NotNull(user);
			user.Status.Should().Be(UserStatus.Active);
		}

		var userToken = await _AuthClient.LoginAsync(
			targetEmail,
			TestConstants.SeedPassword
		);

		userToken.Should().NotBeNullOrWhiteSpace();
	}

	private async Task<string> _GetUserIdByEmailAsync(
		string email
	) {
		var normalizedEmail = email.Trim().ToLowerInvariant();

		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var userId = await (
			from u in dbContext.User.AsNoTracking()
			where u.Email == normalizedEmail
			select u.Id
		)
			.FirstOrDefaultAsync();

		if (userId is null) {
			throw new InvalidOperationException(
				$"User with email '{email}' not found"
			);
		}

		return userId.Value.ToString();
	}
}
