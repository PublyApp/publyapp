
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

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

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();
		Assert.NotNull(responseBody);

		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var pendingJobs = await dbContext.JobQueue.AsNoTracking()
			.Where(j => j.JobType == InvitationEmailJobs.TenantInvitationV1.JobType)
			.ToListAsync();

		var matchingJobs = pendingJobs
			.Where(j => JobPayloadContainsId(j.Payload, "invitationId", responseBody!.InvitationId))
			.ToList();

		matchingJobs.Should().HaveCount(1);
	}

	private static bool JobPayloadContainsId(
		string? payload,
		string propertyName,
		Guid id
	) {
		if (string.IsNullOrWhiteSpace(payload)) {
			return false;
		}

		using var doc = JsonDocument.Parse(payload);
		var root = doc.RootElement;
		if (!root.TryGetProperty(propertyName, out var token)
			|| token.ValueKind is not JsonValueKind.String) {
			return false;
		}

		var tokenValue = token.GetString();
		return tokenValue == id.ToString();
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
			.GetRequiredService<AppDbContext>();

		Assert.NotNull(responseBody);
		var invitationProfiles = await dbContext.InvitationProfile
					.Where(ip => ip.InvitationId == responseBody.InvitationId)
					.ToListAsync();

		invitationProfiles.Should().BeEmpty();
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
			.GetRequiredService<AppDbContext>();

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
	ItShouldRejectAdminTenantInvitationWithProfiles() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();
		var profileIds =
			await CreateTenantProfilesAsync(tenantId, count: 1);
		var inviteeEmail =
			$"tenant-admin-profile-{Guid.NewGuid():N}@example.com";

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
					accountLevel = "Admin",
					profileIds = profileIds.Select(id => id.ToString()).ToArray(),
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be(ResponseKeys.AdminInviteeCannotHaveProfiles.Value);
		(await TenantInvitationExistsAsync(tenantId, inviteeEmail))
			.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldRejectUserTenantInvitationAboveConfiguredProfileCap() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();
		var profileCount =
			AppEnvironment.Instance.MAX_PROFILES_PER_USER + 1;
		var profileIds =
			await CreateTenantProfilesAsync(tenantId, profileCount);
		var inviteeEmail =
			$"tenant-user-profile-cap-{Guid.NewGuid():N}@example.com";

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
					accountLevel = "User",
					profileIds = profileIds.Select(id => id.ToString()).ToArray(),
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be(ResponseKeys.TooManyProfilesForInvitee.Value);
		(await TenantInvitationExistsAsync(tenantId, inviteeEmail))
			.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldCreateTenantInvitationWithSpecifiedProfileIds() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-profile-ids-{Guid.NewGuid():N}@example.com";
		var profileAName = $"tenant-profile-a-{Guid.NewGuid():N}";
		var profileBName = $"tenant-profile-b-{Guid.NewGuid():N}";

		using var setupScope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = setupScope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var profileA = Profile.CreateTenantProfile(
			tenantId,
			name: profileAName,
			description: "test profile"
		);
		var profileB = Profile.CreateTenantProfile(
			tenantId,
			name: profileBName,
			description: "test profile"
		);
		await dbContext.Profile.AddRangeAsync(profileA, profileB);
		await dbContext.SaveChangesAsync();

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
					accountLevel = "User",
					profileIds = new[] {
						profileA.GetRequiredId().ToString(),
						profileB.GetRequiredId().ToString(),
					},
				}
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		var invitationProfiles = await dbContext.InvitationProfile
			.Where(ip => ip.InvitationId == responseBody!.InvitationId)
			.Select(ip => ip.ProfileId)
			.ToListAsync();

		invitationProfiles.Should().HaveCount(2);
		invitationProfiles.Should().Contain(profileA.GetRequiredId());
		invitationProfiles.Should().Contain(profileB.GetRequiredId());
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWithForeignTenantProfileId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId =
			await GetAcmeTenantIdAsync();
		var techStartTenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		using var setupScope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = setupScope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var foreignProfile = await dbContext.Profile
			.Where(profile =>
				profile.TenantId == techStartTenantId && profile.Scope == ProfileScope.Tenant
			)
			.FirstOrDefaultAsync();

		if (foreignProfile is null) {
			foreignProfile = Profile.CreateTenantProfile(
				techStartTenantId,
				"Foreign Tenant Profile"
			);
			dbContext.Profile.Add(foreignProfile);
			await dbContext.SaveChangesAsync();
		}

		using var response = await _http.SendAsync(
			CreateTenantInviteRequest(
				staffToken,
				acmeTenantId.ToString(),
				new {
					email = $"tenant-invalid-profile-{Guid.NewGuid():N}@example.com",
					accountLevel = "User",
					profileIds = new[] { foreignProfile.GetRequiredId().ToString() },
				}
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.NotFound.Value);
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
			.GetRequiredService<AppDbContext>();

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
	ItShouldCreateTenantInvitationWithEmptyProfileIds() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var inviteeEmail =
			$"tenant-empty-profile-ids-{Guid.NewGuid():N}@example.com";
		var request = CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = inviteeEmail,
				accountLevel = "User",
				profileIds = Array.Empty<string>(),
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
				.GetRequiredService<AppDbContext>();

			Assert.NotNull(responseBody);
			var assignedProfiles = await dbContext.InvitationProfile
				.Where(ip => ip.InvitationId == responseBody.InvitationId)
				.ToListAsync();

			assignedProfiles.Should().BeEmpty();
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

	private async Task<List<Guid>> CreateTenantProfilesAsync(
		Guid tenantId,
		int count
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var profiles = new List<Profile>();

		for (var index = 0; index < count; index++) {
			profiles.Add(
				Profile.CreateTenantProfile(
					tenantId,
					$"tenant-invite-profile-{Guid.NewGuid():N}",
					"Single invitation profile-rule test"
				)
			);
		}

		await dbContext.Profile.AddRangeAsync(profiles);
		await dbContext.SaveChangesAsync();

		return profiles
			.Select(profile => profile.GetRequiredId())
			.ToList();
	}

	private async Task<bool> TenantInvitationExistsAsync(
		Guid tenantId,
		string email
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.Invitation.AnyAsync(invitation =>
			invitation.TenantId == tenantId
			&& invitation.Scope == InvitationScope.Tenant
			&& invitation.Email == email
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
			.GetRequiredService<AppDbContext>();

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

}
