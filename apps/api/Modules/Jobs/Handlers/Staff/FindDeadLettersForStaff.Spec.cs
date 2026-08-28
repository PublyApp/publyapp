using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// A5 (#636): GET /staff/jobs/dead-letter — staff DLQ dashboard list read.
// Contract: 200 page containing the seeded row, status CSV filter honored,
// 400 unknown status token, 401 without a session, 403 unprivileged staff.
public sealed class FindDeadLettersForStaffSpec : IClassFixture<ApiFixture> {
	private const string EmptyJson = "{}";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindDeadLettersForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string Url() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.DeadLetter.Root
		);
	}

	[Fact]
	public async Task ItShouldListDeadLettersIncludingTheSeededRow() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var jobType = await InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.Unclassified
		);

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, Url())
				.WithSessionToken(token);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var data = document.RootElement.GetProperty("data");
			data.GetArrayLength().Should().BeGreaterThan(0);
			data.EnumerateArray().Should().Contain(item =>
				item.GetProperty("jobType").GetString() == jobType
				&& item.GetProperty("externalStateStatus").GetInt32()
					== (int)ExternalStateStatus.Unclassified
			);
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldFilterByExternalStateStatusCsv() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var jobType = await InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.Missing
		);

		try {
			var url = $"{Url()}?job_type={Uri.EscapeDataString(jobType)}"
				+ "&external_state_status=4";
			var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("data")
				.EnumerateArray()
				.Should().Contain(item =>
					item.GetProperty("jobType").GetString() == jobType
				);
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAnUnknownStatusToken() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{Url()}?external_state_status=999"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		using var response = await _http.GetAsync(Url());

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();

		var request = new HttpRequestMessage(HttpMethod.Get, Url())
			.WithSessionToken(unprivileged.Token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<string> InsertDeadLetterAsync(int status) {
		var jobType = $"spec.a5.dlq-list.{Guid.NewGuid():N}";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_dead_letter
				(original_job_id, job_type, payload, priority, max_attempts, attempts,
				 enqueued_at, failed_at, external_state_status,
				 external_state_prepared_at, external_state_expires_at)
			VALUES (
				{Guid.NewGuid()}, {jobType}, {EmptyJson}::jsonb, 0, 10, 10,
				now(), now(), {status}, now(),
				now() + make_interval(days => 7)
			)
			"""
		);

		return jobType;
	}

	private async Task CleanupAsync(string jobType) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type = {jobType}"
		);
	}

	private async Task<(string Token, Guid UserId)>
		CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-dlq-list-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "DlqList",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		var token = await _authClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, userId);
	}
}
