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
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public SocialAccountRefusalSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldStoreNothingWhenBlueskyRefusesOrIsUnreachable() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var fake = scope.ServiceProvider.GetRequiredService<FakeBlueskyClient>();
		fake.NextResult =
			new BlueskySessionResult.AccountFailure("Credentials were refused.");

		using var refused = await ConnectAsync(tenantId, token);
		refused.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await refused.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().NotBeEmpty();

		(await db.SocialAccount.AsNoTracking()
			.CountAsync(a => a.TenantId == tenantId)).Should().Be(0);

		fake.NextResult = new BlueskySessionResult.Transient();
		using var unavailable = await ConnectAsync(tenantId, token);
		unavailable.StatusCode.Should()
			.Be(HttpStatusCode.ServiceUnavailable);

		(await db.SocialAccount.AsNoTracking()
			.CountAsync(a => a.TenantId == tenantId)).Should().Be(0);

		// Restore default success: exactly one row appears.
		fake.NextResult = null;
		using var success = await ConnectAsync(tenantId, token);
		success.StatusCode.Should().Be(HttpStatusCode.Created);
		(await db.SocialAccount.AsNoTracking()
			.CountAsync(a => a.TenantId == tenantId)).Should().Be(1);
	}

	private async Task<HttpResponseMessage> ConnectAsync(
		Guid tenantId, string token
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier = $"refusal-{Guid.NewGuid():N}@example.com",
			appPassword = "app-password-111",
		});
		return await _http.SendAsync(request);
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
