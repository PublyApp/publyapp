using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Behaviour-pinning specs for the shared cursor-pagination contract of
/// <c>PostService.FindForTenantAsync</c> (#220 refactor safety net):
/// a cursor pointing at a deleted/missing post stays a transparent 400,
/// an unknown <c>sort_id</c> stays a 400, and uppercase <c>sort_id</c>
/// values stay case-insensitive.
/// </summary>
public sealed class FindPostsCursorBehaviorSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindPostsCursorBehaviorSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsUrl + $"?cursor={Guid.NewGuid()}"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenSortIdIsInvalid() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsUrl + "?sort_id=not_real"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be((int)HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldAcceptAnUppercaseSortId() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsUrl + "?limit=5&sort_id=CREATED_AT"
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private static string PostsUrl {
		get {
			return "/posts";
		}
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}
}
