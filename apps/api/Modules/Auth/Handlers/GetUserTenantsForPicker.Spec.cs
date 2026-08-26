
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
		result.HasSuspendedTenants.Should().BeFalse();
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
		var removedAccounts = await dbContext.UserAccount
			.Where(ua => ua.UserId == seededUser.Id)
			.ExecuteDeleteAsync();
		removedAccounts.Should().BeGreaterThan(0);
		var removedTenants = await dbContext.Tenant
			.Where(t => t.Name.StartsWith("All Deleted Picker "))
			.ExecuteDeleteAsync();
		removedTenants.Should().BeGreaterThan(0);
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
		public bool HasSuspendedTenants { get; init; }
	}
}
