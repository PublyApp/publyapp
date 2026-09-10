using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// Proof 5 (plan Task 5): refusal → nothing stored, over HTTP. AccountFailure maps
// to 422 with zero rows for the tenant; Transient maps to 503 with zero rows; a
// following success inserts exactly one row.
public sealed class SocialAccountRefusalSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public SocialAccountRefusalSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task ItShouldStoreNothingWhenBlueskyRefusesOrIsUnreachable() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var fake = scope.ServiceProvider.GetRequiredService<FakeBlueskyClient>();
		fake.NextResult =
			new BlueskySessionResult.AccountFailure("Credentials were refused.");

		using var refused = await _ConnectAsync(tenantId, token);
		refused.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await refused.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().NotBeEmpty();

		(await db.SocialAccount.AsNoTracking()
			.CountAsync(a => a.TenantId == tenantId)).Should().Be(0);

		fake.NextResult = new BlueskySessionResult.Transient();
		using var unavailable = await _ConnectAsync(tenantId, token);
		unavailable.StatusCode.Should()
			.Be(HttpStatusCode.ServiceUnavailable);

		(await db.SocialAccount.AsNoTracking()
			.CountAsync(a => a.TenantId == tenantId)).Should().Be(0);

		// Restore default success: exactly one row appears.
		fake.NextResult = null;
		using var success = await _ConnectAsync(tenantId, token);
		success.StatusCode.Should().Be(HttpStatusCode.Created);
		(await db.SocialAccount.AsNoTracking()
			.CountAsync(a => a.TenantId == tenantId)).Should().Be(1);
	}

	private async Task<HttpResponseMessage> _ConnectAsync(
		Guid tenantId, string token
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier = $"refusal-{Guid.NewGuid():N}@example.com",
			appPassword = "app-password-111",
		});
		return await _Http.SendAsync(request);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}
}
