
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
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class TenantUserIdentityDangerZoneForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public TenantUserIdentityDangerZoneForStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetDetailsUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			"/tenant-users",
			$"/{userId}"
		);
	}

	private static string _GetEmailUrl(string userId) {
		return PathUtils.Join(
			TenantUserIdentityDangerZoneForStaffSpec._GetDetailsUrl(userId),
			"/email"
		);
	}

	private static string _GetSuspendUrl(string userId) {
		return PathUtils.Join(
			TenantUserIdentityDangerZoneForStaffSpec._GetDetailsUrl(userId),
			"/suspend"
		);
	}

	private static string _GetReactivateUrl(string userId) {
		return PathUtils.Join(
			TenantUserIdentityDangerZoneForStaffSpec._GetDetailsUrl(userId),
			"/reactivate"
		);
	}

	[Fact]
	public async Task
	ItShouldGloballySuspendAndReactivateTenantUserIdentity() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await TenantUserIdentityDangerZoneForStaffSpec._GetUserIdByEmailAsync(
			this._Http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		using var suspendRequest = new HttpRequestMessage(
			HttpMethod.Post,
			TenantUserIdentityDangerZoneForStaffSpec._GetSuspendUrl(userId)
		).WithSessionToken(staffToken);
		using var suspendResponse = await this._Http.SendAsync(suspendRequest);

		suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var suspendedResult = await suspendResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		suspendedResult.Should().NotBeNull();
		Assert.NotNull(suspendedResult);
		suspendedResult.Status.Should().Be("Suspended");

		using var detailsRequest = new HttpRequestMessage(
			HttpMethod.Get,
			TenantUserIdentityDangerZoneForStaffSpec._GetDetailsUrl(userId)
		).WithSessionToken(staffToken);
		using var detailsResponse = await this._Http.SendAsync(detailsRequest);
		var details = await detailsResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		details.Should().NotBeNull();
		Assert.NotNull(details);
		details.Status.Should().Be("Suspended");

		using var reactivateRequest = new HttpRequestMessage(
			HttpMethod.Post,
			TenantUserIdentityDangerZoneForStaffSpec._GetReactivateUrl(userId)
		).WithSessionToken(staffToken);
		using var reactivateResponse =
			await this._Http.SendAsync(reactivateRequest);

		reactivateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var reactivatedResult = await reactivateResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		reactivatedResult.Should().NotBeNull();
		Assert.NotNull(reactivatedResult);
		reactivatedResult.Status.Should().Be("Active");
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantUserIdentityEmail() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await TenantUserIdentityDangerZoneForStaffSpec._GetUserIdByEmailAsync(
			this._Http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);
		var newEmail = $"tenant-user-email-{Guid.NewGuid():N}@example.com";

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				TenantUserIdentityDangerZoneForStaffSpec._GetEmailUrl(userId)
			).WithSessionToken(staffToken);
			request.Content = JsonContent.Create(new { email = newEmail });

			using var response = await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<TenantUserDetailsResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.Id.ToString().Should().Be(userId);
			result.Email.Should().Be(newEmail);
		} finally {
			using var resetRequest = new HttpRequestMessage(
				HttpMethod.Patch,
				TenantUserIdentityDangerZoneForStaffSpec._GetEmailUrl(userId)
			).WithSessionToken(staffToken);
			resetRequest.Content = JsonContent.Create(
				new { email = TestConstants.AcmeUserEmail }
			);

			using var resetResponse = await this._Http.SendAsync(resetRequest);
			if (resetResponse.StatusCode != HttpStatusCode.NotFound) {
				resetResponse.EnsureSuccessStatusCode();
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnValidationProblemWhenTenantUserEmailIsAlreadyInUse() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await TenantUserIdentityDangerZoneForStaffSpec._GetUserIdByEmailAsync(
			this._Http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			TenantUserIdentityDangerZoneForStaffSpec._GetEmailUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = TestConstants.StaffAdminEmail }
		);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.EmailAlreadyInUse);
		problem.Errors.Should().ContainKey("email");
	}

	[Fact]
	public async Task
	ItShouldReturnValidationProblemWhenTenantUserEmailIsInvalid() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			TenantUserIdentityDangerZoneForStaffSpec._GetEmailUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = "not-an-email" }
		);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantUserEmailUserIdIsMalformed() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			TenantUserIdentityDangerZoneForStaffSpec._GetEmailUrl("not-a-guid")
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = $"tenant-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenTenantUserEmailUserDoesNotExist() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			TenantUserIdentityDangerZoneForStaffSpec._GetEmailUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = $"tenant-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	[Theory]
	[InlineData("suspend")]
	[InlineData("reactivate")]
	public async Task
	ItShouldReturnBadRequestWhenTenantUserIdentityActionUserIdIsMalformed(
		string action
	) {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantUserIdentityDangerZoneForStaffSpec._GetIdentityActionUrl(action, "not-a-guid")
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Theory]
	[InlineData("suspend")]
	[InlineData("reactivate")]
	public async Task
	ItShouldReturnNotFoundWhenTenantUserIdentityActionUserDoesNotExist(
		string action
	) {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantUserIdentityDangerZoneForStaffSpec._GetIdentityActionUrl(action, Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnConflictWhenGloballySuspendingAlreadySuspendedTenantUser() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var seeded = await this._SeedTenantUserIdentityAsync(UserStatus.Suspended);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantUserIdentityDangerZoneForStaffSpec._GetSuspendUrl(seeded.UserId.ToString())
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.UserSuspended);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenGloballySuspendingLastActiveTenantAdmin() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var seeded = await this._SeedTenantAdminIdentityWithSuspendedAdminPeerAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantUserIdentityDangerZoneForStaffSpec._GetSuspendUrl(seeded.UserId.ToString())
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.CannotSuspendLastAdmin);
	}

	[Fact]
	public async Task
	ItShouldReturnConflictWhenReactivatingActiveTenantUser() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var seeded = await this._SeedTenantUserIdentityAsync(UserStatus.Active);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantUserIdentityDangerZoneForStaffSpec._GetReactivateUrl(seeded.UserId.ToString())
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.UserNotSuspended);
	}

	private async Task<SeededTenantUserIdentity>
	_SeedTenantUserIdentityAsync(UserStatus status) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var user = new User {
			Email = $"tenant-user-danger-zone-{unique}@example.com",
			Password = "unused",
			FirstName = "Tenant",
			LastName = "Danger Zone",
			Status = status,
			IsVerified = true,
		};
		var tenant = new Tenant {
			Name = $"Danger Zone Tenant {unique}",
			Code = Guid.NewGuid().ToString("N")[..12],
			Status = TenantStatus.Active,
			MaxUsers = 100,
		};

		await dbContext.User.AddAsync(user);
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(
				user.GetRequiredId(),
				tenant.GetRequiredId()
			)
		);
		await dbContext.SaveChangesAsync();

		return new SeededTenantUserIdentity(
			user.GetRequiredId(),
			tenant.GetRequiredId(),
			user.Email
		);
	}

	private async Task<SeededTenantUserIdentity>
	_SeedTenantAdminIdentityWithSuspendedAdminPeerAsync() {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var user = new User {
			Email = $"tenant-user-admin-danger-zone-{unique}@example.com",
			Password = "unused",
			FirstName = "Tenant",
			LastName = "Admin",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		var suspendedPeer = new User {
			Email = $"tenant-user-suspended-admin-peer-{unique}@example.com",
			Password = "unused",
			FirstName = "Suspended",
			LastName = "Peer",
			Status = UserStatus.Suspended,
			IsVerified = true,
		};
		var tenant = new Tenant {
			Name = $"Danger Zone Admin Tenant {unique}",
			Code = Guid.NewGuid().ToString("N")[..12],
			Status = TenantStatus.Active,
			MaxUsers = 100,
		};

		await dbContext.User.AddRangeAsync(user, suspendedPeer);
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddRangeAsync(
			UserAccount.CreateTenantAccount(
				user.GetRequiredId(),
				tenant.GetRequiredId(),
				AccountLevel.Admin
			),
			UserAccount.CreateTenantAccount(
				suspendedPeer.GetRequiredId(),
				tenant.GetRequiredId(),
				AccountLevel.Admin
			)
		);
		await dbContext.SaveChangesAsync();

		return new SeededTenantUserIdentity(
			user.GetRequiredId(),
			tenant.GetRequiredId(),
			user.Email
		);
	}

	private static string _GetIdentityActionUrl(
		string action,
		string userId
	) {
		if (action == "suspend") {
			return TenantUserIdentityDangerZoneForStaffSpec._GetSuspendUrl(userId);
		}
		if (action == "reactivate") {
			return TenantUserIdentityDangerZoneForStaffSpec._GetReactivateUrl(userId);
		}

		throw new InvalidOperationException(
			$"Unsupported identity action '{action}'."
		);
	}

	private static async Task<string> _GetUserIdByEmailAsync(
		HttpClient http,
		string staffToken,
		Guid tenantId,
		string email
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.RootFn(
				tenantId.ToString()
			),
			Routes.Users.ForTenantAsStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response = await http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content
			.ReadFromJsonAsync<FindUsersResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize tenant user list response"
			);
		}

		var user = result.Data.FirstOrDefault(
			u => string.Equals(
				u.Email,
				email,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (user is null) {
			throw new InvalidOperationException(
				$"User with email '{email}' not found in tenant"
			);
		}

		return user.Id;
	}

	private sealed record FindUsersResponse {
		public List<TenantUserItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record TenantUserItem {
		public string Id { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
	}

	private sealed record TenantUserDetailsResponse {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}

	private sealed record SeededTenantUserIdentity(
		Guid UserId,
		Guid TenantId,
		string Email
	);
}
