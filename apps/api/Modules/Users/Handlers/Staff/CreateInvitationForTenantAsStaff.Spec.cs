
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Data.Seeding;
using MainApi.Infrastructure.Messaging.Email;
using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Localization;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.Profiles.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Modules.Users.Handlers.Staff;

public sealed class CreateInvitationForTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateInvitationForTenantAsStaffSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldSendTenantInvitationEmailWhenInvitationIsCreated() {
		var fakeEmailSender = _fixture.GetFakeEmailSender();
		fakeEmailSender.Clear();

		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var inviteeEmail =
			$"tenant-invite-{Guid.NewGuid():N}@example.com";
		var request = CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = inviteeEmail,
				accountLevel = "User",
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var sentEmail = await WaitForSingleEmailAsync(
			fakeEmailSender,
			inviteeEmail
		);

		sentEmail.Should().NotBeNull();
		Assert.NotNull(sentEmail);
		sentEmail.To.Should().Be(inviteeEmail);
		sentEmail.Subject.Should()
			.Contain(SeedConstants.Tenants.AcmeName);
		sentEmail.HtmlBody.Should()
			.Contain("Accept the invitation");
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToCreateTenantInvitation() {
		var staffToken =
			await CreateStaffUserTokenWithPermissionAsync(
				AppPermissions.Staff.Users.CREATE_FOR_TENANT.Key
			);
		var tenantId =
			await GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-permissioned-invite-{Guid.NewGuid():N}@example.com";

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
					accountLevel = "User",
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);
	}

	[Fact]
	public async Task
	ItShouldCreateTenantInvitationForExistingNonStaffUserFromAnotherTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = SeedConstants.Tenants.TechStartUserEmail,
				accountLevel = "User",
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		Assert.NotNull(responseBody);
		var invitationProfiles = await dbContext.InvitationProfile
					.Where(ip => ip.InvitationId == responseBody.InvitationId)
					.ToListAsync();

		invitationProfiles.Should().HaveCount(1);
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWhenExistingUserAlreadyBelongsToTargetTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = SeedConstants.Tenants.AcmeUserEmail,
				accountLevel = "User",
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var responseBody =
			await response.Content.ReadAsStringAsync();
		responseBody.Should()
			.Contain("user-already-member-of-tenant");
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWhenExistingUserHasStaffAccount() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = SeedConstants.Staff.UserEmail,
				accountLevel = "User",
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var responseBody =
			await response.Content.ReadAsStringAsync();
		responseBody.Should()
			.Contain("user-has-staff-account");
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWhenPendingInvitationAlreadyExists() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-pending-duplicate-{Guid.NewGuid():N}@example.com";

		var firstInvitation = await CreateTenantInvitationAsync(
			staffToken,
			tenantId,
			inviteeEmail
		);
		firstInvitation.InvitationId.Should()
			.NotBeEmpty();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
					accountLevel = "User",
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.PendingInvitationExists.Value);
	}

	[Fact]
	public async Task
	ItShouldCreateAdminTenantInvitationWithoutDefaultProfile() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-admin-invite-{Guid.NewGuid():N}@example.com";

		var responseBody = await CreateTenantInvitationAsync(
			staffToken,
			tenantId,
			inviteeEmail,
			accountLevel: "Admin"
		);

		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var invitation = await dbContext.Invitation
			.Where(inv => inv.Id == responseBody.InvitationId)
			.Include(inv => inv.InvitationProfiles)
			.SingleAsync();

		invitation.AccountLevel.Should()
			.Be(AccountLevel.Admin);
		invitation.InvitationProfiles.Should()
			.BeEmpty();
	}

	[Fact]
	public async Task
	ItShouldCreateAuditLogWhenTenantInvitationIsCreated() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-audit-invite-{Guid.NewGuid():N}@example.com";

		var responseBody = await CreateTenantInvitationAsync(
			staffToken,
			tenantId,
			inviteeEmail
		);

		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var auditLog = await dbContext.AuditLog
			.Where(log =>
				log.Action == AuditActions.InvitationCreated
				&& log.TargetId == responseBody.InvitationId
			)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();

		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Details.Should().NotBeNull();

		Assert.NotNull(auditLog.Details);
		using var details = JsonDocument.Parse(auditLog.Details);
		var root = details.RootElement;
		root.GetProperty("Email").GetString()
			.Should().Be(inviteeEmail);
		root.GetProperty("TenantId").GetGuid()
			.Should().Be(tenantId);
		root.GetProperty("AccountLevel").GetString()
			.Should().Be("User");
		root.GetProperty("Scope").GetString()
			.Should().Be("Tenant");
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				"not-a-guid",
				new {
					email = $"tenant-malformed-{Guid.NewGuid():N}@example.com",
					accountLevel = "User",
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.MalformedId.Value);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantDoesNotExist() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				Guid.NewGuid().ToString(),
				new {
					email = $"tenant-missing-{Guid.NewGuid():N}@example.com",
					accountLevel = "User",
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.TenantNotFound.Value);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId =
			await GetAcmeTenantIdAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				sessionToken: null,
				tenantId.ToString(),
				new {
					email = $"tenant-no-session-{Guid.NewGuid():N}@example.com",
					accountLevel = "User",
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var tenantId =
			await GetAcmeTenantIdAsync();
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				tenantToken,
				tenantId.ToString(),
				new {
					email = $"tenant-user-forbidden-{Guid.NewGuid():N}@example.com",
					accountLevel = "User",
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId =
			await GetAcmeTenantIdAsync();
		var staffUserToken =
			await CreateUnprivilegedStaffUserTokenAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffUserToken,
				tenantId.ToString(),
				new {
					email = $"staff-no-permission-{Guid.NewGuid():N}@example.com",
					accountLevel = "User",
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenEmailIsMissing() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					accountLevel = "User",
				}
			)
		);

		await AssertValidationProblemAsync(response, "Email");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenEmailIsInvalid() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = "not-an-email",
					accountLevel = "User",
				}
			)
		);

		await AssertValidationProblemAsync(response, "Email");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenAccountLevelIsMissing() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = $"tenant-missing-level-{Guid.NewGuid():N}@example.com",
				}
			)
		);

		await AssertValidationProblemAsync(response, "AccountLevel");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenAccountLevelIsInvalid() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = $"tenant-invalid-level-{Guid.NewGuid():N}@example.com",
					accountLevel = "Owner",
				}
			)
		);

		await AssertValidationProblemAsync(response, "AccountLevel");
	}

	[Fact]
	public async Task
	ItShouldUseDefaultTenantProfileMarkerInsteadOfProfileName() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using (var scope =
			_fixture.Factory.Services.CreateScope()) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			var renamedDefaultProfile = await dbContext.Profile
				.Where(p => p.TenantId == tenantId && p.Scope == ProfileScope.Tenant && p.IsDefault)
				.FirstOrDefaultAsync();

			if (renamedDefaultProfile is null) {
				renamedDefaultProfile = Profile.CreateTenantProfile(
					tenantId,
					name: "Default profile",
					description: "Default profile with no permissions",
					isDefault: true
				);

				await dbContext.Profile.AddAsync(renamedDefaultProfile);
			}

			renamedDefaultProfile.Name = "Base access";
			await dbContext.SaveChangesAsync();
		}

		var inviteeEmail =
			$"tenant-default-profile-{Guid.NewGuid():N}@example.com";
		var request = CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = inviteeEmail,
				accountLevel = "User",
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		using (var scope =
			_fixture.Factory.Services.CreateScope()) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			Assert.NotNull(responseBody);
			var profileId = await dbContext.InvitationProfile
							.Where(ip => ip.InvitationId == responseBody.InvitationId)
							.Select(ip => ip.ProfileId)
							.SingleAsync();

			var assignedProfile = await dbContext.Profile
				.Where(p => p.Id == profileId)
				.SingleAsync();

			assignedProfile.IsDefault.Should().BeTrue();
			assignedProfile.Name.Should().Be("Base access");
		}
	}

	private sealed record InvitationCreatedForTenantResponse {
		public required Guid InvitationId { get; init; }
		public DateTime ExpiresAt { get; init; }
	}

	private static string GetInviteUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.InviteFn(tenantId)
		);
	}

	private static HttpRequestMessage CreateTenantInviteRequest(
		string? sessionToken,
		string tenantId,
		object body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetInviteUrl(tenantId)
		);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);

		return request;
	}

	private async Task<Guid> GetAcmeTenantIdAsync() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<InvitationCreatedForTenantResponse>
		CreateTenantInvitationAsync(
			string staffToken,
			Guid tenantId,
			string email,
			string accountLevel = "User"
		) {
		using var request = CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email,
				accountLevel,
			}
		);

		using var response =
			await _http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		Assert.NotNull(responseBody);
		return responseBody;
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var email =
			$"tenant-invite-unprivileged-{Guid.NewGuid():N}@example.com";

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
			$"tenant-invite-permissioned-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email
		);

		using var scope =
			_fixture.Factory.Services.CreateScope();
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
			$"tenant-invite-permission-{Guid.NewGuid():N}",
			"Test-only staff profile for tenant invitation creation"
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
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.RequestBodyValidationFailed.Value);
		problem.Errors.Keys.Should()
			.Contain(fieldName);
	}

	private static async Task<EmailRequest?>
	WaitForSingleEmailAsync(
		MainApi.Lib.Testing.Fakes.FakeEmailSender fakeEmailSender,
		string email
	) {
		const int maxAttempts = 10;

		for (var attempt = 0; attempt < maxAttempts; attempt++) {
			var sentEmail = fakeEmailSender.SentEmails
				.SingleOrDefault(x => x.To == email);

			if (sentEmail is not null) {
				return sentEmail;
			}

			await Task.Delay(100);
		}

		return null;
	}
}
