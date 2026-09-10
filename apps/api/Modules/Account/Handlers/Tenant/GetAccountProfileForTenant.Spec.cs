
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Account.Services;

using Xunit;

namespace PublyApp.Api.Modules.Account.Handlers.Tenant;

// Reads the shared seeded Acme admin's profile and compares it against the
// live DB row, so it must not race the classes that mutate Acme (including
// UpdateAccountProfileForTenantSpec, which restores its changes in `finally`).
[Collection("AcmeTenantMutation")]
public sealed class GetAccountProfileForTenantSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetAccountProfileForTenantSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl() {
		return PathUtils.Join(
			Routes.Tenant.Root,
			Routes.Account.ForTenant.Root,
			Routes.Account.ForTenant.Profile
		);
	}

	[Fact]
	public async Task
	ItShouldReturnTheTenantScopedProfileForAMember() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var (acmeAdminToken, acmeAdminUserId) =
			await _LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<AccountProfileResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var persistedUser = await _GetUserByIdAsync(acmeAdminUserId);
		result.Id.Should().Be(acmeAdminUserId);
		result.Email.Should().Be(persistedUser.Email);
		result.FirstName.Should().Be(persistedUser.FirstName);
		result.LastName.Should().Be(persistedUser.LastName);
		result.AvatarUrl.Should().Be(persistedUser.AvatarUrl);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForANonMember() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		// TechStart admin is NOT a member of Acme — the TenantAuthFilter
		// answers 403 before the handler runs (D9: no tenant-id probing).
		var techStartAdminToken =
			await _AuthClient.LoginAsync(
				TestConstants.TechStartAdminEmail,
				TestConstants.SeedPassword
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl()
		)
			.WithSessionToken(techStartAdminToken)
			.WithTenantId(acmeId);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// The TenantAuthFilter (same membership predicate) already answers 403
	// for anyone without an active tenant account, so the handler's NotFound
	// branch is only reachable if the account vanishes between the filter and
	// the handler. The service seam is where that contract lives — a null
	// result must map to NotFound in the handler.
	[Fact]
	public async Task
	ItShouldReturnNullWhenTheTenantAccountIsMissing() {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<IAccountProfileService>();

		var result = await service.GetAccountProfileAsync(
			Guid.NewGuid(),
			Guid.NewGuid()
		);

		result.Should().BeNull();
	}

	private async Task<(string Token, Guid UserId)>
	_LoginAsAcmeAdminAsync() {
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserAuthData
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content
			.ReadFromJsonAsync<UserAuthDataResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize user-auth-data response"
			);
		}

		return (token, result.Id);
	}

	private async Task<UserRow> _GetUserByIdAsync(Guid userId) {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.User
			.AsNoTracking()
			.Where(user => user.Id == userId)
			.Select(user => new UserRow(
				user.Email,
				user.FirstName,
				user.LastName,
				user.AvatarUrl
			))
			.SingleAsync();
	}

	private sealed record UserAuthDataResponse(
		Guid Id
	);

	private sealed record UserRow(
		string Email,
		string? FirstName,
		string? LastName,
		string? AvatarUrl
	);
}
