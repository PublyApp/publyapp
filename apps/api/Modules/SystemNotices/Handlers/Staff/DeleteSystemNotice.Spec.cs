
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;

using Xunit;

namespace PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

public sealed class DeleteSystemNoticeSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public DeleteSystemNoticeSpec(
		ApiFixture fixture
	) {
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithApiResponseForExistingNotice() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				this._Http, token,
				title: "To Be Deleted"
			);

		var url = DeleteSystemNoticeSpec._GetDeleteUrl(noticeId);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ApiResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Key.Should()
					.Be("system-notice-deleted-successfully");
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutAuth() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				this._Http, token
			);

		try {
			var url = DeleteSystemNoticeSpec._GetDeleteUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Delete, url
			);

			using var response =
				await this._Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		} finally {
			try {
				await SystemNoticeTestHelper
					.DeleteNoticeAsync(
						this._Http, token, noticeId
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
			await this._AuthClient.LoginAsStaffAdminAsync();
		var url = DeleteSystemNoticeSpec._GetDeleteUrl(Guid.NewGuid());

		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be("system-notice-not-found");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForAlreadyDeleted() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				this._Http, token,
				title: "Delete Twice"
			);

		// Delete first time
		var url = DeleteSystemNoticeSpec._GetDeleteUrl(noticeId);
		var firstRequest = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var firstResponse =
			await this._Http.SendAsync(firstRequest);
		firstResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Delete second time
		var secondRequest = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(token);

		using var secondResponse =
			await this._Http.SendAsync(secondRequest);

		secondResponse.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var tempId = Guid.NewGuid();
		var url = DeleteSystemNoticeSpec._GetDeleteUrl(tempId).Replace(
			tempId.ToString(),
			"not-a-guid",
			StringComparison.Ordinal
		);

		var request = new HttpRequestMessage(
			HttpMethod.Delete,
			url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.MalformedId);
	}

	private static string _GetDeleteUrl(Guid noticeId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.SystemNotices.ForStaff.Root,
			Routes.SystemNotices.ForStaff.DeleteFn(
				noticeId.ToString()
			)
		);
	}
}
