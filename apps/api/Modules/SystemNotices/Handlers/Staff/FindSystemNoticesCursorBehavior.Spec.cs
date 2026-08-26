using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

/// <summary>
/// Behaviour-pinning specs for the shared cursor-pagination contract of
/// <c>SystemNoticeService.FindAsync</c> (#220 refactor safety net):
/// a cursor pointing at a deleted/missing notice stays a transparent 400,
/// and uppercase <c>sort_id</c> values stay case-insensitive.
/// </summary>
public sealed class FindSystemNoticesCursorBehaviorSpec
	: IClassFixture<ApiFixture> {
	private static readonly string FindUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.SystemNotices.ForStaff.Root,
		Routes.SystemNotices.ForStaff.Find
	);

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindSystemNoticesCursorBehaviorSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordIsMissing() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var url = FindUrl + $"?cursor={Guid.NewGuid()}";
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

		var url = FindUrl + "?limit=5&sort_id=CREATED_AT";
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}
}
