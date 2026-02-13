namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Testing;

using Xunit;

public sealed class GetSystemNoticeByIdIntegrationTests
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetSystemNoticeByIdIntegrationTests(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	GetById_ExistingNotice_ReturnsOk() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				severity: "critical",
				title: "Get Test Notice",
				message: "Detailed message content"
			);

		try {
			var url = SystemNoticeTestHelper
				.GetNoticeUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					NoticeDetailResponse
				>();
			result.Should().NotBeNull();
			result!.Id.Should().Be(noticeId);
			result.Title.Should()
				.Be("Get Test Notice");
			result.Severity.Should().Be("critical");
			result.Message.Should()
				.Be("Detailed message content");
			result.CreatedByStaffId.Should()
				.NotBeEmpty();
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
	GetById_WithoutAuth_ReturnsUnauthorized() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token
			);

		try {
			var url = SystemNoticeTestHelper
				.GetNoticeUrl(noticeId);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
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
	GetById_Nonexistent_ReturnsNotFound() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = SystemNoticeTestHelper
			.GetNoticeUrl(Guid.NewGuid());

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
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
		public bool IsActive { get; init; }
		public Guid CreatedByStaffId { get; init; }
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
