using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Tenants.Handlers.Staff;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// #2460: the hand-written TenantId predicates of the social module are gone, the
// global tenant filter alone isolates tenants. Two tenants, each with data, through
// the real endpoints (plus the staff usage route that counts projects/publications).
public sealed class SocialAccountTenantFilterSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public SocialAccountTenantFilterSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private sealed record Tenant(Guid Id, string Token);

	private async Task<Tenant> _LoginAsync(string tenantName, string email) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var id = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, tenantName
		);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		return new Tenant(id, token);
	}

	private static HttpRequestMessage _Request(HttpMethod method, string url, Tenant tenant) {
		return new HttpRequestMessage(method, url)
			.WithSessionToken(tenant.Token)
			.WithTenantId(tenant.Id);
	}

	private async Task<Guid> _ConnectAsync(Tenant tenant, string identifier) {
		using var request = SocialAccountTenantFilterSpec._Request(HttpMethod.Post, "/social-accounts/connect", tenant);
		request.Content = JsonContent.Create(new {
			identifier,
			appPassword = "app-password-tf-1",
		});
		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var body = await response.Content.ReadFromJsonAsync<JsonElement>();
		var id = body.GetProperty("id").GetString();
		if (id is null) {
			throw new InvalidOperationException("connect response had no id");
		}
		return Guid.Parse(id);
	}

	private async Task<List<Guid>> _ListIdsAsync(Tenant tenant, string url) {
		using var request = SocialAccountTenantFilterSpec._Request(HttpMethod.Get, url, tenant);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var body = await response.Content
			.ReadFromJsonAsync<FindSocialAccountsForTenantResponse>();
		return body.Required().Data.Select(item => item.Id).ToList();
	}

	private async Task<Guid> _SeedProjectAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = new Project { TenantId = tenantId, Name = $"tf-{Guid.NewGuid():N}" };
		db.Project.Add(project);
		await db.SaveChangesAsync();
		return project.GetRequiredId();
	}

	[Fact]
	public async Task ItShouldKeepTwoTenantsAccountsApartThroughTheEndpoints() {
		var a = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var b = await this._LoginAsync(
			SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail
		);
		// Same external identity in both tenants: the duplicate lookup must stay per tenant.
		var identifier = $"tf-{Guid.NewGuid():N}@example.com";
		var accountA = await this._ConnectAsync(a, identifier);
		var accountB = await this._ConnectAsync(b, identifier);
		accountA.Should().NotBe(accountB);

		var listA = await this._ListIdsAsync(a, "/social-accounts/");
		var listB = await this._ListIdsAsync(b, "/social-accounts/");
		listA.Should().Contain(accountA).And.NotContain(accountB);
		listB.Should().Contain(accountB).And.NotContain(accountA);

		// B's id from A: 404 on every id-addressed route.
		var probes = new (string Url, HttpMethod Method, object? Payload)[] {
			($"/social-accounts/{accountB}/reconnect", HttpMethod.Post,
				new { appPassword = "whatever-password" }),
			($"/social-accounts/{accountB}/disconnect", HttpMethod.Post, null),
			($"/social-accounts/{accountB}/projects", HttpMethod.Put,
				new { projectIds = Array.Empty<Guid>() }),
		};
		foreach (var (url, method, payload) in probes) {
			using var request = SocialAccountTenantFilterSpec._Request(method, url, a);
			if (payload is not null) {
				request.Content = JsonContent.Create(payload);
			}
			using var response = await this._Http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.NotFound, $"{method} {url}");
		}

		// A disconnecting its own account leaves B's untouched.
		using (var disconnect = SocialAccountTenantFilterSpec._Request(
			HttpMethod.Post, $"/social-accounts/{accountA}/disconnect", a
		)) {
			using var response = await this._Http.SendAsync(disconnect);
			response.IsSuccessStatusCode.Should().BeTrue();
		}
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var rowB = await db.SocialAccount.AsNoTracking().SingleAsync(x => x.Id == accountB);
		rowB.Status.Should().Be(SocialAccountStatus.Active);
		rowB.IsDeleted.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldRefuseAForeignTenantsProjectWhenSettingProjects() {
		var a = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var b = await this._LoginAsync(
			SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail
		);
		var accountA = await this._ConnectAsync(a, $"tf-{Guid.NewGuid():N}@example.com");
		var projectA = await this._SeedProjectAsync(a.Id);
		var projectB = await this._SeedProjectAsync(b.Id);

		using (var foreign = SocialAccountTenantFilterSpec._Request(
			HttpMethod.Put, $"/social-accounts/{accountA}/projects", a
		)) {
			foreign.Content = JsonContent.Create(new { projectIds = new[] { projectB } });
			using var response = await this._Http.SendAsync(foreign);
			response.IsSuccessStatusCode.Should().BeFalse();
			response.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);
		}

		using var own = SocialAccountTenantFilterSpec._Request(
			HttpMethod.Put, $"/social-accounts/{accountA}/projects", a
		);
		own.Content = JsonContent.Create(new { projectIds = new[] { projectA } });
		using var ownResponse = await this._Http.SendAsync(own);
		ownResponse.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldListNeedsReconnectAccountsOfOneTenantOnly() {
		var a = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var b = await this._LoginAsync(
			SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail
		);
		var accountA = await this._ConnectAsync(a, $"tf-{Guid.NewGuid():N}@example.com");
		var accountB = await this._ConnectAsync(b, $"tf-{Guid.NewGuid():N}@example.com");
		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			await db.SocialAccount
				.Where(x => x.Id == accountA || x.Id == accountB)
				.ExecuteUpdateAsync(s => s.SetProperty(
					x => x.Status, SocialAccountStatus.NeedsReconnect
				));
		}

		foreach (var (tenant, own, other) in new[] { (a, accountA, accountB), (b, accountB, accountA) }) {
			using var request = SocialAccountTenantFilterSpec._Request(
				HttpMethod.Get, "/social-accounts/needs-reconnect-accounts", tenant
			);
			using var response = await this._Http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var body = await response.Content.ReadAsStringAsync();
			body.Should().Contain(own.ToString()).And.NotContain(other.ToString());
		}
	}

	[Fact]
	public async Task ItShouldCountUsageForTheRequestedTenantOnly() {
		var a = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var b = await this._LoginAsync(
			SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail
		);
		var accountA = await this._ConnectAsync(a, $"tf-{Guid.NewGuid():N}@example.com");
		var accountB = await this._ConnectAsync(b, $"tf-{Guid.NewGuid():N}@example.com");
		var beforeA = await this._UsageAsync(a.Id);
		var beforeB = await this._UsageAsync(b.Id);

		await this._SeedProjectAsync(a.Id);
		await this._SeedProjectAsync(a.Id);
		await this._SeedProjectAsync(b.Id);
		await this._SeedScheduledPublicationAsync(a.Id, accountA);
		await this._SeedScheduledPublicationAsync(b.Id, accountB);
		await this._SeedScheduledPublicationAsync(b.Id, accountB);

		var afterA = await this._UsageAsync(a.Id);
		var afterB = await this._UsageAsync(b.Id);
		(afterA.ProjectsCount - beforeA.ProjectsCount).Should().Be(2);
		(afterB.ProjectsCount - beforeB.ProjectsCount).Should().Be(1);
		(afterA.ScheduledPublicationsCount - beforeA.ScheduledPublicationsCount).Should().Be(1);
		(afterB.ScheduledPublicationsCount - beforeB.ScheduledPublicationsCount).Should().Be(2);
	}

	private async Task<GetTenantUsageAsStaffResult> _UsageAsync(Guid tenantId) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.UsageFn(tenantId.ToString())
		);
		using var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		return (await response.Content.ReadFromJsonAsync<GetTenantUsageAsStaffResult>()).Required();
	}

	private async Task _SeedScheduledPublicationAsync(Guid tenantId, Guid accountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"tf-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		var post = new Post {
			TenantId = tenantId,
			Body = "tenant filter spec body",
			CreatedByUserId = user.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();
		// Status keeps its default (Scheduled): only the transition service writes it.
		db.Publication.Add(new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = accountId,
			ScheduledAtUtc = DateTime.UtcNow.AddDays(3),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = $"tf-{Guid.NewGuid():N}",
		});
		await db.SaveChangesAsync();
	}
}
