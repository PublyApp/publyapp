namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class DeleteSystemNoticeSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public DeleteSystemNoticeSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithApiResponseForExistingNotice() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "To Be Deleted"
			);

		var url = GetDeleteUrl(noticeId);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ApiResponse>();
		result.Should().NotBeNull();
		result!.Key.Should()
			.Be("system-notice-deleted-successfully");
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutAuth() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token
			);

		try {
			var url = GetDeleteUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Delete, url
			);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		} finally {
			try {
				await SystemNoticeTestHelper
					.DeleteNoticeAsync(
						_http, token, noticeId
					);
			} catch {
				// Ignore
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonexistent() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetDeleteUrl(Guid.NewGuid());

		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be("system-notice-not-found");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForAlreadyDeleted() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "Delete Twice"
			);

		// Delete first time
		var url = GetDeleteUrl(noticeId);
		var firstRequest = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var firstResponse =
			await _http.SendAsync(firstRequest);
		firstResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Delete second time
		var secondRequest = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var secondResponse =
			await _http.SendAsync(secondRequest);

		secondResponse.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tempId = Guid.NewGuid();
		var url = GetDeleteUrl(tempId).Replace(
			tempId.ToString(),
			"not-a-guid",
			StringComparison.Ordinal
		);

		var request = new HttpRequestMessage(
			HttpMethod.Delete,
			url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.MalformedId);
	}

	private static string GetDeleteUrl(Guid noticeId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.SystemNotices.ForStaff.Root,
			Routes.SystemNotices.ForStaff.DeleteFn(
				noticeId.ToString()
			)
		);
	}
}
