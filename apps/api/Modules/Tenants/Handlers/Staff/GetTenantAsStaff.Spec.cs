
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

// See TenantAuthFilterSpec for why this joins the shared
// "AcmeTenantMutation" DisableParallelization collection.
[Collection("AcmeTenantMutation")]
public sealed class GetTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.GetByIdFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

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
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnActiveTenantWithEnrichedFields() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantWithUsersAsync(
				"Tenant Get Enriched",
				usersCount: 2
			);

		var url = GetUrl(seededTenant.TenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"GET tenant response was empty."
			);
		}

		result.TenantId.Should()
			.Be(seededTenant.TenantId);
		result.Name.Should()
			.Be(seededTenant.Name);
		result.Code.Should()
			.Be(seededTenant.Code);
		result.LogoUrl.Should()
			.Be(seededTenant.LogoUrl);
		result.MaxUsers.Should()
			.Be(seededTenant.MaxUsers);
		result.Status.Should()
			.Be(TenantStatus.Active);
		result.UsersCount.Should()
			.Be(2);
		result.CreatedAt.Should()
			.BeCloseTo(seededTenant.CreatedAt, TimeSpan.FromSeconds(1));
		result.UpdatedAt.Should()
			.BeCloseTo(seededTenant.UpdatedAt, TimeSpan.FromSeconds(1));
	}

	[Fact]
	public async Task
	ItShouldReturnTenantWhenSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend the tenant
		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, tenantId
			);
		suspendResponse.EnsureSuccessStatusCode();

		try {
			// GET the suspended tenant as staff
			var url = GetUrl(tenantId.ToString());
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.TenantId.Should().Be(tenantId);
			result.Code.Should().NotBeNullOrEmpty();
			result.Status.Should().Be(TenantStatus.Suspended);
			result.MaxUsers.Should().BeGreaterThan(0);
		} finally {
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, staffToken, tenantId
						);
			} catch {
				// Ignore — cleanup best-effort
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnCorrectCountsWithMixedData() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await SeedTenantWithCountsFixtureAsync(
				"Tenant Get Counts Fixture"
			);

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"GET tenant response was empty."
			);
		}

		// 1 active admin (1 other admin soft-deleted) + 3 active users.
		result.UsersCount.Should().Be(4);
		result.OwnersCount.Should().Be(1);
		// Pending, not-expired invitations: one expiring far out, one expiring within 48h.
		// Excludes: deleted-pending, accepted, revoked, and expired-but-still-"Pending".
		result.PendingInvitationsCount.Should().Be(2);
		result.ExpiringSoonInvitationsCount.Should().Be(1);
		// 2 active profiles (1 soft-deleted excluded).
		result.ProfilesCount.Should().Be(2);
	}

	[Fact]
	public async Task
	ItShouldExcludeUsersWhoseUserRowIsSoftDeletedFromCounts() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await SeedTenantWithSoftDeletedUserFixtureAsync(
				"Tenant Get Counts Soft Deleted User"
			);

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"GET tenant response was empty."
			);
		}

		// 1 active admin + 1 active user. A second admin and a second user each
		// have their UserAccount row intact (IsDeleted = false) but their owning
		// User row soft-deleted — neither may count toward users or owners.
		result.UsersCount.Should().Be(2);
		result.OwnersCount.Should().Be(1);
	}

	[Fact]
	public async Task
	ItShouldReturnAllOrganizationProfileFieldsWhenPresent() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"Tenant Get Org Fields {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
			LegalName = "Acme Legal Name LLC",
			Description = "A short description of the org",
			WebsiteUrl = "https://example.com",
			BillingEmail = "billing@example.com",
			SupportEmail = "support@example.com",
			DefaultLocale = "fr",
			Timezone = "Europe/Paris",
			Notes = "internal staff note",
			LastActivityAt = DateTime.UtcNow,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"GET tenant response was empty."
			);
		}

		result.LegalName.Should().Be(tenant.LegalName);
		result.Description.Should().Be(tenant.Description);
		result.WebsiteUrl.Should().Be(tenant.WebsiteUrl);
		result.BillingEmail.Should().Be(tenant.BillingEmail);
		result.SupportEmail.Should().Be(tenant.SupportEmail);
		result.DefaultLocale.Should().Be(tenant.DefaultLocale);
		result.Timezone.Should().Be(tenant.Timezone);
		result.Notes.Should().Be(tenant.Notes);
		result.LastActivityAt.Should().NotBeNull();
		result.LastActivityAt!.Value.Should().BeCloseTo(
			tenant.LastActivityAt!.Value, TimeSpan.FromSeconds(1)
		);
	}

	private async Task<Guid> SeedTenantWithCountsFixtureAsync(
		string namePrefix
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 20,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		// NOTE: AppDbContext.SaveChangesAsync forces IsDeleted=false on newly-Added rows (its
		// audit interceptor treats insert and soft-delete as distinct lifecycle steps), so
		// "seed already-deleted" fixtures must insert first, then soft-delete as a separate
		// update — setting IsDeleted=true in the same SaveChanges call as the insert is a no-op.
		async Task<Guid> AddUserAsync(AccountLevel level, bool isDeleted) {
			var user = new User {
				Email = $"tenant-get-counts-{Guid.NewGuid():N}@example.com",
				Password = PasswordUtils.HashPassword(
					TestConstants.SeedPassword
				),
				FirstName = "Counts",
				LastName = "Fixture",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			var account = UserAccount.CreateTenantAccount(
				user.GetRequiredId(), tenantId, level
			);
			await dbContext.UserAccount.AddAsync(account);
			await dbContext.SaveChangesAsync();

			if (isDeleted) {
				account.IsDeleted = true;
				await dbContext.SaveChangesAsync();
			}

			return user.GetRequiredId();
		}

		var adminUserId = await AddUserAsync(AccountLevel.Admin, isDeleted: false);
		await AddUserAsync(AccountLevel.Admin, isDeleted: true);
		await AddUserAsync(AccountLevel.User, isDeleted: false);
		await AddUserAsync(AccountLevel.User, isDeleted: false);
		await AddUserAsync(AccountLevel.User, isDeleted: false);

		var now = DateTime.UtcNow;

		async Task AddInvitationAsync(
			InvitationStatus status,
			DateTime expiresAt,
			bool isDeleted
		) {
			var invitation = Invitation.CreateTenantInvitationWithProfiles(
				$"tenant-get-counts-invite-{Guid.NewGuid():N}@example.com",
				tenantId,
				[],
				adminUserId,
				expiresAt,
				CryptoUtils.RandomString(20)
			);
			invitation.Status = status;
			dbContext.Invitation.Add(invitation);
			await dbContext.SaveChangesAsync();

			if (isDeleted) {
				invitation.IsDeleted = true;
				await dbContext.SaveChangesAsync();
			}
		}

		await AddInvitationAsync(InvitationStatus.Pending, now.AddDays(10), isDeleted: false);
		await AddInvitationAsync(InvitationStatus.Pending, now.AddHours(24), isDeleted: false);
		await AddInvitationAsync(InvitationStatus.Pending, now.AddDays(10), isDeleted: true);
		await AddInvitationAsync(InvitationStatus.Accepted, now.AddDays(10), isDeleted: false);
		await AddInvitationAsync(InvitationStatus.Revoked, now.AddDays(10), isDeleted: false);
		await AddInvitationAsync(InvitationStatus.Pending, now.AddHours(-1), isDeleted: false);

		dbContext.Profile.Add(
			Profile.CreateTenantProfile(tenantId, "Counts Fixture Profile A")
		);
		dbContext.Profile.Add(
			Profile.CreateTenantProfile(tenantId, "Counts Fixture Profile B")
		);
		var deletedProfile =
			Profile.CreateTenantProfile(tenantId, "Counts Fixture Profile C");
		dbContext.Profile.Add(deletedProfile);
		await dbContext.SaveChangesAsync();

		deletedProfile.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		return tenantId;
	}

	private async Task<Guid> SeedTenantWithSoftDeletedUserFixtureAsync(
		string namePrefix
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		async Task AddUserAsync(AccountLevel level, bool isUserDeleted) {
			var user = new User {
				Email = $"tenant-get-counts-soft-deleted-user-{Guid.NewGuid():N}@example.com",
				Password = PasswordUtils.HashPassword(
					TestConstants.SeedPassword
				),
				FirstName = "Counts",
				LastName = "SoftDeletedUser",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(
					user.GetRequiredId(), tenantId, level
				)
			);
			await dbContext.SaveChangesAsync();

			// Soft-deletes the USER row (not the UserAccount row) — the scenario
			// F9 covers: UserAccount.IsDeleted stays false, only User.IsDeleted flips.
			if (isUserDeleted) {
				user.IsDeleted = true;
				await dbContext.SaveChangesAsync();
			}
		}

		await AddUserAsync(AccountLevel.Admin, isUserDeleted: false);
		await AddUserAsync(AccountLevel.Admin, isUserDeleted: true);
		await AddUserAsync(AccountLevel.User, isUserDeleted: false);
		await AddUserAsync(AccountLevel.User, isUserDeleted: true);

		return tenantId;
	}

	private async Task<SeededTenantSnapshot>
	SeedTenantWithUsersAsync(
		string namePrefix,
		int usersCount
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			LogoUrl = "https://example.com/tenant-logo.png",
			Status = TenantStatus.Active,
			MaxUsers = usersCount + 5,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		var tenantId = tenant.GetRequiredId();
		for (var i = 0; i < usersCount; i++) {
			var user = new User {
				Email = $"tenant-get-user-{Guid.NewGuid():N}@example.com",
				Password = PasswordUtils.HashPassword(
					TestConstants.SeedPassword
				),
				FirstName = "Tenant",
				LastName = $"User {i}",
				Status = UserStatus.Active,
				IsVerified = true,
			};

			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(
					user.GetRequiredId(),
					tenantId
				)
			);
		}

		await dbContext.SaveChangesAsync();

		return new SeededTenantSnapshot(
			TenantId: tenantId,
			Name: tenant.Name,
			Code: tenant.Code,
			LogoUrl: tenant.LogoUrl,
			MaxUsers: tenant.MaxUsers,
			CreatedAt: tenant.CreatedAt,
			UpdatedAt: tenant.UpdatedAt
		);
	}

	private sealed record SeededTenantSnapshot(
		Guid TenantId,
		string Name,
		string Code,
		string? LogoUrl,
		int MaxUsers,
		DateTime CreatedAt,
		DateTime UpdatedAt
	);
}
