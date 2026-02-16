namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class GetAuditLogByIdSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;
	private readonly ApiFixture _fixture;

	public GetAuditLogByIdSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithValidId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		var targetId = Guid.NewGuid();
		var logId =
			await AuditLogTestHelper
				.SeedAuditLogAsync(
					_fixture.Factory,
					userId,
					AuditActions.InvitationCreated,
					targetId: targetId,
					details: "{\"email\":\"test@example.com\"}"
				);

		var url = AuditLogTestHelper.GetDetailUrl(
			logId
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<
				AuditLogDetailResponse
			>();
		result.Should().NotBeNull();
		result!.Id.Should().Be(logId);
		result.UserId.Should().Be(userId);
		result.UserName.Should().NotBeNullOrEmpty();
		result.UserEmail.Should()
			.NotBeNullOrEmpty();
		result.Action.Should()
			.Be(AuditActions.InvitationCreated);
		result.TargetId.Should().Be(targetId);
		result.Details.Should()
			.Contain("test@example.com");
		result.IpAddress.Should().Be("127.0.0.1");
		result.UserAgent.Should().Be("test-agent");
	}

	[Fact]
	public async Task
	ItShouldReturnRealUserFieldsWhenUserIsSoftDeleted() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Use the staff user (not admin) so we can
		// soft-delete without breaking other tests
		var staffUserId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffUserEmail
				);

		var logId =
			await AuditLogTestHelper
				.SeedAuditLogAsync(
					_fixture.Factory,
					staffUserId,
					AuditActions.LoginSucceeded
				);

		// Soft-delete the user
		await SoftDeleteUserAsync(staffUserId);

		try {
			var url = AuditLogTestHelper
				.GetDetailUrl(logId);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					AuditLogDetailResponse
				>();
			result.Should().NotBeNull();
			result!.Id.Should().Be(logId);
			result.UserName.Should()
				.NotBe("(deleted user)");
			result.UserEmail.Should()
				.NotBe("(unknown)");
			result.UserEmail.Should().Contain("@");
		} finally {
			await RestoreUserAsync(staffUserId);
		}
	}

	// Orphaned FK (hard-delete) fallback is
	// not integration-testable due to
	// FK ON DELETE CASCADE — hard-deleting a user
	// cascades to their audit logs. The
	// "(deleted user)" / "(unknown)" fallback is
	// defensive code.

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = AuditLogTestHelper.GetDetailUrl(
			Guid.NewGuid()
		);

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
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.AuditLogs.ForStaff.Root,
			"/not-a-guid"
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url = AuditLogTestHelper.GetDetailUrl(
			Guid.NewGuid()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = AuditLogTestHelper.GetDetailUrl(
			Guid.NewGuid()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = AuditLogTestHelper.GetDetailUrl(
			Guid.NewGuid()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	private async Task SoftDeleteUserAsync(
		Guid userId
	) {
		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<
				MainApi.Src.Data.DbContext
					.MainApiDbContext
			>();

		var user = await dbContext.User
			.FindAsync(userId);
		if (user is not null) {
			user.IsDeleted = true;
			user.DeletedAt = DateTime.UtcNow;
			await dbContext.SaveChangesAsync();
		}
	}

	private async Task RestoreUserAsync(
		Guid userId
	) {
		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<
				MainApi.Src.Data.DbContext
					.MainApiDbContext
			>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(
				u => u.Id == userId
			);
		if (user is not null) {
			user.IsDeleted = false;
			user.DeletedAt = null;
			await dbContext.SaveChangesAsync();
		}
	}

	private record AuditLogDetailResponse {
		public Guid Id { get; init; }
		public Guid UserId { get; init; }
		public string UserName { get; init; }
			= string.Empty;
		public string UserEmail { get; init; }
			= string.Empty;
		public string Action { get; init; }
			= string.Empty;
		public Guid? TargetId { get; init; }
		public string? Details { get; init; }
		public string? IpAddress { get; init; }
		public string? UserAgent { get; init; }
		public DateTime CreatedAt { get; init; }
	}
}
