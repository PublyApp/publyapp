using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class UpdateStaffUserEmailSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateStaffUserEmailSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	public static TheoryData<string> InvalidEmailBodies {
		get {
			return new() {
				"{}",
				"{\"email\":123}",
				"{\"email\":\" \"}",
				"{\"email\":\"not-an-email\"}",
			};
		}
	}

	private static string GetUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.UpdateEmailFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldUpdateStaffUserEmailAndWriteAuditLog() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var userId = await GetStaffUserIdByEmailAsync(TestConstants.StaffUserEmail);
		var uniqueId = Guid.NewGuid().ToString("N");
		var submittedEmail = $"  STAFF-USER-EMAIL-{uniqueId}@EXAMPLE.COM  ";
		var expectedEmail = $"staff-user-email-{uniqueId}@example.com";

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl(userId.ToString())
			).WithSessionToken(staffToken);
			request.Content = JsonContent.Create(new { email = submittedEmail });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<GetStaffUserByIdResult>();
			result.Should().NotBeNull();
			if (result is null) {
				throw new InvalidOperationException(
					"Staff user email update response was empty."
				);
			}

			result.Id.Should().Be(userId);
			result.Email.Should().Be(expectedEmail);

			var persistedEmail = await GetStaffUserEmailByIdAsync(userId);
			persistedEmail.Should().Be(expectedEmail);

			var auditLog = await GetLatestAuditLogAsync(
				AuditActions.StaffUserEmailUpdated,
				userId
			);
			auditLog.Should().NotBeNull();
			if (auditLog is null) {
				throw new InvalidOperationException(
					"Staff user email update audit log was not written."
				);
			}

			AssertEmailAuditDetails(auditLog, expectedEmail);
		} finally {
			await SetStaffUserEmailAsync(userId, TestConstants.StaffUserEmail);
		}
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenStaffUserEmailIsAlreadyInUse() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var userId = await GetStaffUserIdByEmailAsync(TestConstants.StaffUserEmail);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(userId.ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = TestConstants.StaffAdminEmail }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		response.Content.Headers.ContentType?.MediaType
			.Should().Be("application/problem+json");

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			throw new InvalidOperationException(
				"Duplicate email validation response was empty."
			);
		}

		problem.Status.Should().Be((int)HttpStatusCode.UnprocessableEntity);
		problem.TranslationKey.Should().Be(ResponseKeys.EmailAlreadyInUse);
		problem.Errors.Should().ContainKey("email");
		problem.Errors["email"].Should().NotBeEmpty();
	}

	[Theory]
	[MemberData(nameof(InvalidEmailBodies))]
	public async Task ItShouldReturnValidationProblemWhenStaffUserEmailBodyIsInvalid(
		string body
	) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var userId = await GetStaffUserIdByEmailAsync(TestConstants.StaffUserEmail);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(userId.ToString())
		).WithSessionToken(staffToken);
		request.Content = new StringContent(body, Encoding.UTF8, "application/json");

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			throw new InvalidOperationException(
				"Invalid email validation response was empty."
			);
		}

		problem.TranslationKey.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Should().NotBeEmpty();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenStaffUserEmailUserIdIsMalformed() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl("not-a-guid")
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = $"staff-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			throw new InvalidOperationException(
				"Malformed user id response was empty."
			);
		}

		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenStaffUserEmailUserDoesNotExist() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(
			new { email = $"staff-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			throw new InvalidOperationException(
				"Staff user not-found response was empty."
			);
		}

		problem.TranslationKey.Should().Be(ResponseKeys.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWhenStaffUserEmailSessionIsMissing() {
		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(
			new { email = $"staff-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenWhenStaffUserEmailSessionIsTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(tenantToken);
		request.Content = JsonContent.Create(
			new { email = $"staff-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private async Task<Guid> GetStaffUserIdByEmailAsync(string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from account in dbContext.UserAccount
			where account.Scope == AccountScope.Staff
				&& !account.IsDeleted
				&& !account.User.IsDeleted
				&& account.User.Email == email
			select account.UserId;

		return await query.SingleAsync();
	}

	private async Task<string> GetStaffUserEmailByIdAsync(Guid userId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from user in dbContext.User
			where user.Id == userId
			select user.Email;

		return await query.SingleAsync();
	}

	private async Task SetStaffUserEmailAsync(Guid userId, string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from user in dbContext.User
			where user.Id == userId
			select user;

		var staffUser = await query.SingleAsync();
		staffUser.Email = email;
		await dbContext.SaveChangesAsync();
	}

	private async Task<AuditLog?> GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from log in dbContext.AuditLog
			where log.Action == action
				&& log.TargetId == targetId
			orderby log.CreatedAt descending
			select log;

		return await query.FirstOrDefaultAsync();
	}

	private static void AssertEmailAuditDetails(
		AuditLog auditLog,
		string expectedEmail
	) {
		auditLog.Details.Should().NotBeNull();
		if (auditLog.Details is null) {
			throw new InvalidOperationException(
				"Staff user email audit log details were empty."
			);
		}

		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("Email").GetString()
			.Should().Be(expectedEmail);
	}
}
