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

namespace PublyApp.Api.Modules.Projects.Handlers.Tenant;

public sealed class ProjectTenantListSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public ProjectTenantListSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldListOnlyActiveNonDeletedProjectsOfTheCurrentTenantOrderedByName() {
		var (acmeId, token) = await LoginAsAcmeAdminAsync();
		var globalId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http, await _authClient.LoginAsStaffAdminAsync(), SeedConstants.Tenants.GlobalName);
		var zebra = await CreateProjectAsync(acmeId, "Zebra " + Suffix());
		var apple = await CreateProjectAsync(acmeId, "Apple " + Suffix());
		var deleted = await CreateProjectAsync(acmeId, "Deleted " + Suffix(), isDeleted: true);
		var inactive = await CreateProjectAsync(acmeId, "Inactive " + Suffix(), status: ProjectStatus.Inactive);
		var foreign = await CreateProjectAsync(globalId, "Foreign " + Suffix());

		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(token).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<FindProjectsForTenantResponse>();
		var ids = payload!.Items.Select(x => x.Id).ToList();
		ids.Should().Contain([apple, zebra]);
		ids.Should().NotContain([deleted, inactive, foreign]);
		var appleIdx = ids.IndexOf(apple);
		var zebraIdx = ids.IndexOf(zebra);
		appleIdx.Should().BeLessThan(zebraIdx);
		payload.Items.Should().OnlyContain(x => !string.IsNullOrWhiteSpace(x.Name));
	}

	[Fact]
	public async Task ItShouldReturn403WhenTheAccountLacksProjectsViewPermission() {
		var (acmeId, _) = await LoginAsAcmeAdminAsync();
		var memberToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(memberToken).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string Suffix() {
		return Guid.NewGuid().ToString("N")[..8];
	}

	private async Task<Guid> CreateProjectAsync(
		Guid tenantId, string name,
		bool isDeleted = false, ProjectStatus status = ProjectStatus.Active
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = new Project { TenantId = tenantId, Name = name, Status = status, IsDeleted = isDeleted };
		db.Project.Add(project);
		await db.SaveChangesAsync();
		return project.GetRequiredId();
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http, staffToken, SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
		return (tenantId, token);
	}
}
