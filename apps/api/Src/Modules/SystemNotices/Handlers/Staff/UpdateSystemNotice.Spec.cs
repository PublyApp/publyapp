namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class UpdateSystemNoticeSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateSystemNoticeSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithValidData() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "Original Title"
			);

		try {
			var url = GetUpdateUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);
			request.Content = JsonContent.Create(new {
				title = "Updated Title",
				severity = "critical"
			});

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					NoticeUpdatedResponse
				>();
			result.Should().NotBeNull();
			result!.Id.Should().Be(noticeId);
			result.Title.Should()
				.Be("Updated Title");
			result.Severity.Should().Be("critical");
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
	ItShouldReturnUnauthorizedWithoutAuth() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token
			);

		try {
			var url = GetUpdateUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Patch, url
			);
			request.Content = JsonContent.Create(new {
				title = "Should Fail"
			});

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
		var url = GetUpdateUrl(Guid.NewGuid());

		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			title = "Does Not Exist"
		});

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
	ItShouldSetExpiresAtToNullWhenCleared() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var expiresAt = DateTime.UtcNow
			.AddDays(30).ToString("o");
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "Has Expiry",
				expiresAt: expiresAt
			);

		try {
			// Verify it has ExpiresAt set
			var getUrl = SystemNoticeTestHelper
				.GetNoticeUrl(noticeId);
			var getRequest = new HttpRequestMessage(
				HttpMethod.Get, getUrl
			).WithSessionToken(token);

			using var getResponse =
				await _http.SendAsync(getRequest);
			var detail = await getResponse.Content
				.ReadFromJsonAsync<
					NoticeDetailResponse
				>();
			detail!.ExpiresAt.Should().NotBeNull();

			// Clear ExpiresAt by sending explicit null
			var url = GetUpdateUrl(noticeId);
			var patchJson = "{\"expiresAt\": null}";
			var request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);
			request.Content = new StringContent(
				patchJson,
				System.Text.Encoding.UTF8,
				"application/json"
			);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					NoticeUpdatedResponse
				>();
			result.Should().NotBeNull();
			result!.ExpiresAt.Should().BeNull();
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
	ItShouldKeepOtherFieldsOnPartialUpdate() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				severity: "warning",
				title: "Keep Me",
				message: "Keep this message"
			);

		try {
			// Update only severity
			var url = GetUpdateUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);
			request.Content = JsonContent.Create(new {
				severity = "critical"
			});

			using var patchResponse =
				await _http.SendAsync(request);
			patchResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			// Verify title and message unchanged
			var getUrl = SystemNoticeTestHelper
				.GetNoticeUrl(noticeId);
			var getRequest = new HttpRequestMessage(
				HttpMethod.Get, getUrl
			).WithSessionToken(token);

			using var getResponse =
				await _http.SendAsync(getRequest);
			var detail = await getResponse.Content
				.ReadFromJsonAsync<
					NoticeDetailResponse
				>();
			detail.Should().NotBeNull();
			detail!.Severity.Should().Be("critical");
			detail.Title.Should().Be("Keep Me");
			detail.Message.Should()
				.Be("Keep this message");
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
	ItShouldPreserveExpiresAtWhenOmitted() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var expiresAt = DateTime.UtcNow
			.AddDays(30).ToString("o");
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "Has Expiry",
				expiresAt: expiresAt
			);

		try {
			// Verify it has ExpiresAt set
			var getUrl = SystemNoticeTestHelper
				.GetNoticeUrl(noticeId);
			var getRequest = new HttpRequestMessage(
				HttpMethod.Get, getUrl
			).WithSessionToken(token);

			using var getResponse =
				await _http.SendAsync(getRequest);
			var detail = await getResponse.Content
				.ReadFromJsonAsync<
					NoticeDetailResponse
				>();
			detail!.ExpiresAt.Should().NotBeNull();
			var originalExpiresAt = detail.ExpiresAt;

			// PATCH without expiresAt — should preserve
			var url = GetUpdateUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);
			request.Content = JsonContent.Create(new {
				title = "Updated Title Only"
			});

			using var patchResponse =
				await _http.SendAsync(request);
			patchResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			// Verify ExpiresAt is preserved
			var getRequest2 = new HttpRequestMessage(
				HttpMethod.Get, getUrl
			).WithSessionToken(token);
			using var getResponse2 =
				await _http.SendAsync(getRequest2);
			var detail2 = await getResponse2.Content
				.ReadFromJsonAsync<
					NoticeDetailResponse
				>();
			detail2!.ExpiresAt.Should()
				.Be(originalExpiresAt);
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
	ItShouldUpdateExpiresAtWhenSet() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "No Expiry"
			);

		try {
			// Verify it has no ExpiresAt
			var getUrl = SystemNoticeTestHelper
				.GetNoticeUrl(noticeId);
			var getRequest = new HttpRequestMessage(
				HttpMethod.Get, getUrl
			).WithSessionToken(token);

			using var getResponse =
				await _http.SendAsync(getRequest);
			var detail = await getResponse.Content
				.ReadFromJsonAsync<
					NoticeDetailResponse
				>();
			detail!.ExpiresAt.Should().BeNull();

			// PATCH with expiresAt string
			var newExpiresAt = DateTime.UtcNow
				.AddDays(14);
			var url = GetUpdateUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);
			request.Content = JsonContent.Create(new {
				expiresAt = newExpiresAt.ToString("o")
			});

			using var patchResponse =
				await _http.SendAsync(request);
			patchResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await patchResponse.Content
				.ReadFromJsonAsync<
					NoticeUpdatedResponse
				>();
			result.Should().NotBeNull();
			result!.ExpiresAt.Should().NotBeNull();
			result.ExpiresAt!.Value.Should()
				.BeCloseTo(
					newExpiresAt,
					TimeSpan.FromSeconds(1)
				);
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

	private static string GetUpdateUrl(Guid noticeId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.SystemNotices.ForStaff.Root,
			Routes.SystemNotices.ForStaff.UpdateFn(
				noticeId.ToString()
			)
		);
	}

	private record NoticeUpdatedResponse {
		public Guid Id { get; init; }
		public string Title { get; init; }
			= string.Empty;
		public string Severity { get; init; }
			= string.Empty;
		public DateTime StartsAt { get; init; }
		public DateTime? ExpiresAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}

	private record NoticeDetailResponse {
		public Guid Id { get; init; }
		public string Severity { get; init; }
			= string.Empty;
		public string Title { get; init; }
			= string.Empty;
		public string Message { get; init; }
			= string.Empty;
		public DateTime StartsAt { get; init; }
		public DateTime? ExpiresAt { get; init; }
	}
}
