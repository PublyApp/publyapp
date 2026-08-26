using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

// See TenantAuthFilterSpec for why this joins the shared
// "AcmeTenantMutation" DisableParallelization collection.
[Collection("AcmeTenantMutation")]
public sealed class GetTenantUsageAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantUsageAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.UsageFn(tenantId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUsageCountsForASeededTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await SeedTenantWithUsageRowsAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get, GetUrl(tenantId.ToString())
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantUsageAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"GET tenant usage response was empty."
			);
		}

		result.TenantId.Should().Be(tenantId);
		result.UsersActive.Should().Be(2);
		result.UsersTotal.Should().Be(3);
		result.ProjectsCount.Should().Be(1);
		result.ScheduledPublicationsCount.Should().Be(0);
		result.LastActivityAt.Should().NotBeNull();
		// Freshness contract: the response carries when the numbers were
		// computed so a stale payload can never pose as fresh data.
		result.ComputedAt.Should().BeCloseTo(
			DateTime.UtcNow, TimeSpan.FromSeconds(30)
		);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	// Isolation trap from #168: a staff member WITHOUT the tenant-read
	// permission must see NOTHING of any tenant. This calls the real API —
	// not the service — because the guarantee lives at the route boundary.
	[Fact]
	public async Task ItShouldReturnForbiddenAndNoDataForStaffWithoutReadPermission() {
		var staffToken =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);
		var tenantId =
			await SeedTenantWithUsageRowsAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get, GetUrl(tenantId.ToString())
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		// The rejection body must carry no usage numbers at all.
		var body = await response.Content.ReadAsStringAsync();
		body.Should().NotContain("\"usersTotal\"");
		body.Should().NotContain("\"projectsCount\"");
		body.Should().NotContain("\"scheduledPublicationsCount\"");
	}

	private async Task<Guid> SeedTenantWithUsageRowsAsync() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage-endpoint {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 20,
			LastActivityAt = DateTime.UtcNow.AddMinutes(-30),
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		async Task AddUserAsync(bool suspendAccount) {
			var user = new User {
				Email = $"usage-endpoint-{Guid.NewGuid():N}@example.com",
				Password = PasswordUtils.HashPassword(
					TestConstants.SeedPassword
				),
				FirstName = "Usage",
				LastName = "Endpoint",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			var account = UserAccount.CreateTenantAccount(
				user.GetRequiredId(), tenantId
			);
			if (suspendAccount) {
				account.Status = AccountStatus.Suspended;
			}
			await dbContext.UserAccount.AddAsync(account);
			await dbContext.SaveChangesAsync();
		}

		await AddUserAsync(suspendAccount: false);
		await AddUserAsync(suspendAccount: false);
		await AddUserAsync(suspendAccount: true);

		dbContext.Project.Add(new Project {
			TenantId = tenantId,
			Name = $"usage-endpoint-project-{Guid.NewGuid():N}",
		});
		await dbContext.SaveChangesAsync();

		return tenantId;
	}
}
