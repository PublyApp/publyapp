using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
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
			&& item.TranslationKey == ResponseKeys.UserHasTenantOrProjectAccounts.Value
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
