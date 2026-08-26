
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

// See TenantAuthFilterSpec (Lib/Filters) for why this joins the shared
// "AcmeTenantMutation" DisableParallelization collection.
[Collection("AcmeTenantMutation")]
public sealed class GetUserTenantsForPickerSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetUserTenantsForPickerSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnCorrectTenantsWhenAllActive() {
		var aliceToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenantsForPicker
		).WithSessionToken(aliceToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<PickerResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.HasDeletedTenants.Should().BeFalse();
		result.HasSuspendedTenants.Should().BeFalse();
		result.TotalCount.Should().Be(2);
		result.ActiveCount.Should().Be(2);
		result.Tenants.Should().HaveCount(2);
		result.Tenants.Should().AllSatisfy(t => {
			t.Status.Should().Be("Active");
		});
	}

	[Fact]
	public async Task
	ItShouldFlagSuspendedStateWhenOneSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken =
				await _authClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.HasSuspendedTenants.Should().BeTrue();
			// No tenant was soft-deleted in this arm, only suspended — the
			// deletion signal must stay false.
			result.HasDeletedTenants.Should().BeFalse();
			result.TotalCount.Should().Be(2);
			result.ActiveCount.Should().Be(1);

			var acmeTenant = result.Tenants
				.FirstOrDefault(t => t.Id == acmeId);
			acmeTenant.Should().NotBeNull();
			Assert.NotNull(acmeTenant);
			acmeTenant.Status.Should().Be("Suspended");

			// Other tenant should still be active
			var otherTenants = result.Tenants
				.Where(t => t.Id != acmeId);
			otherTenants.Should().AllSatisfy(t => {
				t.Status.Should().Be("Active");
			});
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldShowAllActiveAfterReactivation() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			// Reactivate
			using var reactivate =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
			reactivate.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var aliceToken =
				await _authClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.HasSuspendedTenants.Should()
							.BeFalse();
			result.HasDeletedTenants.Should().BeFalse();
			result.TotalCount.Should().Be(2);
			result.ActiveCount.Should().Be(2);
			result.Tenants.Should().AllSatisfy(t => {
				t.Status.Should().Be("Active");
			});
		} finally {
			// Safety net if reactivate didn't run
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, acmeId
						);
			} catch {
				// Ignore — tenant may already be active
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnOneActiveForSingleTenantUser() {
		// Acme admin has only 1 tenant
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserTenantsForPicker
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<PickerResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.TotalCount.Should().Be(1);
		result.ActiveCount.Should().Be(1);
		// Acme admin has exactly one live tenant: no suspended and no
		// soft-deleted memberships, so both signals must be false.
		result.HasSuspendedTenants.Should().BeFalse();
		result.HasDeletedTenants.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldNotLeakStaffInternalNotesToTenantScope() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var setNotes =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				acmeId,
				new { notes = "staff-internal-secret-note" }
			);
		setNotes.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken = await _authClient.LoginAsync(
				TestConstants.AliceEmail,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var rawBody = await response.Content
				.ReadAsStringAsync();
			rawBody.Should().NotContain(
				"staff-internal-secret-note"
			);
			rawBody.ToLowerInvariant().Should()
				.NotContain("\"notes\"");

			// Full response shape: the picker must carry both branch signals
			// and a consistent empty/not-empty body. Alice has two seeded
			// tenants (Acme + TechStart), both active in this arm.
			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.HasSuspendedTenants.Should().BeFalse();
			result.HasDeletedTenants.Should().BeFalse();
			result.TotalCount.Should().Be(2);
			result.ActiveCount.Should().Be(2);
			result.Tenants.Should().HaveCount(2);
		} finally {
			using var clearNotes =
				await TenantTestHelper.UpdateTenantAsync(
					_http,
					staffToken,
					acmeId,
					new { notes = (string?)null }
				);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedForGloballySuspendedUser() {
		var aliceToken = await _authClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		await SetUserSuspendedByEmailAsync(
			TestConstants.AliceEmail,
			isSuspended: true
		);

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(aliceToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		} finally {
			await SetUserSuspendedByEmailAsync(
				TestConstants.AliceEmail,
				isSuspended: false
			);
		}
	}

	private async Task SetUserSuspendedByEmailAsync(
		string email,
		bool isSuspended
	) {
		var normalizedEmail = email.Trim().ToLowerInvariant();

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var updatedCount = await dbContext.User
			.Where(u => u.Email == normalizedEmail)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(
					u => u.Status,
					isSuspended
						? UserStatus.Suspended
						: UserStatus.Active
				)
				.SetProperty(u => u.UpdatedAt, DateTime.UtcNow));

		updatedCount.Should().Be(1);
	}

	// Regression for #258: a user whose EVERY tenant has been soft-deleted
	// must reach the picker and receive an empty, consistent result — not an
	// error and not a stale non-zero count. The condition is created with real
	// soft-deletes (staff suspend → delete) against dedicated rows so no other
	// spec observes Acme or TechStart mutated.
	[Fact]
	public async Task ItShouldReturnEmptyPickerWhenEveryTenantIsSoftDeleted() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var (email, tenantIds) =
			await SeedUserWithSuspendedTenantsAsync(
				staffToken,
				tenantCount: 2
			);

		try {
			foreach (var tenantId in tenantIds) {
				using var delete =
					await TenantTestHelper.DeleteTenantAsync(
						_http, staffToken, tenantId
					);
				delete.StatusCode.Should().Be(HttpStatusCode.OK);
			}

			var token = await _authClient.LoginAsync(
				email,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.TotalCount.Should().Be(0);
			result.ActiveCount.Should().Be(0);
			// #258 round 2: the picker must expose WHY the list is empty. A user
			// whose every tenant was soft-deleted is a different situation from
			// a user who was never invited anywhere, and the front needs to say so.
			result.HasDeletedTenants.Should().BeTrue();
			result.HasSuspendedTenants.Should().BeFalse();
			result.Tenants.Should().BeEmpty();
		} finally {
			await DeleteSeededPickerUserAsync(email);
		}
	}

	private async Task<(string Email, List<Guid> TenantIds)>
	SeedUserWithSuspendedTenantsAsync(
		string staffToken,
		int tenantCount
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var email = $"all-tenants-deleted-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "AllDeleted",
			LastName = "Picker",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();
		var userId = user.GetRequiredId();

		var tenantIds = new List<Guid>();
		for (var index = 0; index < tenantCount; index++) {
			var tenant = new Tenant {
				Name = $"All Deleted Picker {Guid.NewGuid():N}",
				Code = Guid.NewGuid().ToString("N")[..10],
				Status = TenantStatus.Active,
				MaxUsers = 10,
			};
			await dbContext.Tenant.AddAsync(tenant);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(
					userId,
					tenant.GetRequiredId(),
					AccountLevel.User
				)
			);
			await dbContext.SaveChangesAsync();
			tenantIds.Add(tenant.GetRequiredId());
		}

		// Staff deletes only accept suspended tenants; suspend through the
		// service path first so the deletes below are legitimate operations.
		foreach (var tenantId in tenantIds) {
			using var suspend =
				await TenantTestHelper.SuspendTenantAsync(
					_http, staffToken, tenantId
				);
			suspend.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		return (email, tenantIds);
	}

	// #258 round 2, the contrast arm: a user with NO memberships at all
	// (never invited anywhere) is a different situation from the
	// all-tenants-deleted one. Both get an empty picker, but only the
	// deleted case must carry HasDeletedTenants — this is exactly the
	// signal the front empty state branches on.
	[Fact]
	public async Task ItShouldNotFlagDeletedTenantsForUserWithNoMemberships() {
		var email = await SeedUserWithoutMembershipsAsync();

		try {
			var token = await _authClient.LoginAsync(
				email,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.TotalCount.Should().Be(0);
			result.ActiveCount.Should().Be(0);
			result.HasDeletedTenants.Should().BeFalse();
			result.HasSuspendedTenants.Should().BeFalse();
			result.Tenants.Should().BeEmpty();
		} finally {
			await DeleteSeededPickerUserAsync(email);
		}
	}

	private async Task<string> SeedUserWithoutMembershipsAsync() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var email = $"never-invited-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "NeverInvited",
			LastName = "Picker",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		return email;
	}

	// #258 round 2, the mixed arm: a live membership AND a deleted-tenant
	// membership at once. The picker must still list the live tenant AND flag
	// HasDeletedTenants — pins that the flag counts ONLY deleted-tenant
	// memberships, not all memberships (a count-all implementation would pass
	// the two empty arms above while hiding a deleted organization here).
	[Fact]
	public async Task ItShouldFlagDeletedTenantsWhileStillListingLiveTenantsWhenOnlySomeWereDeleted() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var (email, tenantIds) =
			await SeedUserWithSuspendedTenantsAsync(staffToken, 1);

		try {
			// Delete the seeded tenant so the user has exactly one LIVE
			// membership (on Acme below) and one membership whose tenant is
			// soft-deleted. Suspending only would leave the tenant in the
			// picker's base count (`!t.IsDeleted` does not exclude suspended
			// tenants), defeating the purpose of this arm.
			foreach (var tenantId in tenantIds) {
				using var delete =
					await TenantTestHelper.DeleteTenantAsync(
						_http, staffToken, tenantId
					);
				delete.StatusCode.Should().Be(HttpStatusCode.OK);
			}

			// Second, LIVE membership on a seeded shared tenant.
			await using var scope =
				_fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			var acme = await dbContext.Tenant.FirstAsync(t =>
				t.Name == SeedConstants.Tenants.AcmeName);
			var user = await dbContext.User.FirstAsync(u => u.Email == email);
			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(
					user.GetRequiredId(),
					acme.GetRequiredId(),
					AccountLevel.User
				)
			);
			await dbContext.SaveChangesAsync();

			var token = await _authClient.LoginAsync(
				email,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<PickerResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			// The live tenant is listed and counted…
			result.TotalCount.Should().Be(1);
			result.ActiveCount.Should().Be(1);
			result.Tenants.Should().ContainSingle();
			// …while the deleted-tenant membership is flagged separately.
			result.HasDeletedTenants.Should().BeTrue();

			// Sanity: the deleted tenant itself never leaks into the list.
			result.Tenants.Should().NotContain(t =>
				t.Id == tenantIds[0]);
		} finally {
			await DeleteSeededPickerUserAsync(email);
		}
	}

	private async Task DeleteSeededPickerUserAsync(string email) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var seededUsers = await dbContext.User
			.Where(u => u.Email == email)
			.ToListAsync();
		if (seededUsers.Count != 1) {
			throw new InvalidOperationException(
				$"Expected exactly one seeded picker user for '{email}'."
			);
		}
		var seededUser = seededUsers[0];

		await dbContext.Session
			.Where(s => s.UserId == seededUser.Id)
			.ExecuteDeleteAsync();
		// No count assertion on accounts: the shared cleanup also serves the
		// never-invited arm (#258 round 2), which legitimately has zero
		// memberships. Tenants stay asserted — both arms create them or none.
		await dbContext.UserAccount
			.Where(ua => ua.UserId == seededUser.Id)
			.ExecuteDeleteAsync();
		// The never-invited arm (#258 round 2) seeds a user with no tenants, so
		// this bulk delete may legitimately remove zero rows. Only the
		// all-tenants-deleted and mixed arms seed "All Deleted Picker" tenants.
		await dbContext.Tenant
			.Where(t => t.Name.StartsWith("All Deleted Picker "))
			.ExecuteDeleteAsync();
		await dbContext.User.Where(u => u.Email == email)
			.ExecuteDeleteAsync();
	}

	private record PickerTenantItem {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Code { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}

	private record PickerResponse {
		public List<PickerTenantItem> Tenants { get; init; }
			= [];
		public int TotalCount { get; init; }
		public int ActiveCount { get; init; }
		public bool HasDeletedTenants { get; init; }
		public bool HasSuspendedTenants { get; init; }
	}
}
