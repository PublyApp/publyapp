namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class FindSystemNoticesIntegrationTests
	: IClassFixture<ApiFixture> {
	private static readonly string FindUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.SystemNotices.ForStaff.Root,
		Routes.SystemNotices.ForStaff.Find
	);

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindSystemNoticesIntegrationTests(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	Find_WithDefaults_ReturnsOk() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var noticeId =
			await SystemNoticeTestHelper.CreateNoticeAsync(
				_http, token,
				title: "Find Default Test"
			);

		try {
			var request = new HttpRequestMessage(
				HttpMethod.Get, FindUrl
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			result.Should().NotBeNull();
			result!.Data.Should().NotBeNull();
			result.Data.Should().Contain(
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
	Find_WithoutAuth_ReturnsUnauthorized() {
		var request = new HttpRequestMessage(
			HttpMethod.Get, FindUrl
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	Find_WithInvalidSortId_ReturnsBadRequest() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = FindUrl + "?sortId=invalid_field";
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	Find_WithPagination_ReturnsNextCursor() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var ids = new List<Guid>();

		try {
			// Create 3 notices
			for (var i = 0; i < 3; i++) {
				var id =
					await SystemNoticeTestHelper
						.CreateNoticeAsync(
							_http, token,
							title: $"Paginate Test {i}"
						);
				ids.Add(id);
			}

			// Fetch with limit=2 to force pagination
			var url = FindUrl + "?limit=2";
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			result.Should().NotBeNull();
			result!.Data.Count.Should().Be(2);
			result.NextCursor.Should()
				.NotBeNullOrEmpty();
		} finally {
			foreach (var id in ids) {
				try {
					await SystemNoticeTestHelper
						.DeleteNoticeAsync(
							_http, token, id
						);
				} catch {
					// Ignore
				}
			}
		}
	}

	[Fact]
	public async Task
	Find_SortedByStartsAtAsc_ReturnsInOrder() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var ids = new List<Guid>();

		try {
			var earlyStart = DateTime.UtcNow
				.AddDays(-10).ToString("o");
			var lateStart = DateTime.UtcNow
				.AddDays(10).ToString("o");

			var earlyId =
				await SystemNoticeTestHelper
					.CreateNoticeAsync(
						_http, token,
						title: "Early Notice",
						startsAt: earlyStart
					);
			ids.Add(earlyId);

			var lateId =
				await SystemNoticeTestHelper
					.CreateNoticeAsync(
						_http, token,
						title: "Late Notice",
						startsAt: lateStart
					);
			ids.Add(lateId);

			var url = FindUrl
				+ "?sortId=starts_at&sortOrder=asc";
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			result.Should().NotBeNull();

			var earlyIdx = result!.Data
				.FindIndex(n => n.Id == earlyId);
			var lateIdx = result.Data
				.FindIndex(n => n.Id == lateId);

			earlyIdx.Should().BeGreaterOrEqualTo(0);
			lateIdx.Should().BeGreaterOrEqualTo(0);
			earlyIdx.Should().BeLessThan(lateIdx);
		} finally {
			foreach (var id in ids) {
				try {
					await SystemNoticeTestHelper
						.DeleteNoticeAsync(
							_http, token, id
						);
				} catch {
					// Ignore
				}
			}
		}
	}

	private record FindResponse {
		public List<NoticeListItem> Data { get; init; }
			= [];
		public string? NextCursor { get; init; }
	}

	private record NoticeListItem {
		public Guid Id { get; init; }
		public string Severity { get; init; }
			= string.Empty;
		public string Title { get; init; }
			= string.Empty;
		public DateTime StartsAt { get; init; }
		public DateTime? ExpiresAt { get; init; }
		public bool IsActive { get; init; }
		public DateTime CreatedAt { get; init; }
	}
}
