namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class CreateSystemNoticeIntegrationTests
	: IClassFixture<ApiFixture> {
	private static readonly string CreateUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.SystemNotices.ForStaff.Root,
		Routes.SystemNotices.ForStaff.Create
	);

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateSystemNoticeIntegrationTests(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	Create_WithValidData_ReturnsOk() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var startsAt = DateTime.UtcNow
			.AddHours(1).ToString("o");
		var expiresAt = DateTime.UtcNow
			.AddDays(7).ToString("o");

		var request = new HttpRequestMessage(
			HttpMethod.Post, CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "warning",
			title = "Maintenance Window",
			message = "Scheduled maintenance tonight",
			startsAt,
			expiresAt
		});

		using var response =
			await _http.SendAsync(request);
		Guid? createdId = null;

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<NoticeCreatedResponse>();
			result.Should().NotBeNull();
			createdId = result!.Id;
			result.Id.Should().NotBeEmpty();
			result.Title.Should()
				.Be("Maintenance Window");
			result.Severity.Should().Be("warning");
			result.ExpiresAt.Should().NotBeNull();
		} finally {
			if (createdId.HasValue) {
				try {
					await SystemNoticeTestHelper
						.DeleteNoticeAsync(
							_http, token, createdId.Value
						);
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	}

	[Fact]
	public async Task
	Create_WithoutExpiresAt_ReturnsOk() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var startsAt = DateTime.UtcNow
			.AddHours(1).ToString("o");

		var request = new HttpRequestMessage(
			HttpMethod.Post, CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "info",
			title = "Info Notice",
			message = "No expiry notice",
			startsAt
		});

		using var response =
			await _http.SendAsync(request);
		Guid? createdId = null;

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<NoticeCreatedResponse>();
			result.Should().NotBeNull();
			createdId = result!.Id;
			result.ExpiresAt.Should().BeNull();
		} finally {
			if (createdId.HasValue) {
				try {
					await SystemNoticeTestHelper
						.DeleteNoticeAsync(
							_http, token, createdId.Value
						);
				} catch {
					// Ignore
				}
			}
		}
	}

	[Fact]
	public async Task
	Create_WithoutAuth_ReturnsUnauthorized() {
		var request = new HttpRequestMessage(
			HttpMethod.Post, CreateUrl
		);
		request.Content = JsonContent.Create(new {
			severity = "info",
			title = "Test",
			message = "Test message",
			startsAt = DateTime.UtcNow.ToString("o")
		});

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	Create_WithInvalidSeverity_ReturnsValidationError() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Post, CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "extreme",
			title = "Test",
			message = "Test message",
			startsAt = DateTime.UtcNow.ToString("o")
		});

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	Create_WithEmptyTitle_ReturnsValidationError() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Post, CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "info",
			title = "",
			message = "Test message",
			startsAt = DateTime.UtcNow.ToString("o")
		});

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	private record NoticeCreatedResponse {
		public Guid Id { get; init; }
		public string Title { get; init; } = string.Empty;
		public string Severity { get; init; }
			= string.Empty;
		public DateTime StartsAt { get; init; }
		public DateTime? ExpiresAt { get; init; }
	}
}
