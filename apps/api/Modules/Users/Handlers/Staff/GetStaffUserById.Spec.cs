
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

public sealed class GetStaffUserByIdSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetStaffUserByIdSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	// Success path: the endpoint was previously reached only through its failure
	// branches (docs/records/2026-10-28-analysis-endpoint-coverage.md).
	[Fact]
	public async Task
	ItShouldReturnTheStaffUserForAnExistingId() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var userId = await this._GetUserIdByEmailAsync(
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffUserByIdSpec._GetUrl(userId.ToString())
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var details = await response.Content
			.ReadFromJsonAsync<GetStaffUserByIdResult>();
		details.Should().NotBeNull();
		Assert.NotNull(details);
		details.Id.Should().Be(userId);
		details.Email.Should().Be(TestConstants.StaffAdminEmail);
		details.AccountLevel.Should().Be(AccountLevel.Admin);
		details.Status.Should().Be(UserStatus.Active);
		details.CreatedAt.Should().BeBefore(DateTime.UtcNow);
		details.UpdatedAt.Should().BeOnOrAfter(details.CreatedAt);
	}

	// The read model is staff-scoped: an existing TENANT user id is not a staff user,
	// so it must be indistinguishable from an unknown id.
	[Fact]
	public async Task
	ItShouldReturnNotFoundForATenantUserId() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantUserId = await this._GetUserIdByEmailAsync(
			TestConstants.AcmeAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffUserByIdSpec._GetUrl(tenantUserId.ToString())
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<Guid> _GetUserIdByEmailAsync(string email) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.User
			.Where(user => user.Email == email)
			.Select(user => user.GetRequiredId())
			.SingleAsync();
	}

	private static string _GetUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.GetByIdFn(userId)
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var url = GetStaffUserByIdSpec._GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var url = GetStaffUserByIdSpec._GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url = GetStaffUserByIdSpec._GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await this._AuthClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = GetStaffUserByIdSpec._GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await this._AuthClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = GetStaffUserByIdSpec._GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}
}
