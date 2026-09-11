
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

public sealed class CreateSystemNoticeSpec
	: IClassFixture<ApiFixture> {
	private static readonly string _CreateUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.SystemNotices.ForStaff.Root,
		Routes.SystemNotices.ForStaff.Create
	);

	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateSystemNoticeSpec(
		ApiFixture fixture
	) {
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task
	ItShouldReturnCreatedWithValidData() {
		var token =
			await _AuthClient.LoginAsStaffAdminAsync();
		var startsAt = DateTime.UtcNow
			.AddHours(1).ToString("o");
		var expiresAt = DateTime.UtcNow
			.AddDays(7).ToString("o");

		var request = new HttpRequestMessage(
			HttpMethod.Post, _CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "warning",
			title = "Maintenance Window",
			message = "Scheduled maintenance tonight",
			startsAt,
			expiresAt
		});

		using var response =
			await _Http.SendAsync(request);
		Guid? createdId = null;

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.Created);

			var result = await response.Content
				.ReadFromJsonAsync<NoticeCreatedResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			createdId = result.Id;
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
							_Http, token, createdId.Value
						);
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnCreatedWithoutExpiresAt() {
		var token =
			await _AuthClient.LoginAsStaffAdminAsync();
		var startsAt = DateTime.UtcNow
			.AddHours(1).ToString("o");

		var request = new HttpRequestMessage(
			HttpMethod.Post, _CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "info",
			title = "Info Notice",
			message = "No expiry notice",
			startsAt
		});

		using var response =
			await _Http.SendAsync(request);
		Guid? createdId = null;

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.Created);

			var result = await response.Content
				.ReadFromJsonAsync<NoticeCreatedResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			createdId = result.Id;
			result.ExpiresAt.Should().BeNull();
		} finally {
			if (createdId.HasValue) {
				try {
					await SystemNoticeTestHelper
						.DeleteNoticeAsync(
							_Http, token, createdId.Value
						);
				} catch {
					// Ignore
				}
			}
		}
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutAuth() {
		var request = new HttpRequestMessage(
			HttpMethod.Post, _CreateUrl
		);
		request.Content = JsonContent.Create(new {
			severity = "info",
			title = "Test",
			message = "Test message",
			startsAt = DateTime.UtcNow.ToString("o")
		});

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForInvalidSeverity() {
		var token =
			await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Post, _CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "extreme",
			title = "Test",
			message = "Test message",
			startsAt = DateTime.UtcNow.ToString("o")
		});

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForEmptyTitle() {
		var token =
			await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Post, _CreateUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			severity = "info",
			title = "",
			message = "Test message",
			startsAt = DateTime.UtcNow.ToString("o")
		});

		using var response =
			await _Http.SendAsync(request);

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
