
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
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class CreateInvitationForTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateInvitationForTenantAsStaffSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldSendTenantInvitationEmailWhenInvitationIsCreated() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var inviteeEmail =
			$"tenant-invite-{Guid.NewGuid():N}@example.com";
		var request = CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = inviteeEmail,
			}
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();
		Assert.NotNull(responseBody);

		using var scope =
			this._Fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var pendingJobs = await dbContext.JobQueue.AsNoTracking()
			.Where(j => j.JobType == InvitationEmailJobs.TenantInvitationV1.JobType)
			.ToListAsync();

		var matchingJobs = pendingJobs
			.Where(j =>
				CreateInvitationForTenantAsStaffSpec._JobPayloadContainsId(j.Payload, "invitationId", responseBody.Required().InvitationId)
			)
			.ToList();

		matchingJobs.Should().HaveCount(1);
	}

	private static bool _JobPayloadContainsId(
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
			await this._CreateStaffUserTokenWithPermissionAsync(
				AppPermissions.Staff.Users.CREATE_FOR_TENANT.Key
			);
		var tenantId =
			await this._GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-permissioned-invite-{Guid.NewGuid():N}@example.com";

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
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
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = SeedConstants.Tenants.TechStartUserEmail,
			}
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		using var scope =
			this._Fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Assert.NotNull(responseBody);
		var invitationRoles = await dbContext.InvitationRole
					.Where(ip => ip.InvitationId == responseBody.InvitationId)
					.ToListAsync();

		invitationRoles.Should().BeEmpty();
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWhenExistingUserAlreadyBelongsToTargetTenant() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = SeedConstants.Tenants.AcmeUserEmail,
			}
		);

		using var response =
			await this._Http.SendAsync(request);

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
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = SeedConstants.Staff.UserEmail,
			}
		);

		using var response =
			await this._Http.SendAsync(request);

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
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await this._GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-pending-duplicate-{Guid.NewGuid():N}@example.com";

		var firstInvitation = await this._CreateTenantInvitationAsync(
			staffToken,
			tenantId,
			inviteeEmail
		);
		firstInvitation.InvitationId.Should()
			.NotBeEmpty();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
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
	ItShouldRejectMemberTenantInvitationAboveConfiguredRoleCap() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await this._GetAcmeTenantIdAsync();
		var roleCount =
			AppEnvironment.Instance.MAX_ROLES_PER_USER + 1;
		var roleIds =
			await this._CreateTenantRolesAsync(tenantId, roleCount);
		var inviteeEmail =
			$"tenant-user-role-cap-{Guid.NewGuid():N}@example.com";

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
					roleIds = roleIds.Select(id => id.ToString()).ToArray(),
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
			.Be(ResponseKeys.TooManyRolesForInvitee.Value);
		(await this._TenantInvitationExistsAsync(tenantId, inviteeEmail))
			.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldCreateTenantInvitationWithSpecifiedRoleIds() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await this._GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-role-ids-{Guid.NewGuid():N}@example.com";
		var roleAName = $"tenant-role-a-{Guid.NewGuid():N}";
		var roleBName = $"tenant-role-b-{Guid.NewGuid():N}";

		using var setupScope =
			this._Fixture.Factory.Services.CreateScope();
		var dbContext = setupScope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var roleA = Role.CreateTenantRole(
			tenantId,
			name: roleAName,
			description: "test role"
		);
		var roleB = Role.CreateTenantRole(
			tenantId,
			name: roleBName,
			description: "test role"
		);
		await dbContext.Role.AddRangeAsync(roleA, roleB);
		await dbContext.SaveChangesAsync();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = inviteeEmail,
					roleIds = new[] {
						roleA.GetRequiredId().ToString(),
						roleB.GetRequiredId().ToString(),
					},
				}
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		var invitationRoles = await dbContext.InvitationRole
			.Where(ip => ip.InvitationId == responseBody.Required().InvitationId)
			.Select(ip => ip.RoleId)
			.ToListAsync();

		invitationRoles.Should().HaveCount(2);
		invitationRoles.Should().Contain(roleA.GetRequiredId());
		invitationRoles.Should().Contain(roleB.GetRequiredId());
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWithForeignTenantRoleId() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var acmeTenantId =
			await this._GetAcmeTenantIdAsync();
		var techStartTenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		using var setupScope =
			this._Fixture.Factory.Services.CreateScope();
		var dbContext = setupScope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var foreignRole = await dbContext.Role
			.Where(role =>
				role.TenantId == techStartTenantId && role.Scope == RoleScope.Tenant
			)
			.FirstOrDefaultAsync();

		if (foreignRole is null) {
			foreignRole = Role.CreateTenantRole(
				techStartTenantId,
				"Foreign Tenant Role"
			);
			dbContext.Role.Add(foreignRole);
			await dbContext.SaveChangesAsync();
		}

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				acmeTenantId.ToString(),
				new {
					email = $"tenant-invalid-role-{Guid.NewGuid():N}@example.com",
					roleIds = new[] { foreignRole.GetRequiredId().ToString() },
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
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await this._GetAcmeTenantIdAsync();
		var inviteeEmail =
			$"tenant-audit-invite-{Guid.NewGuid():N}@example.com";

		var responseBody = await this._CreateTenantInvitationAsync(
			staffToken,
			tenantId,
			inviteeEmail
		);

		using var scope =
			this._Fixture.Factory.Services.CreateScope();
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
		root.GetProperty("Scope").GetString()
			.Should().Be("Tenant");
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				"not-a-guid",
				new {
					email = $"tenant-malformed-{Guid.NewGuid():N}@example.com",
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
			await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				Guid.NewGuid().ToString(),
				new {
					email = $"tenant-missing-{Guid.NewGuid():N}@example.com",
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
			await this._GetAcmeTenantIdAsync();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				sessionToken: null,
				tenantId.ToString(),
				new {
					email = $"tenant-no-session-{Guid.NewGuid():N}@example.com",
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
			await this._GetAcmeTenantIdAsync();
		var tenantToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				tenantToken,
				tenantId.ToString(),
				new {
					email = $"tenant-user-forbidden-{Guid.NewGuid():N}@example.com",
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
			await this._GetAcmeTenantIdAsync();
		var staffUserToken =
			await this._CreateUnprivilegedStaffUserTokenAsync();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffUserToken,
				tenantId.ToString(),
				new {
					email = $"staff-no-permission-{Guid.NewGuid():N}@example.com",
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
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await this._GetAcmeTenantIdAsync();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new Dictionary<string, object>()
			)
		);

		await CreateInvitationForTenantAsStaffSpec._AssertValidationProblemAsync(response, "Email");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenEmailIsInvalid() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await this._GetAcmeTenantIdAsync();

		using var response = await this._Http.SendAsync(
			CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
				staffToken,
				tenantId.ToString(),
				new {
					email = "not-an-email",
				}
			)
		);

		await CreateInvitationForTenantAsStaffSpec._AssertValidationProblemAsync(response, "Email");
	}

	[Fact]
	public async Task
	ItShouldCreateTenantInvitationWithEmptyRoleIds() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var inviteeEmail =
			$"tenant-empty-role-ids-{Guid.NewGuid():N}@example.com";
		var request = CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email = inviteeEmail,
				roleIds = Array.Empty<string>(),
			}
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		using (var scope =
			this._Fixture.Factory.Services.CreateScope()) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			Assert.NotNull(responseBody);
			var assignedRoles = await dbContext.InvitationRole
				.Where(ip => ip.InvitationId == responseBody.InvitationId)
				.ToListAsync();

			assignedRoles.Should().BeEmpty();
		}
	}

	private sealed record InvitationCreatedForTenantResponse {
		public required Guid InvitationId { get; init; }
		public DateTime ExpiresAt { get; init; }
	}

	private static string _GetInviteUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.InviteFn(tenantId)
		);
	}

	private static HttpRequestMessage _CreateTenantInviteRequest(
		string? sessionToken,
		string tenantId,
		object body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateInvitationForTenantAsStaffSpec._GetInviteUrl(tenantId)
		);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);

		return request;
	}

	private async Task<Guid> _GetAcmeTenantIdAsync() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<List<Guid>> _CreateTenantRolesAsync(
		Guid tenantId,
		int count
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var roles = new List<Role>();

		for (var index = 0; index < count; index++) {
			roles.Add(
				Role.CreateTenantRole(
					tenantId,
					$"tenant-invite-role-{Guid.NewGuid():N}",
					"Single invitation role-rule test"
				)
			);
		}

		await dbContext.Role.AddRangeAsync(roles);
		await dbContext.SaveChangesAsync();

		return roles
			.Select(role => role.GetRequiredId())
			.ToList();
	}

	private async Task<bool> _TenantInvitationExistsAsync(
		Guid tenantId,
		string email
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.Invitation.AnyAsync(invitation =>
			invitation.TenantId == tenantId
			&& invitation.Scope == InvitationScope.Tenant
			&& invitation.Email == email
		);
	}

	private async Task<InvitationCreatedForTenantResponse>
		_CreateTenantInvitationAsync(
			string staffToken,
			Guid tenantId,
			string email
		) {
		using var request = CreateInvitationForTenantAsStaffSpec._CreateTenantInviteRequest(
			staffToken,
			tenantId.ToString(),
			new {
				email,
			}
		);

		using var response =
			await this._Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		Assert.NotNull(responseBody);
		return responseBody;
	}

	private async Task<string> _CreateUnprivilegedStaffUserTokenAsync() {
		var email =
			$"tenant-invite-unprivileged-{Guid.NewGuid():N}@example.com";

		await StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			email
		);

		return await this._AuthClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private async Task<string> _CreateStaffUserTokenWithPermissionAsync(
		string permissionKey
	) {
		var email =
			$"tenant-invite-permissioned-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			email
		);

		using var scope =
			this._Fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var staffAccount = await dbContext.UserAccount
			.Where(account =>
				account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			)
			.FirstAsync();

		var role = Role.CreateStaffRole(
			$"tenant-invite-permission-{Guid.NewGuid():N}",
			"Test-only staff role for tenant invitation creation"
		);

		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		await dbContext.RolePermission.AddAsync(new RolePermission {
			RoleId = role.GetRequiredId(),
			PermissionKey = permissionKey,
		});
		await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
			UserAccountId = staffAccount.GetRequiredId(),
			RoleId = role.GetRequiredId(),
		});
		await dbContext.SaveChangesAsync();

		return await this._AuthClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private static async Task _AssertValidationProblemAsync(
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
