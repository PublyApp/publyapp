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
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task ItShouldListOnlyActiveNonDeletedProjectsOfTheCurrentTenantOrderedByName() {
		var (acmeId, token) = await _LoginAsAcmeAdminAsync();
		var globalId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http, await _AuthClient.LoginAsStaffAdminAsync(), SeedConstants.Tenants.GlobalName);
		var zebra = await _CreateProjectAsync(acmeId, "Zebra " + _Suffix());
		var apple = await _CreateProjectAsync(acmeId, "Apple " + _Suffix());
		var deleted = await _CreateProjectAsync(acmeId, "Deleted " + _Suffix(), isDeleted: true);
		var inactive = await _CreateProjectAsync(acmeId, "Inactive " + _Suffix(), status: ProjectStatus.Inactive);
		var foreign = await _CreateProjectAsync(globalId, "Foreign " + _Suffix());

		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(token).WithTenantId(acmeId);
		using var response = await _Http.SendAsync(request);

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
		var (acmeId, _) = await _LoginAsAcmeAdminAsync();
		var memberToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(memberToken).WithTenantId(acmeId);
		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string _Suffix() {
		return Guid.NewGuid().ToString("N")[..8];
	}

	private async Task<Guid> _CreateProjectAsync(
		Guid tenantId, string name,
		bool isDeleted = false, ProjectStatus status = ProjectStatus.Active
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = new Project { TenantId = tenantId, Name = name, Status = status, IsDeleted = isDeleted };
		db.Project.Add(project);
		await db.SaveChangesAsync();
		return project.GetRequiredId();
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http, staffToken, SeedConstants.Tenants.AcmeName);
		var token = await _AuthClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
		return (tenantId, token);
	}
}
