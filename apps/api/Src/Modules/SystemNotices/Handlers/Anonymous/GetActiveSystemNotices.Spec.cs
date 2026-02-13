namespace MainApi.Src.Modules.SystemNotices.Handlers.Anonymous;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Xunit;

public sealed class GetActiveSystemNoticesSpec
	: IClassFixture<ApiFixture> {
	private static readonly string ActiveUrl =
		Routes.SystemNotices.Anonymous.GetActive;

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetActiveSystemNoticesSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnActiveNotices() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Create an active notice (starts in past)
		var startsAt = DateTime.UtcNow
			.AddMinutes(-10).ToString("o");
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				severity: "warning",
				title: "Active Test Notice",
				message: "Currently active",
				startsAt: startsAt
			);

		try {
			// Anonymous request (no auth needed)
			using var response =
				await _http.GetAsync(ActiveUrl);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					List<ActiveNoticeResponse>
				>();
			result.Should().NotBeNull();
			result.Should().Contain(
				n => n.Id == noticeId
			);

			var notice = result!
				.First(n => n.Id == noticeId);
			notice.Title.Should()
				.Be("Active Test Notice");
			notice.Severity.Should().Be("warning");
			notice.Message.Should()
				.Be("Currently active");
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
	ItShouldNotReturnExpiredNotices() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Create an expired notice
		var startsAt = DateTime.UtcNow
			.AddDays(-10).ToString("o");
		var expiresAt = DateTime.UtcNow
			.AddDays(-1).ToString("o");
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "Expired Notice",
				startsAt: startsAt,
				expiresAt: expiresAt
			);

		try {
			using var response =
				await _http.GetAsync(ActiveUrl);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					List<ActiveNoticeResponse>
				>();
			result.Should().NotBeNull();
			result.Should().NotContain(
				n => n.Id == noticeId
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

	[Fact]
	public async Task
	ItShouldNotReturnFutureNotices() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Create a future notice
		var startsAt = DateTime.UtcNow
			.AddDays(10).ToString("o");
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "Future Notice",
				startsAt: startsAt
			);

		try {
			using var response =
				await _http.GetAsync(ActiveUrl);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					List<ActiveNoticeResponse>
				>();
			result.Should().NotBeNull();
			result.Should().NotContain(
				n => n.Id == noticeId
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

	private record ActiveNoticeResponse {
		public Guid Id { get; init; }
		public string Severity { get; init; }
			= string.Empty;
		public string Title { get; init; }
			= string.Empty;
		public string Message { get; init; }
			= string.Empty;
		public DateTime? ExpiresAt { get; init; }
	}
}
