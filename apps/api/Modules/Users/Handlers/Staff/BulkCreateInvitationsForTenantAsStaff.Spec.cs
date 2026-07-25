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
using PublyApp.Api.Modules.Profiles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class BulkCreateInvitationsForTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkCreateInvitationsForTenantAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldCreateTenantInvitationsInPartialSuccessMode() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetAcmeTenantIdAsync();
		var techStartTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);

		Guid successProfileA;
		Guid successProfileB;
		Guid foreignProfileId;
		using (var setupScope = _fixture.Factory.Services.CreateScope()) {
			var dbContext = setupScope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var tenantProfileA = Profile.CreateTenantProfile(
				tenantId,
				name: $"tenant-bulk-success-{Guid.NewGuid():N}",
				description: "Bulk invite profile A"
			);
			var tenantProfileB = Profile.CreateTenantProfile(
				tenantId,
				name: $"tenant-bulk-success-{Guid.NewGuid():N}",
				description: "Bulk invite profile B"
			);
			var foreignProfile = Profile.CreateTenantProfile(
				techStartTenantId,
				name: $"tenant-bulk-foreign-{Guid.NewGuid():N}",
				description: "Bulk invite foreign profile"
			);

			await dbContext.Profile.AddRangeAsync(tenantProfileA, tenantProfileB);
			await dbContext.Profile.AddAsync(foreignProfile);
			await dbContext.SaveChangesAsync();

			successProfileA = tenantProfileA.GetRequiredId();
			successProfileB = tenantProfileB.GetRequiredId();
			foreignProfileId = foreignProfile.GetRequiredId();
		}

		string validInviteeEmail =
			$"tenant-bulk-valid-{Guid.NewGuid():N}@example.com";
		string conflictingInviteeEmail = SeedConstants.Tenants.AcmeUserEmail;
		string invalidProfileInviteeEmail =
			$"tenant-bulk-invalid-profile-{Guid.NewGuid():N}@example.com";

		using HttpResponseMessage response = await SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
				new {
					invitations = new[] {
						new {
							email = conflictingInviteeEmail,
							accountLevel = "User",
							profileIds = Array.Empty<string>(),
						},
						new {
							email = validInviteeEmail,
							accountLevel = "User",
							profileIds = new[] {
								successProfileA.ToString(),
								successProfileB.ToString(),
							},
						},
						new {
							email = invalidProfileInviteeEmail,
							accountLevel = "User",
							profileIds = new[] { foreignProfileId.ToString() },
					},
				},
				}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<BulkCreateTenantInvitationsResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload!.SucceededCount.Should().Be(1);
		payload.FailedCount.Should().Be(2);
		payload.FailedItems.Should().HaveCount(2);
		payload.FailedItems.Should().ContainSingle(item =>
			item.Index == 0
			&& item.Email == conflictingInviteeEmail
			&& item.TranslationKey == ResponseKeys.UserAlreadyMemberOfTenant.Value
		);
		payload.FailedItems.Should().ContainSingle(item =>
			item.Index == 2
			&& item.Email == invalidProfileInviteeEmail
			&& item.TranslationKey == ResponseKeys.NotFound.Value
		);

		using (var scope = _fixture.Factory.Services.CreateScope()) {
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

			var persistedProfileIds = await dbContext.InvitationProfile
				.Where(ip => ip.InvitationId == createdInvitation.GetRequiredId())
				.Select(ip => ip.ProfileId)
				.ToListAsync();
			persistedProfileIds.Should()
				.BeEquivalentTo([successProfileA, successProfileB]);

			var foreignProfileInvite = await dbContext.Invitation
				.Where(inv =>
					inv.TenantId == tenantId
					&& inv.Scope == InvitationScope.Tenant
					&& inv.Email == invalidProfileInviteeEmail
				)
				.AnyAsync();
			_ = foreignProfileInvite.Should().BeFalse();
		}
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForBulkTenantInvitesWithoutSession() {
		var tenantId = await GetAcmeTenantIdAsync();

		using HttpResponseMessage response = await SendBulkCreateAsync(
			sessionToken: null,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email = $"tenant-bulk-unauth-{Guid.NewGuid():N}@example.com",
						accountLevel = "User",
					},
				},
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldCreateBulkTenantInvitationForExistingNonStaffUserFromAnotherTenant() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetAcmeTenantIdAsync();

		using var response = await SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email = SeedConstants.Tenants.TechStartUserEmail,
						accountLevel = "User",
						profileIds = Array.Empty<string>(),
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

		using var scope = _fixture.Factory.Services.CreateScope();
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
	public async Task ItShouldRejectAdminInviteeWithProfiles() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetAcmeTenantIdAsync();
		var profileIds = await CreateTenantProfilesAsync(tenantId, count: 1);
		var email = $"tenant-bulk-admin-profiles-{Guid.NewGuid():N}@example.com";

		using var response = await SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email,
						accountLevel = "Admin",
						profileIds = profileIds.Select(id => id.ToString()).ToArray(),
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
			&& item.TranslationKey == "admin-invitee-cannot-have-profiles"
		);
		(await TenantInvitationExistsAsync(tenantId, email)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldRejectUserInviteeWhenProfileCountExceedsConfiguredCap() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetAcmeTenantIdAsync();
		var profileCount = AppEnvironment.Instance.MAX_PROFILES_PER_USER + 1;
		var profileIds = await CreateTenantProfilesAsync(tenantId, profileCount);
		var email = $"tenant-bulk-user-profile-cap-{Guid.NewGuid():N}@example.com";

		using var response = await SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email,
						accountLevel = "User",
						profileIds = profileIds.Select(id => id.ToString()).ToArray(),
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
			&& item.TranslationKey == "too-many-profiles-for-invitee"
		);
		(await TenantInvitationExistsAsync(tenantId, email)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldCreateUserInviteeWithProfilesAtConfiguredCap() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetAcmeTenantIdAsync();
		var profileCount = AppEnvironment.Instance.MAX_PROFILES_PER_USER;
		var profileIds = await CreateTenantProfilesAsync(tenantId, profileCount);
		var email = $"tenant-bulk-user-at-profile-cap-{Guid.NewGuid():N}@example.com";

		using var response = await SendBulkCreateAsync(
			staffToken,
			tenantId.ToString(),
			new {
				invitations = new[] {
					new {
						email,
						accountLevel = "User",
						profileIds = profileIds.Select(id => id.ToString()).ToArray(),
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

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var persistedProfileIds = await (
			from invitation in dbContext.Invitation
			join invitationProfile in dbContext.InvitationProfile
				on invitation.Id equals invitationProfile.InvitationId
			where invitation.TenantId == tenantId
				&& invitation.Email == email
			select invitationProfile.ProfileId
		).ToListAsync();
		persistedProfileIds.Should().BeEquivalentTo(profileIds);
	}

	private static string GetBulkInviteUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.BulkInviteFn(tenantId)
		);
	}

	private async Task<Guid> GetAcmeTenantIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<List<Guid>> CreateTenantProfilesAsync(Guid tenantId, int count) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var profiles = new List<Profile>();

		for (var i = 0; i < count; i++) {
			var profile = Profile.CreateTenantProfile(
				tenantId,
				name: $"tenant-bulk-cap-{Guid.NewGuid():N}",
				description: "Bulk invite profile-cap test"
			);
			profile.ValidateProfileType();
			profiles.Add(profile);
		}

		await dbContext.Profile.AddRangeAsync(profiles);
		_ = await dbContext.SaveChangesAsync();
		return profiles.Select(profile => profile.GetRequiredId()).ToList();
	}

	private async Task<bool> TenantInvitationExistsAsync(Guid tenantId, string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.Invitation.AnyAsync(invitation =>
			invitation.TenantId == tenantId
			&& invitation.Scope == InvitationScope.Tenant
			&& invitation.Email == email
		);
	}

	private async Task<HttpResponseMessage> SendBulkCreateAsync(
		string? sessionToken,
		string tenantId,
		object body
	) {
		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkInviteUrl(tenantId)
		);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}
		request.Content = JsonContent.Create(body);

		return await _http.SendAsync(request);
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
