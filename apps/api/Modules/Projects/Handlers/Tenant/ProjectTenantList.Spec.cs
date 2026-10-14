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
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public ProjectTenantListSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldListOnlyActiveNonDeletedProjectsOfTheCurrentTenantOrderedByName() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var globalId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, await this._AuthClient.LoginAsStaffAdminAsync(), SeedConstants.Tenants.GlobalName);
		var zebra = await this._CreateProjectAsync(acmeId, "Zebra " + ProjectTenantListSpec._Suffix());
		var apple = await this._CreateProjectAsync(acmeId, "Apple " + ProjectTenantListSpec._Suffix());
		var deleted = await this._CreateProjectAsync(acmeId, "Deleted " + ProjectTenantListSpec._Suffix(), isDeleted: true);
		var inactive = await this._CreateProjectAsync(acmeId, "Inactive " + ProjectTenantListSpec._Suffix(), status: ProjectStatus.Inactive);
		var foreign = await this._CreateProjectAsync(globalId, "Foreign " + ProjectTenantListSpec._Suffix());

		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(token).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<FindProjectsForTenantResponse>();
		var payloadValue = payload.Required();
		var ids = payloadValue.Items.Select(x => x.Id).ToList();
		ids.Should().Contain([apple, zebra]);
		ids.Should().NotContain([deleted, inactive, foreign]);
		var appleIdx = ids.IndexOf(apple);
		var zebraIdx = ids.IndexOf(zebra);
		appleIdx.Should().BeLessThan(zebraIdx);
		payloadValue.Items.Should().OnlyContain(x => !string.IsNullOrWhiteSpace(x.Name));
	}

	[Fact]
	public async Task ItShouldReturn403WhenTheAccountLacksProjectsViewPermission() {
		var (acmeId, _) = await this._LoginAsAcmeAdminAsync();
		var memberToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(memberToken).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string _Suffix() {
		return Guid.NewGuid().ToString("N")[..8];
	}

	private async Task<Guid> _CreateProjectAsync(
		Guid tenantId, string name,
		bool isDeleted = false, ProjectStatus status = ProjectStatus.Active
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = new Project { TenantId = tenantId, Name = name, Status = status, IsDeleted = isDeleted };
		db.Project.Add(project);
		await db.SaveChangesAsync();
		return project.GetRequiredId();
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.AcmeName);
		var token = await this._AuthClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
		return (tenantId, token);
	}
}
