using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Roles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class BulkCreateInvitationsForTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkCreateInvitationsForTenantAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldCreateTenantInvitationsInPartialSuccessMode() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetAcmeTenantIdAsync();
		var techStartTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);

		Guid successRoleA;
		Guid successRoleB;
		Guid foreignRoleId;
		using (var setupScope = this._Fixture.Factory.Services.CreateScope()) {
			var dbContext = setupScope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var tenantRoleA = Role.CreateTenantRole(
				tenantId,
				name: $"tenant-bulk-success-{Guid.NewGuid():N}",
				description: "Bulk invite role A"
			);
			var tenantRoleB = Role.CreateTenantRole(
				tenantId,
				name: $"tenant-bulk-success-{Guid.NewGuid():N}",
				description: "Bulk invite role B"
			);
			var foreignRole = Role.CreateTenantRole(
				techStartTenantId,
				name: $"tenant-bulk-foreign-{Guid.NewGuid():N}",
				description: "Bulk invite foreign role"
			);

			await dbContext.Role.AddRangeAsync(tenantRoleA, tenantRoleB);
			await dbContext.Role.AddAsync(foreignRole);
			await dbContext.SaveChangesAsync();

			successRoleA = tenantRoleA.GetRequiredId();
			successRoleB = tenantRoleB.GetRequiredId();
			foreignRoleId = foreignRole.GetRequiredId();
		}

		string validInviteeEmail =
			$"tenant-bulk-valid-{Guid.NewGuid():N}@example.com";
		string conflictingInviteeEmail = SeedConstants.Tenants.AcmeUserEmail;
		string invalidRoleInviteeEmail =
			$"tenant-bulk-invalid-role-{Guid.NewGuid():N}@example.com";

		using HttpResponseMessage response = await this._SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
				new {
					invitations = new[] {
						new {
							email = conflictingInviteeEmail,
							roleIds = Array.Empty<string>(),
						},
						new {
							email = validInviteeEmail,
							roleIds = new[] {
								successRoleA.ToString(),
								successRoleB.ToString(),
							},
						},
						new {
							email = invalidRoleInviteeEmail,
							roleIds = new[] { foreignRoleId.ToString() },
					},
				},
				}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<BulkCreateTenantInvitationsResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Required().SucceededCount.Should().Be(1);
		payload.FailedCount.Should().Be(2);
		payload.FailedItems.Should().HaveCount(2);
		payload.FailedItems.Should().ContainSingle(item =>
			item.Index == 0
			&& item.Email == conflictingInviteeEmail
			&& item.TranslationKey == ResponseKeys.UserAlreadyMemberOfTenant.Value
		);
		payload.FailedItems.Should().ContainSingle(item =>
			item.Index == 2
			&& item.Email == invalidRoleInviteeEmail
			&& item.TranslationKey == ResponseKeys.NotFound.Value
		);

		using (var scope = this._Fixture.Factory.Services.CreateScope()) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var createdInvitation = await dbContext.Invitation
				.Where(inv =>
					inv.TenantId == tenantId
					&& inv.Scope == InvitationScope.Tenant
					&& inv.Email == validInviteeEmail
				)
				.FirstOrDefaultAsync();

			createdInvitation.Should().NotBeNull();
			Assert.NotNull(createdInvitation);

			var persistedRoleIds = await dbContext.InvitationRole
				.Where(ip => ip.InvitationId == createdInvitation.GetRequiredId())
				.Select(ip => ip.RoleId)
				.ToListAsync();
			persistedRoleIds.Should()
				.BeEquivalentTo([successRoleA, successRoleB]);

			var foreignRoleInvite = await dbContext.Invitation
				.Where(inv =>
					inv.TenantId == tenantId
					&& inv.Scope == InvitationScope.Tenant
					&& inv.Email == invalidRoleInviteeEmail
				)
				.AnyAsync();
			_ = foreignRoleInvite.Should().BeFalse();
		}
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForBulkTenantInvitesWithoutSession() {
		var tenantId = await this._GetAcmeTenantIdAsync();

		using HttpResponseMessage response = await this._SendBulkCreateAsync(
			sessionToken: null,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email = $"tenant-bulk-unauth-{Guid.NewGuid():N}@example.com",
					},
				},
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldCreateBulkTenantInvitationForExistingNonStaffUserFromAnotherTenant() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetAcmeTenantIdAsync();

		using var response = await this._SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email = SeedConstants.Tenants.TechStartUserEmail,
						roleIds = Array.Empty<string>(),
					},
				},
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<BulkCreateTenantInvitationsResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.SucceededCount.Should().Be(1);
		payload.FailedCount.Should().Be(0);
		payload.FailedItems.Should().BeEmpty();

		using var scope = this._Fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var invitationExists = await dbContext.Invitation
			.Where(invitation =>
				invitation.TenantId == tenantId
				&& invitation.Scope == InvitationScope.Tenant
				&& invitation.Email == SeedConstants.Tenants.TechStartUserEmail
			)
			.AnyAsync();

		invitationExists.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldRejectMemberInviteeWhenRoleCountExceedsConfiguredCap() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetAcmeTenantIdAsync();
		var roleCount = AppEnvironment.Instance.MAX_ROLES_PER_USER + 1;
		var roleIds = await this._CreateTenantRolesAsync(tenantId, roleCount);
		var email = $"tenant-bulk-user-role-cap-{Guid.NewGuid():N}@example.com";

		using var response = await this._SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email,
						roleIds = roleIds.Select(id => id.ToString()).ToArray(),
					},
				},
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<BulkCreateTenantInvitationsResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.SucceededCount.Should().Be(0);
		payload.FailedCount.Should().Be(1);
		payload.FailedItems.Should().ContainSingle(item =>
			item.Email == email
			&& item.TranslationKey == "too-many-roles-for-invitee"
		);
		(await this._TenantInvitationExistsAsync(tenantId, email)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldCreateMemberInviteeWithRolesAtConfiguredCap() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetAcmeTenantIdAsync();
		var roleCount = AppEnvironment.Instance.MAX_ROLES_PER_USER;
		var roleIds = await this._CreateTenantRolesAsync(tenantId, roleCount);
		var email = $"tenant-bulk-user-at-role-cap-{Guid.NewGuid():N}@example.com";

		using var response = await this._SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email,
						roleIds = roleIds.Select(id => id.ToString()).ToArray(),
					},
				},
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<BulkCreateTenantInvitationsResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.SucceededCount.Should().Be(1);
		payload.FailedCount.Should().Be(0);
		payload.FailedItems.Should().BeEmpty();

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var persistedRoleIds = await (
			from invitation in dbContext.Invitation
			join invitationRole in dbContext.InvitationRole
				on invitation.Id equals invitationRole.InvitationId
			where invitation.TenantId == tenantId
				&& invitation.Email == email
			select invitationRole.RoleId
		).ToListAsync();
		persistedRoleIds.Should().BeEquivalentTo(roleIds);
	}

	private static string _GetBulkInviteUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.BulkInviteFn(tenantId)
		);
	}

	private async Task<Guid> _GetAcmeTenantIdAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<List<Guid>> _CreateTenantRolesAsync(Guid tenantId, int count) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var roles = new List<Role>();

		for (var i = 0; i < count; i++) {
			var role = Role.CreateTenantRole(
				tenantId,
				name: $"tenant-bulk-cap-{Guid.NewGuid():N}",
				description: "Bulk invite role-cap test"
			);
			role.ValidateRoleType();
			roles.Add(role);
		}

		await dbContext.Role.AddRangeAsync(roles);
		_ = await dbContext.SaveChangesAsync();
		return roles.Select(role => role.GetRequiredId()).ToList();
	}

	private async Task<bool> _TenantInvitationExistsAsync(Guid tenantId, string email) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.Invitation.AnyAsync(invitation =>
			invitation.TenantId == tenantId
			&& invitation.Scope == InvitationScope.Tenant
			&& invitation.Email == email
		);
	}

	private async Task<HttpResponseMessage> _SendBulkCreateAsync(
		string? sessionToken,
		string tenantId,
		object body
	) {
		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkCreateInvitationsForTenantAsStaffSpec._GetBulkInviteUrl(tenantId)
		);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}
		request.Content = JsonContent.Create(body);

		return await this._Http.SendAsync(request);
	}

	private record BulkCreateTenantInvitationsResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public List<BulkCreateTenantInvitationsFailedItem> FailedItems { get; init; }
			= [];
	}

	private record BulkCreateTenantInvitationsFailedItem {
		public int Index { get; init; }
		public string Email { get; init; } = string.Empty;
		public string Reason { get; init; } = string.Empty;
		public string TranslationKey { get; init; } = string.Empty;
	}
}
