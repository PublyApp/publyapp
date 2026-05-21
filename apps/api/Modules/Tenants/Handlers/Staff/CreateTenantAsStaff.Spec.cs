namespace MainApi.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Data.DbContext;
using MainApi.Infrastructure.Messaging.Email;
using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fakes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Modules.Invitations.Entities;
using MainApi.Modules.Profiles.Entities;
using MainApi.Modules.Tenants.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class CreateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateTenantAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldCreatePendingTenantDefaultProfileInvitationsAndEmails() {
		var fakeEmailSender = _fixture.GetFakeEmailSender();
		fakeEmailSender.Clear();

		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Create Contract {Guid.NewGuid():N}";
		var adminEmail =
			$"tenant-create-admin-{Guid.NewGuid():N}@example.com";
		var userEmail =
			$"tenant-create-user-{Guid.NewGuid():N}@example.com";

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				new {
					name = tenantName,
					maxUsers = 3,
					initialUsers = new[] {
						new {
							email = adminEmail,
							accountLevel = "admin",
						},
						new {
							email = userEmail,
							accountLevel = "user",
						},
					},
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var created = await response.Content
			.ReadFromJsonAsync<CreateTenantAsStaffResult>();
		created.Should().NotBeNull();
		created!.Id.Should().NotBeEmpty();
		created.Name.Should().Be(tenantName);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == created.Id)
			.SingleAsync();
		tenant.Name.Should().Be(tenantName);
		tenant.MaxUsers.Should().Be(3);
		tenant.Status.Should().Be(TenantStatus.Pending);

		var defaultProfile = await dbContext.Profile
			.Where(profile =>
				profile.TenantId == created.Id
				&& profile.Scope == ProfileScope.Tenant
				&& profile.IsDefault
			)
			.SingleAsync();
		defaultProfile.Name.Should().Be("Default profile");

		var invitations = await dbContext.Invitation
			.Where(invitation =>
				invitation.TenantId == created.Id
				&& invitation.Scope == InvitationScope.Tenant
			)
			.Include(invitation => invitation.InvitationProfiles)
			.ToListAsync();

		invitations.Should().HaveCount(2);

		var adminInvitation = invitations.Single(inv => inv.Email == adminEmail);
		adminInvitation.Status.Should().Be(InvitationStatus.Pending);
		adminInvitation.AccountLevel.Should().Be(AccountLevel.Admin);
		adminInvitation.InvitationProfiles.Should().BeEmpty();

		var userInvitation = invitations.Single(inv => inv.Email == userEmail);
		userInvitation.Status.Should().Be(InvitationStatus.Pending);
		userInvitation.AccountLevel.Should().Be(AccountLevel.User);
		userInvitation.InvitationProfiles.Should().ContainSingle(link =>
			link.ProfileId == defaultProfile.GetRequiredId()
		);

		var sentEmails = await WaitForEmailsAsync(fakeEmailSender, 2);
		sentEmails.Select(email => email.To)
			.Should().BeEquivalentTo([adminEmail, userEmail]);
		sentEmails.Should().OnlyContain(email =>
			email.Subject.Contains(tenantName, StringComparison.Ordinal)
			&& email.HtmlBody.Contains("Accept the invitation", StringComparison.Ordinal)
		);
	}

	[Fact]
	public async Task
	ItShouldUseDefaultMaxUsersWhenMaxUsersIsMissing() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Default Max Missing {Guid.NewGuid():N}";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				initialUsers = new[] {
					new {
						email = $"tenant-default-missing-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await AssertTenantMaxUsersAsync(
			created.Id,
			AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT
		);
	}

	[Fact]
	public async Task
	ItShouldUseDefaultMaxUsersWhenMaxUsersIsNull() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Default Max Null {Guid.NewGuid():N}";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				maxUsers = (int?)null,
				initialUsers = new[] {
					new {
						email = $"tenant-default-null-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await AssertTenantMaxUsersAsync(
			created.Id,
			AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT
		);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToCreateTenant() {
		var token = await CreateStaffUserTokenWithPermissionAsync(
			AppPermissions.Staff.Tenants.CREATE.Key
		);

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				CreateValidTenantBody("Permissioned Staff Tenant")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWhenNotAuthenticated() {
		using var response = await _http.SendAsync(
			CreateTenantRequest(
				sessionToken: null,
				CreateValidTenantBody("Unauthenticated Tenant")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				tenantToken,
				CreateValidTenantBody("Forbidden Tenant User")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await CreateUnprivilegedStaffUserTokenAsync();

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				CreateValidTenantBody("Forbidden Staff User")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Theory]
	[MemberData(nameof(InvalidCreateTenantBodies))]
	public async Task
	ItShouldReturnUnprocessableEntityWhenCreateBodyIsInvalid(
		string body,
		string expectedField
	) {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, expectedField);
	}

	public static IEnumerable<object[]> InvalidCreateTenantBodies() {
		yield return [
			"""
			{
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"Name",
		];
		yield return [
			"""
			{
				"name": 123,
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"Name",
		];
		yield return [
			"""
			{
				"name": "    ",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"Name",
		];
		yield return [
			"""
			{
				"name": "Tiny",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"Name",
		];
		yield return [
			"""
			{
				"name": "Invalid Max Zero",
				"maxUsers": 0,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"MaxUsers",
		];
		yield return [
			"""
			{
				"name": "Invalid Max Negative",
				"maxUsers": -1,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"MaxUsers",
		];
		yield return [
			"""
			{
				"name": "Invalid Max String",
				"maxUsers": "10",
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"MaxUsers",
		];
		yield return [
			"""
			{
				"name": "Invalid Max Decimal",
				"maxUsers": 1.5,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"MaxUsers",
		];
		yield return [
			"""
			{
				"name": "Invalid Max Huge",
				"maxUsers": 999999999999999999999999999999,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""",
			"MaxUsers",
		];
		yield return [
			"""
			{
				"name": "Missing Initial Users",
				"maxUsers": 10
			}
			""",
			"InitialUsers",
		];
		yield return [
			"""
			{
				"name": "Invalid Initial Users",
				"maxUsers": 10,
				"initialUsers": {}
			}
			""",
			"InitialUsers",
		];
		yield return [
			"""
			{
				"name": "Empty Initial Users",
				"maxUsers": 10,
				"initialUsers": []
			}
			""",
			"InitialUsers",
		];
		yield return [
			"""
			{
				"name": "Bad Initial User Item",
				"maxUsers": 10,
				"initialUsers": ["admin@example.com"]
			}
			""",
			"initialUsers[0]",
		];
		yield return [
			"""
			{
				"name": "Missing Initial Email",
				"maxUsers": 10,
				"initialUsers": [
					{ "accountLevel": "Admin" }
				]
			}
			""",
			"initialUsers[0].email",
		];
		yield return [
			"""
			{
				"name": "Invalid Initial Email Type",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": 123, "accountLevel": "Admin" }
				]
			}
			""",
			"initialUsers[0].email",
		];
		yield return [
			"""
			{
				"name": "Invalid Initial Email",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "not-an-email", "accountLevel": "Admin" }
				]
			}
			""",
			"initialUsers[0].email",
		];
		yield return [
			"""
			{
				"name": "Missing Initial Level",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "admin@example.com" }
				]
			}
			""",
			"initialUsers[0].accountLevel",
		];
		yield return [
			"""
			{
				"name": "Invalid Initial Level Type",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": 123 }
				]
			}
			""",
			"initialUsers[0].accountLevel",
		];
		yield return [
			"""
			{
				"name": "Invalid Initial Level",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Owner" }
				]
			}
			""",
			"initialUsers[0].accountLevel",
		];
		yield return [
			"""
			{
				"name": "Duplicate Initial Emails",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "duplicate@example.com", "accountLevel": "Admin" },
					{ "email": "DUPLICATE@example.com", "accountLevel": "User" }
				]
			}
			""",
			"InitialUsers",
		];
		yield return [
			"""
			{
				"name": "Missing Initial Admin",
				"maxUsers": 10,
				"initialUsers": [
					{ "email": "user@example.com", "accountLevel": "User" }
				]
			}
			""",
			"InitialUsers",
		];
		yield return [
			"""
			{
				"name": "Too Many Initial Users",
				"maxUsers": 1,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" },
					{ "email": "user@example.com", "accountLevel": "User" }
				]
			}
			""",
			"InitialUsers",
		];
	}

	private static object CreateValidTenantBody(string namePrefix) {
		return new {
			name = $"{namePrefix} {Guid.NewGuid():N}",
			maxUsers = 1,
			initialUsers = new[] {
				new {
					email = $"tenant-create-valid-{Guid.NewGuid():N}@example.com",
					accountLevel = "Admin",
				},
			},
		};
	}

	private static string GetCreateTenantUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.Create
		);
	}

	private static HttpRequestMessage CreateTenantRequest(
		string? sessionToken,
		object body
	) {
		var request = CreateTenantRequest(sessionToken);
		request.Content = JsonContent.Create(body);

		return request;
	}

	private static HttpRequestMessage CreateTenantRequest(
		string? sessionToken,
		string rawJsonBody
	) {
		var request = CreateTenantRequest(sessionToken);
		request.Content = new StringContent(
			rawJsonBody,
			Encoding.UTF8,
			"application/json"
		);

		return request;
	}

	private static HttpRequestMessage CreateTenantRequest(
		string? sessionToken
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateTenantUrl()
		);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}

		return request;
	}

	private async Task<CreateTenantAsStaffResult> CreateTenantSuccessfullyAsync(
		string token,
		object body
	) {
		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var created = await response.Content
			.ReadFromJsonAsync<CreateTenantAsStaffResult>();
		created.Should().NotBeNull();

		return created!;
	}

	private async Task AssertTenantMaxUsersAsync(
		Guid tenantId,
		int expectedMaxUsers
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == tenantId)
			.SingleAsync();
		tenant.MaxUsers.Should().Be(expectedMaxUsers);
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var email =
			$"tenant-create-no-permission-{Guid.NewGuid():N}@example.com";

		await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email
		);

		return await _authClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private async Task<string> CreateStaffUserTokenWithPermissionAsync(
		string permissionKey
	) {
		var email =
			$"tenant-create-permissioned-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var staffAccount = await dbContext.UserAccount
			.Where(account =>
				account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			)
			.FirstAsync();

		var profile = Profile.CreateStaffProfile(
			$"tenant-create-permission-{Guid.NewGuid():N}",
			"Test-only staff profile for tenant creation permission"
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
			ProfileId = profile.GetRequiredId(),
			PermissionKey = permissionKey,
		});
		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = staffAccount.GetRequiredId(),
			ProfileId = profile.GetRequiredId(),
		});
		await dbContext.SaveChangesAsync();

		return await _authClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private static async Task AssertValidationProblemAsync(
		HttpResponseMessage response,
		string fieldName
	) {
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content
				.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed.Value);
		problem.Errors.Keys.Should()
			.Contain(fieldName);
	}

	private static async Task<IReadOnlyCollection<EmailRequest>>
	WaitForEmailsAsync(
		FakeEmailSender fakeEmailSender,
		int expectedCount
	) {
		const int maxAttempts = 20;

		for (var attempt = 0; attempt < maxAttempts; attempt++) {
			var sentEmails = fakeEmailSender.SentEmails;

			if (sentEmails.Count >= expectedCount) {
				return sentEmails;
			}

			await Task.Delay(100);
		}

		return fakeEmailSender.SentEmails;
	}
}
