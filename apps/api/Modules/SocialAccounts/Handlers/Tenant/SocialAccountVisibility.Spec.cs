using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Projects.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// Proof 3 (plan Task 5): visibility over HTTP. An unattached account is listed
// under every project filter; an account attached to X appears under X's filter,
// is absent under Y's, and both appear unfiltered.
public sealed class SocialAccountVisibilitySpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public SocialAccountVisibilitySpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldApplyTheProjectVisibilityRuleOverHttp() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		// Two projects.
		var projectX = Guid.NewGuid();
		var projectY = Guid.NewGuid();
		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			db.Project.AddRange(
				new Project { TenantId = tenantId, Name = "Vis-X", },
				new Project { TenantId = tenantId, Name = "Vis-Y", }
			);
			await db.SaveChangesAsync();
			var projects = await db.Project.AsNoTracking()
				.Where(p => p.TenantId == tenantId).ToListAsync();
			projectX = projects[0].GetRequiredId();
			projectY = projects[1].GetRequiredId();
		}

		// Unattached account + attached-to-X account.
		var roamingId = await ConnectAsync(tenantId, token, "roaming");
		var attachedId = await ConnectAsync(tenantId, token, "attached");
		using (var put = new HttpRequestMessage(
			HttpMethod.Put, $"/social-accounts/{attachedId}/projects"
		).WithSessionToken(token).WithTenantId(tenantId)) {
			put.Content = JsonContent.Create(new {
				projectIds = new[] { projectX },
			});
			using var putResponse = await _http.SendAsync(put);
			putResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		(var underX, var underY, var unfiltered) =
			await ListIdsAsync(tenantId, token, projectX, projectY);

		underX.Should().Contain(attachedId).And.Contain(roamingId);
		underY.Should().Contain(roamingId).And.NotContain(attachedId);
		unfiltered.Should().Contain(attachedId).And.Contain(roamingId);
	}

	private async Task<Guid> ConnectAsync(
		Guid tenantId, string token, string prefix
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier = $"{prefix}-{Guid.NewGuid():N}@example.com",
			appPassword = "app-password-789",
		});
		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var created = await response.Content.ReadFromJsonAsync<SocialAccountCreated>();
		return created!.Id;
	}

	private async Task<(List<Guid> UnderX, List<Guid> UnderY, List<Guid> Unfiltered)>
		ListIdsAsync(Guid tenantId, string token, Guid projectX, Guid projectY) {
		async Task<List<Guid>> Fetch(string? projectId) {
			var url = "/social-accounts/";
			if (projectId is not null) {
				url += $"?project_id={projectId}";
			}
			using var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			using var response = await _http.SendAsync(request);
			response.EnsureSuccessStatusCode();
			var payload = await response.Content
				.ReadFromJsonAsync<FindSocialAccountsForTenantResponse>();
			return payload!.Data.Select(i => i.Id).ToList();
		}

		var underX = await Fetch(projectX.ToString());
		var underY = await Fetch(projectY.ToString());
		var unfiltered = await Fetch(null);
		return (underX, underY, unfiltered);
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}
}
