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
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

// GET /auth/user-tenants was never hit by the integration suite (see
// docs/records/2026-10-28-analysis-endpoint-coverage.md). This spec pins the
// success body plus every filter the service applies to a membership: the
// tenant's own status, the account's status, and the page cap that keeps the
// list short while TotalCount still counts everything.
public sealed class GetUserTenantsSpec : IClassFixture<ApiFixture> {
	private const int _PageCap = 5;

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetUserTenantsSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldReturnTheActiveTenantsOfTheCaller() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._GetAsync(token);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<GetUserTenantsResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.TotalCount.Should().Be(2);
		result.Tenants.Should().HaveCount(2);
		// Sorted by name, so the wire order is deterministic.
		result.Tenants.Select(tenant => tenant.Name).Should().Equal(
			SeedConstants.Tenants.AcmeName,
			SeedConstants.Tenants.TechStartName
		);
		result.Tenants.Should().OnlyContain(tenant => tenant.Id != Guid.Empty);
		result.Tenants.Should().Contain(tenant =>
			tenant.Name == SeedConstants.Tenants.AcmeName
			&& tenant.Code == SeedConstants.Tenants.AcmeCode
		);
		result.Tenants.Should().Contain(tenant =>
			tenant.Name == SeedConstants.Tenants.TechStartName
			&& tenant.Code == SeedConstants.Tenants.TechStartCode
		);
	}

	// Both sides of the filter: a suspended tenant is not a usable destination, and a
	// suspended membership is not usable either. A user with one of each must still see
	// the one live tenant, and TotalCount must count only that one.
	[Fact]
	public async Task ItShouldExcludeSuspendedTenantsAndSuspendedMemberships() {
		var (userId, email) = await this._SeedUserAsync();
		var activeTenantId = await this._SeedTenantAsync(
			$"Visible {Guid.NewGuid():N}",
			TenantStatus.Active
		);
		var suspendedMembershipTenantId = await this._SeedTenantAsync(
			$"Membership suspended {Guid.NewGuid():N}",
			TenantStatus.Active
		);
		var suspendedTenantId = await this._SeedTenantAsync(
			$"Tenant suspended {Guid.NewGuid():N}",
			TenantStatus.Suspended
		);
		await this._SeedMembershipAsync(userId, activeTenantId, AccountStatus.Active);
		await this._SeedMembershipAsync(
			userId,
			suspendedMembershipTenantId,
			AccountStatus.Suspended
		);
		await this._SeedMembershipAsync(userId, suspendedTenantId, AccountStatus.Active);

		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);

		using var response = await this._GetAsync(token);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<GetUserTenantsResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Tenants.Should().ContainSingle();
		result.Tenants[0].Id.Should().Be(activeTenantId);
		result.TotalCount.Should().Be(1);
	}

	// The list is a preview: TotalCount counts every membership so the front can render
	// "+N more", while the payload itself never exceeds the documented cap.
	[Fact]
	public async Task ItShouldCapTheListWhileCountingEveryMembership() {
		var (userId, email) = await this._SeedUserAsync();
		for (var index = 0; index < GetUserTenantsSpec._PageCap + 1; index++) {
			var tenantId = await this._SeedTenantAsync(
				$"Capped {Guid.NewGuid():N}",
				TenantStatus.Active
			);
			await this._SeedMembershipAsync(userId, tenantId, AccountStatus.Active);
		}

		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);

		using var response = await this._GetAsync(token);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<GetUserTenantsResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.TotalCount.Should().Be(GetUserTenantsSpec._PageCap + 1);
		result.Tenants.Should().HaveCount(GetUserTenantsSpec._PageCap);
	}

	// A staff account is a valid session but has no tenant membership: the endpoint
	// answers with an empty, consistent body rather than an error.
	[Fact]
	public async Task ItShouldReturnAnEmptyListForAStaffAccount() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._GetAsync(token);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<GetUserTenantsResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Tenants.Should().BeEmpty();
		result.TotalCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenants
		);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	// A session minted before the account was suspended must stop working: the
	// suspended user can no longer enumerate their organizations.
	[Fact]
	public async Task ItShouldReturnUnauthorizedForASuspendedUser() {
		var (userId, email) = await this._SeedUserAsync();
		var tenantId = await this._SeedTenantAsync(
			$"Suspended user {Guid.NewGuid():N}",
			TenantStatus.Active
		);
		await this._SeedMembershipAsync(userId, tenantId, AccountStatus.Active);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);

		await this._SetUserSuspendedAsync(userId, isSuspended: true);
		try {
			using var response = await this._GetAsync(token);

			response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
		} finally {
			await this._SetUserSuspendedAsync(userId, isSuspended: false);
		}
	}

	private async Task<HttpResponseMessage> _GetAsync(string sessionToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenants
		).WithSessionToken(sessionToken);
		return await this._Http.SendAsync(request);
	}

	private async Task<(Guid UserId, string Email)> _SeedUserAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var email = $"user-tenants-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "UserTenants",
			LastName = "Spec",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await db.User.AddAsync(user);
		await db.SaveChangesAsync();

		return (user.GetRequiredId(), email);
	}

	private async Task<Guid> _SeedTenantAsync(string name, TenantStatus status) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = name,
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = 10,
		};
		await db.Tenant.AddAsync(tenant);
		await db.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task _SeedMembershipAsync(
		Guid userId,
		Guid tenantId,
		AccountStatus status
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var account = UserAccount.CreateTenantAccount(userId, tenantId, AccountLevel.User);
		account.ValidateAccountType();
		account.Status = status;
		await db.UserAccount.AddAsync(account);
		await db.SaveChangesAsync();
	}

	private async Task _SetUserSuspendedAsync(Guid userId, bool isSuspended) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var updated = await db.User
			.Where(user => user.Id == userId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(
					user => user.Status,
					isSuspended ? UserStatus.Suspended : UserStatus.Active
				)
				.SetProperty(user => user.UpdatedAt, DateTime.UtcNow));

		updated.Should().Be(1);
	}
}
