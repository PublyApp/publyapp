
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
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetAccountProfileForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl() {
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
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var (acmeAdminToken, acmeAdminUserId) =
			await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<AccountProfileResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var persistedUser = await GetUserByIdAsync(acmeAdminUserId);
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
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		// TechStart admin is NOT a member of Acme — the TenantAuthFilter
		// answers 403 before the handler runs (D9: no tenant-id probing).
		var techStartAdminToken =
			await _authClient.LoginAsync(
				TestConstants.TechStartAdminEmail,
				TestConstants.SeedPassword
			);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl()
		)
			.WithSessionToken(techStartAdminToken)
			.WithTenantId(acmeId);

		using var response = await _http.SendAsync(request);

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
			_fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<IAccountProfileService>();

		var result = await service.GetAccountProfileAsync(
			Guid.NewGuid(),
			Guid.NewGuid()
		);

		result.Should().BeNull();
	}

	private async Task<(string Token, Guid UserId)>
	LoginAsAcmeAdminAsync() {
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserAuthData
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
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

	private async Task<UserRow> GetUserByIdAsync(Guid userId) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
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
