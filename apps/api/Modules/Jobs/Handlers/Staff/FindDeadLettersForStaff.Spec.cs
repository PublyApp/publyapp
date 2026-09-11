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
	private const string _EmptyJson = "{}";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindDeadLettersForStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _Url() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.DeadLetter.Root
		);
	}

	[Fact]
	public async Task ItShouldListDeadLettersIncludingTheSeededRow() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var jobType = await _InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.Unclassified
		);

		try {
			var request = new HttpRequestMessage(HttpMethod.Get, _Url())
				.WithSessionToken(token);

			using var response = await _Http.SendAsync(request);

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
			await _CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldFilterByExternalStateStatusCsv() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var jobType = await _InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.Missing
		);

		try {
			var url = $"{_Url()}?job_type={Uri.EscapeDataString(jobType)}"
				+ "&external_state_status=4";
			var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token);

			using var response = await _Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("data")
				.EnumerateArray()
				.Should().Contain(item =>
					item.GetProperty("jobType").GetString() == jobType
				);
		} finally {
			await _CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAnUnknownStatusToken() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{_Url()}?external_state_status=999"
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		using var response = await _Http.GetAsync(_Url());

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await _CreateUnprivilegedStaffUserAsync();

		var request = new HttpRequestMessage(HttpMethod.Get, _Url())
			.WithSessionToken(unprivileged.Token);

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<string> _InsertDeadLetterAsync(int status) {
		var jobType = $"spec.a5.dlq-list.{Guid.NewGuid():N}";

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_dead_letter
				(original_job_id, job_type, payload, priority, max_attempts, attempts,
				 enqueued_at, failed_at, external_state_status,
				 external_state_prepared_at, external_state_expires_at)
			VALUES (
				{Guid.NewGuid()}, {jobType}, {_EmptyJson}::jsonb, 0, 10, 10,
				now(), now(), {status}, now(),
				now() + make_interval(days => 7)
			)
			"""
		);

		return jobType;
	}

	private async Task _CleanupAsync(string jobType) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type = {jobType}"
		);
	}

	private async Task<(string Token, Guid UserId)>
		_CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-dlq-list-{Guid.NewGuid():N}@example.com";

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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

		var token = await _AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, userId);
	}
}
