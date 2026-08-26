using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

/// <summary>
/// Behaviour-pinning specs for the shared cursor-pagination contract of
/// <c>AuditLogQueryService.FindAsync</c> (#220 refactor safety net).
/// The service keeps its sort-handler table local; these tests anchor the
/// wire behaviour that must not move while the table is refactored:
/// a cursor pointing at a deleted/missing row is a transparent 400, and
/// uppercase <c>sort_id</c> values stay case-insensitive.
/// </summary>
public sealed class FindAuditLogsCursorBehaviorSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindAuditLogsCursorBehaviorSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			cursor: Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

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
		var token = await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetFindUrl(
			limit: 5,
			sortId: "CREATED_AT"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}
}
