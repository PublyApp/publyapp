
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Data.Seeding;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Localization;
using MainApi.Modules.Tenants.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Modules.Users.Handlers.Staff;
public sealed class TenantUserIdentityDangerZoneForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantUserIdentityDangerZoneForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetDetailsUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			"/tenant-users",
			$"/{userId}"
		);
	}

	private static string GetEmailUrl(string userId) {
		return PathUtils.Join(
			GetDetailsUrl(userId),
			"/email"
		);
	}

	private static string GetSuspendUrl(string userId) {
		return PathUtils.Join(
			GetDetailsUrl(userId),
			"/suspend"
		);
	}

	private static string GetReactivateUrl(string userId) {
		return PathUtils.Join(
			GetDetailsUrl(userId),
			"/reactivate"
		);
	}

	[Fact]
	public async Task
	ItShouldGloballySuspendAndReactivateTenantUserIdentity() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		using var suspendRequest = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(userId)
		).WithSessionToken(staffToken);
		using var suspendResponse = await _http.SendAsync(suspendRequest);

		suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var suspendedResult = await suspendResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		suspendedResult.Should().NotBeNull();
		suspendedResult!.Status.Should().Be("Suspended");

		using var detailsRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetDetailsUrl(userId)
		).WithSessionToken(staffToken);
		using var detailsResponse = await _http.SendAsync(detailsRequest);
		var details = await detailsResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		details.Should().NotBeNull();
		details!.Status.Should().Be("Suspended");

		using var reactivateRequest = new HttpRequestMessage(
			HttpMethod.Post,
			GetReactivateUrl(userId)
		).WithSessionToken(staffToken);
		using var reactivateResponse =
			await _http.SendAsync(reactivateRequest);

		reactivateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var reactivatedResult = await reactivateResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResponse>();
		reactivatedResult.Should().NotBeNull();
		reactivatedResult!.Status.Should().Be("Active");
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantUserIdentityEmail() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);
		var newEmail = $"tenant-user-email-{Guid.NewGuid():N}@example.com";

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetEmailUrl(userId)
			).WithSessionToken(staffToken);
			request.Content = JsonContent.Create(new { email = newEmail });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<TenantUserDetailsResponse>();
			result.Should().NotBeNull();
			result!.Id.ToString().Should().Be(userId);
			result.Email.Should().Be(newEmail);
		} finally {
			using var resetRequest = new HttpRequestMessage(
				HttpMethod.Patch,
				GetEmailUrl(userId)
			).WithSessionToken(staffToken);
			resetRequest.Content = JsonContent.Create(
				new { email = TestConstants.AcmeUserEmail }
			);

			using var resetResponse = await _http.SendAsync(resetRequest);
			if (resetResponse.StatusCode != HttpStatusCode.NotFound) {
				resetResponse.EnsureSuccessStatusCode();
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnValidationProblemWhenTenantUserEmailIsAlreadyInUse() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetEmailUrl(userId)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = TestConstants.StaffAdminEmail }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.EmailAlreadyInUse);
		problem.Errors.Should().ContainKey("email");
	}

	[Fact]
	public async Task
	ItShouldReturnValidationProblemWhenTenantUserEmailIsInvalid() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetEmailUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = "not-an-email" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantUserEmailUserIdIsMalformed() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetEmailUrl("not-a-guid")
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = $"tenant-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenTenantUserEmailUserDoesNotExist() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetEmailUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = $"tenant-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	[Theory]
	[InlineData("suspend")]
	[InlineData("reactivate")]
	public async Task
	ItShouldReturnBadRequestWhenTenantUserIdentityActionUserIdIsMalformed(
		string action
	) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetIdentityActionUrl(action, "not-a-guid")
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Theory]
	[InlineData("suspend")]
	[InlineData("reactivate")]
	public async Task
	ItShouldReturnNotFoundWhenTenantUserIdentityActionUserDoesNotExist(
		string action
	) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetIdentityActionUrl(action, Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnConflictWhenGloballySuspendingAlreadySuspendedTenantUser() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserIdentityAsync(UserStatus.Suspended);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(seeded.UserId.ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.UserSuspended);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenGloballySuspendingLastActiveTenantAdmin() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantAdminIdentityWithSuspendedAdminPeerAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(seeded.UserId.ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.CannotSuspendLastAdmin);
	}

	[Fact]
	public async Task
	ItShouldReturnConflictWhenReactivatingActiveTenantUser() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserIdentityAsync(UserStatus.Active);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetReactivateUrl(seeded.UserId.ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.UserNotSuspended);
	}

	private async Task<SeededTenantUserIdentity>
	SeedTenantUserIdentityAsync(UserStatus status) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

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
	SeedTenantAdminIdentityWithSuspendedAdminPeerAsync() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

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

	private static string GetIdentityActionUrl(
		string action,
		string userId
	) {
		if (action == "suspend") {
			return GetSuspendUrl(userId);
		}
		if (action == "reactivate") {
			return GetReactivateUrl(userId);
		}

		throw new InvalidOperationException(
			$"Unsupported identity action '{action}'."
		);
	}

	private static async Task<string> GetUserIdByEmailAsync(
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
