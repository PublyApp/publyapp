using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

// #2275: the redesigned organisations list needs these row fields and the
// side-panel counters (per status, seats bucket and language) without a
// second request.
public sealed class FindTenantsAsStaffRowFieldsSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindTenantsAsStaffRowFieldsSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldReturnTheRowFieldsTheRedesignedListShows() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = $"rowfields-{Guid.NewGuid():N}";
		var before = DateTime.UtcNow;
		var tenantId = await this._SeedTenantAsync(
			$"{marker}-full",
			TenantStatus.Active,
			maxUsers: 5,
			locale: "fr"
		);
		var otherId = await this._SeedTenantAsync(
			$"{marker}-empty",
			TenantStatus.Pending,
			maxUsers: 5,
			locale: "en"
		);
		var ownerAccountId = await this._AddMemberAsync(tenantId, isOwner: true);
		_ = await this._AddMemberAsync(tenantId, isOwner: true);
		_ = await this._AddMemberAsync(tenantId, isOwner: false);
		var memberUserId = await this._GetUserIdAsync(ownerAccountId);
		await this._AddRoleAsync(tenantId, "Editors");
		await this._AddRoleAsync(tenantId, "Deleted role", isDeleted: true);

		// Active accounts only: revoked and soft-deleted ones are not connected.
		await this._AddSocialAccountAsync(tenantId, SocialAccountStatus.Active);
		await this._AddSocialAccountAsync(tenantId, SocialAccountStatus.Active);
		await this._AddSocialAccountAsync(tenantId, SocialAccountStatus.Revoked);
		await this._AddSocialAccountAsync(
			tenantId, SocialAccountStatus.Active, isDeleted: true
		);

		// Posts created in the current UTC calendar month; last month's and
		// soft-deleted ones do not count.
		var now = DateTime.UtcNow;
		var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
		await this._AddPostAsync(tenantId, memberUserId, monthStart.AddMinutes(1));
		await this._AddPostAsync(tenantId, memberUserId, monthStart.AddMinutes(2));
		await this._AddPostAsync(tenantId, memberUserId, monthStart.AddDays(-1));
		await this._AddPostAsync(
			tenantId, memberUserId, monthStart.AddMinutes(3), isDeleted: true
		);

		await this._AddPendingInvitationAsync(tenantId, DateTime.UtcNow.AddDays(3));
		await this._AddPendingInvitationAsync(tenantId, DateTime.UtcNow.AddDays(30));
		await this._AddPendingInvitationAsync(tenantId, DateTime.UtcNow.AddDays(-1));

		var result = await this._FindAsync(token, marker);
		var row = result.Data.Should().ContainSingle(r => r.Id == tenantId).Subject;

		row.Timezone.Should().Be("Indian/Antananarivo");
		row.WebsiteUrl.Should().Be("https://example.com");
		row.BillingEmail.Should().Be("billing@example.com");
		row.CreatedAt.Should().BeOnOrAfter(before.AddSeconds(-5));
		row.UsersCount.Should().Be(3);
		row.MaxUsers.Should().Be(5);
		row.OwnersCount.Should().Be(2);
		// The full-access role plus « Editors »; the deleted role is out.
		row.RolesCount.Should().Be(2);
		row.ConnectedAccountsCount.Should().Be(2);
		row.PostsThisMonthCount.Should().Be(2);
		row.PendingInvitationsCount.Should().Be(2);

		var empty = result.Data.Should().ContainSingle(r => r.Id == otherId).Subject;
		empty.OwnersCount.Should().Be(0);
		empty.RolesCount.Should().Be(0);
		empty.ConnectedAccountsCount.Should().Be(0);
		empty.PostsThisMonthCount.Should().Be(0);
		empty.PendingInvitationsCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldCountThePanelIgnoringTheStatusFilterButNotTheSearch() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = $"panel-{Guid.NewGuid():N}";
		// Seats: 2/2 full, 4/5 high (80%), 1/10 and 0/10 available.
		var fullId = await this._SeedTenantAsync(
			$"{marker}-a", TenantStatus.Active, maxUsers: 2, locale: "fr");
		var highId = await this._SeedTenantAsync(
			$"{marker}-b", TenantStatus.Active, maxUsers: 5, locale: "fr");
		var availableId = await this._SeedTenantAsync(
			$"{marker}-c", TenantStatus.Pending, maxUsers: 10, locale: "en");
		_ = await this._SeedTenantAsync(
			$"{marker}-d", TenantStatus.Suspended, maxUsers: 10, locale: null);
		// Outside the search: must not be counted.
		_ = await this._SeedTenantAsync(
			$"other-{Guid.NewGuid():N}", TenantStatus.Active, maxUsers: 1, locale: "fr");

		for (var i = 0; i < 2; i++) {
			_ = await this._AddMemberAsync(fullId, isOwner: false);
		}
		for (var i = 0; i < 4; i++) {
			_ = await this._AddMemberAsync(highId, isOwner: false);
		}
		_ = await this._AddMemberAsync(availableId, isOwner: false);

		// The status filter narrows the rows and the stat cards...
		var result = await this._FindAsync(token, marker, status: "active");
		result.Data.Should().HaveCount(2);
		result.Counts.Total.Should().Be(2);
		result.Counts.Pending.Should().Be(0);

		// ...but the panel counts every status, bucket and language of the search.
		var panel = result.PanelCounts;
		panel.Status.Active.Should().Be(2);
		panel.Status.Pending.Should().Be(1);
		panel.Status.Suspended.Should().Be(1);
		panel.Seats.Full.Should().Be(1);
		panel.Seats.High.Should().Be(1);
		panel.Seats.Available.Should().Be(2);
		panel.Locales.Should().Contain(l => l.Locale == "fr" && l.Count == 2);
		panel.Locales.Should().Contain(l => l.Locale == "en" && l.Count == 1);
		panel.Locales.Should().Contain(l => l.Locale == string.Empty && l.Count == 1);
	}

	private async Task<FindResponse> _FindAsync(
		string token,
		string q,
		string? status = null
	) {
		var url = TenantTestHelper.GetFindUrl(q: q, limit: 100, status: status);
		using var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		Assert.NotNull(result);
		return result;
	}

	private async Task<Guid> _SeedTenantAsync(
		string name,
		TenantStatus status,
		int maxUsers,
		string? locale
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = new Tenant {
			Name = name,
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = maxUsers,
			DefaultLocale = locale,
			Timezone = "Indian/Antananarivo",
			WebsiteUrl = "https://example.com",
			BillingEmail = "billing@example.com",
		};
		await db.Tenant.AddAsync(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}

	private async Task<Guid> _AddMemberAsync(Guid tenantId, bool isOwner) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"row-fields-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Row",
			LastName = "Fields",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await db.User.AddAsync(user);
		await db.SaveChangesAsync();
		var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId);
		await db.UserAccount.AddAsync(account);
		await db.SaveChangesAsync();
		if (isOwner) {
			await FullAccessRoleTestHelper.MakeTenantFullAccessAsync(
				db, tenantId, account.GetRequiredId()
			);
		}
		return account.GetRequiredId();
	}

	private async Task<Guid> _GetUserIdAsync(Guid accountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.UserAccount
			.Where(ua => ua.Id == accountId)
			.Select(ua => ua.UserId)
			.FirstAsync();
	}

	private async Task _AddRoleAsync(Guid tenantId, string name, bool isDeleted = false) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var role = Role.CreateTenantRole(tenantId, name, "row fields", isFullAccess: false);
		role.IsDeleted = isDeleted;
		await db.Role.AddAsync(role);
		await db.SaveChangesAsync();
	}

	private async Task _AddSocialAccountAsync(
		Guid tenantId,
		SocialAccountStatus status,
		bool isDeleted = false
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await db.SocialAccount.AddAsync(new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@row.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
			Status = status,
			IsDeleted = isDeleted,
		});
		await db.SaveChangesAsync();
	}

	private async Task _AddPostAsync(
		Guid tenantId,
		Guid userId,
		DateTime createdAt,
		bool isDeleted = false
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var post = new Post {
			TenantId = tenantId,
			Body = "row fields",
			CreatedByUserId = userId,
			IsDeleted = isDeleted,
		};
		await db.Post.AddAsync(post);
		await db.SaveChangesAsync();
		var id = post.GetRequiredId();
		var tracked = await db.Post.Where(p => p.Id == id).FirstAsync();
		tracked.CreatedAt = createdAt;
		await db.SaveChangesAsync();
	}

	private async Task _AddPendingInvitationAsync(Guid tenantId, DateTime expiresAt) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var inviter = await db.User
			.Where(user => user.Email == TestConstants.StaffAdminEmail)
			.FirstAsync();
		await db.Invitation.AddAsync(
			Invitation.CreateTenantInvitationWithRoles(
				$"row-fields-{Guid.NewGuid():N}@example.com",
				tenantId,
				[],
				inviter.GetRequiredId(),
				expiresAt,
				Guid.NewGuid().ToString("N")[..32]
			)
		);
		await db.SaveChangesAsync();
	}

	private record FindResponse {
		public List<Row> Data { get; init; } = [];
		public CountsDto Counts { get; init; } = new();
		public PanelDto PanelCounts { get; init; } = new();
	}

	private record CountsDto {
		public int Total { get; init; }
		public int Pending { get; init; }
	}

	private record PanelDto {
		public StatusDto Status { get; init; } = new();
		public SeatsDto Seats { get; init; } = new();
		public List<LocaleDto> Locales { get; init; } = [];
	}

	private record StatusDto {
		public int Active { get; init; }
		public int Pending { get; init; }
		public int Suspended { get; init; }
	}

	private record SeatsDto {
		public int Full { get; init; }
		public int High { get; init; }
		public int Available { get; init; }
	}

	private record LocaleDto {
		public string Locale { get; init; } = string.Empty;
		public int Count { get; init; }
	}

	private record Row {
		public Guid Id { get; init; }
		public string? Timezone { get; init; }
		public string? WebsiteUrl { get; init; }
		public string? BillingEmail { get; init; }
		public DateTime CreatedAt { get; init; }
		public int UsersCount { get; init; }
		public int MaxUsers { get; init; }
		public int OwnersCount { get; init; }
		public int RolesCount { get; init; }
		public int ConnectedAccountsCount { get; init; }
		public int PostsThisMonthCount { get; init; }
		public int PendingInvitationsCount { get; init; }
	}
}
