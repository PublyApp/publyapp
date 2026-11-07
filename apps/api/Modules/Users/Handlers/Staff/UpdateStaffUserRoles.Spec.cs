using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class UpdateStaffUserRolesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public UpdateStaffUserRolesSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Roles.UpdateFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(Guid.NewGuid().ToString())
		) {
			Content = JsonContent.Create(new { roleIds = Array.Empty<string>() })
		};

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { roleIds = Array.Empty<string>() });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		// Use an isolated staff user with no roles, so permissions are guaranteed empty even if
		// other integration tests assign roles to the seeded staff-user@example.com.
		var token = await this._CreateUnprivilegedStaffUserTokenAsync();

		// Use an existing user id so the permission failure cannot be masked by a 404.
		var adminToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var existingUserId = await UpdateStaffUserRolesSpec._GetStaffUserIdByEmailAsync(
			this._Http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(existingUserId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { roleIds = Array.Empty<string>() });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl("not-a-guid")
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { roleIds = Array.Empty<string>() });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { roleIds = Array.Empty<string>() });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenMaxRolesExceeded() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var userId = await UpdateStaffUserRolesSpec._GetStaffUserIdByEmailAsync(
			this._Http,
			token,
			TestConstants.StaffUserEmail
		);

		// Create more roles than allowed by MAX_ROLES_PER_USER (5 by default).
		var roleIds = new List<string>();
		for (var i = 0; i < 6; i++) {
			roleIds.Add(await this._CreateStaffRoleAsync(token));
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(userId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { roleIds });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MaxRolesPerUserExceeded);
		problem.Errors.Should().ContainKey("roleIds");
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenRolesNotFound() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var userId = await UpdateStaffUserRolesSpec._GetStaffUserIdByEmailAsync(
			this._Http,
			token,
			TestConstants.StaffUserEmail
		);

		var missingId = Guid.NewGuid().ToString();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(userId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { roleIds = new[] { missingId } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenRolesNotStaffScope() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var userId = await UpdateStaffUserRolesSpec._GetStaffUserIdByEmailAsync(
			this._Http,
			token,
			TestConstants.StaffUserEmail
		);

		var tenantRoleId = await this._CreateTenantRoleAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(userId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { roleIds = new[] { tenantRoleId } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RoleNotStaffScope);
	}

	[Fact]
	public async Task ItShouldTreatPayloadAsSetAndReturnAssignedRoles() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var userId = await UpdateStaffUserRolesSpec._GetStaffUserIdByEmailAsync(
			this._Http,
			token,
			TestConstants.StaffUserEmail
		);

		var roleId = await this._CreateStaffRoleAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(userId)
		).WithSessionToken(token);

		// Intentionally send duplicates: the endpoint treats roleIds as a set.
		request.Content = JsonContent.Create(new { roleIds = new[] { roleId, roleId } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<UpdateStaffUserRolesResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.AssignedRoles.Should().ContainSingle(p => p.Id == Guid.Parse(roleId));
	}

	[Fact]
	public async Task ItShouldRefuseToRemoveTheLastStaffFullAccessRoleHolder() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var adminUserId = await UpdateStaffUserRolesSpec._GetStaffUserIdByEmailAsync(
			this._Http,
			token,
			TestConstants.StaffAdminEmail
		);

		// The seed can leave more than one full-access holder (owner bootstrap). Demote every
		// other holder first — each removal is legitimate while a holder remains — so the
		// final call is provably the last-holder case. The seeded admin is kept full-access
		// for the rest of this class.
		var adminUserGuid = Guid.Parse(adminUserId);
		var holderIds = await this._GetActiveStaffFullAccessUserIdsAsync();
		foreach (var holderId in holderIds.Where(id => id != adminUserGuid)) {
			using var demoteRequest = new HttpRequestMessage(
				HttpMethod.Put,
				UpdateStaffUserRolesSpec._GetUrl(holderId.ToString())
			).WithSessionToken(token);
			demoteRequest.Content = JsonContent.Create(
				new { roleIds = Array.Empty<string>() }
			);

			using var demoteResponse = await this._Http.SendAsync(demoteRequest);
			demoteResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		(await this._GetActiveStaffFullAccessUserIdsAsync()).Should().ContainSingle(
			"only the seeded admin must remain full-access"
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			UpdateStaffUserRolesSpec._GetUrl(adminUserId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { roleIds = Array.Empty<string>() });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.CannotRemoveLastAdmin);
	}

	private async Task<List<Guid>> _GetActiveStaffFullAccessUserIdsAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await FullAccessRoleQueries.ActiveStaffFullAccessAccounts(dbContext)
			.Select(account => account.UserId)
			.ToListAsync();
	}

	// -- Helpers --

	private async Task<string> _CreateStaffRoleAsync(string staffToken) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);

		var name = "Test Update Roles " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test role used by UpdateStaffUserRolesSpec",
				permissions = new[] {
					AppPermissions.Staff.Users.LIST_FOR_STAFF.Key,
				},
				emails = Array.Empty<string>(),
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffRoleCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.RoleId.ToString();
	}

	private async Task<string> _CreateTenantRoleAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Code = "tp-" + Guid.NewGuid().ToString("N")[..10],
			Name = "Test Tenant " + Guid.NewGuid().ToString("N")[..8],
			MaxUsers = 10,
			Status = TenantStatus.Active,
		};
		_ = dbContext.Tenant.Add(tenant);
		_ = await dbContext.SaveChangesAsync();

		var role = Role.CreateTenantRole(
			tenantId: tenant.GetRequiredId(),
			name: "Tenant Role " + Guid.NewGuid().ToString("N")[..8],
			description: "Non-staff role used by UpdateStaffUserRolesSpec"
		);
		role.ValidateRoleType();

		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();

		return role.GetRequiredId().ToString();
	}

	private static async Task<string> _GetStaffUserIdByEmailAsync(
		HttpClient http,
		string staffToken,
		string email
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response = await http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize staff user list response"
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
				$"Staff user with email '{email}' not found"
			);
		}

		return user.Id.ToString();
	}

	private async Task<string> _CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "User",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	// -- Response DTOs --

	private class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
	}

	private record StaffRoleCreatedResponse {
		public Guid RoleId { get; init; }
	}

	private record UpdateStaffUserRolesResult {
		public List<StaffUserRoleItem> AssignedRoles { get; init; } = [];
	}

	private record StaffUserRoleItem {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
	}
}
