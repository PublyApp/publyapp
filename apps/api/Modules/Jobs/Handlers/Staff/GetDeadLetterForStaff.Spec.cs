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

// A5 (#636): GET /staff/jobs/dead-letter/{id} — one DLQ row's detail with the
// fail-closed payload redaction applied AT THE WIRE BOUNDARY (#636 brief fix #6).
// Contract: safe seeded keys pass through untouched; sensitive/unknown job types
// come back redacted; 404 unknown AND malformed id; 401/403 auth gates.
public sealed class GetDeadLetterForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetDeadLetterForStaffSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _Url(string deadLetterId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.DeadLetter.Root,
			Routes.Jobs.ForStaff.DeadLetter.GetByIdFn(deadLetterId)
		);
	}

	[Fact]
	public async Task ItShouldReturnDetailWithPayloadIntactForASafeKey() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		const string jobType =
			"session-cleanup";
		var deadLetterId = await _InsertDeadLetterAsync(
			jobType,
			payload: "{\"batch\":42}"
		);

		try {
			using var response = await _SendAsync(token, deadLetterId);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var detail = document.RootElement.GetProperty("detail");
			detail.GetProperty("id").GetString().Should().Be(deadLetterId);
			detail.GetProperty("jobType").GetString().Should().Be(jobType);
			detail.GetProperty("payload").ValueKind
				.Should().Be(JsonValueKind.String);
			var payloadText = detail.GetProperty("payload").GetString();
			payloadText.Should().NotBeNullOrEmpty();
			var payloadDoc = JsonDocument.Parse(payloadText.Required());
			payloadDoc.RootElement.TryGetProperty("batch", out _)
				.Should().BeTrue("the payload JSON object survives storage");
			payloadDoc.RootElement.TryGetProperty("redacted", out _)
				.Should().BeFalse("safe keys are never redacted");
		} finally {
			await _CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldRedactThePayloadForASensitiveEmailKey() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var deadLetterId = await _InsertDeadLetterAsync(
			"email.password-reset.v1",
			payload: "{\"body\":\"secret token bytes\"}"
		);

		try {
			using var response = await _SendAsync(token, deadLetterId);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var payload = document.RootElement
				.GetProperty("detail").GetProperty("payload").GetString();
			Assert.NotNull(payload);
			var envelope = JsonDocument.Parse(payload).RootElement;
			envelope.GetProperty("redacted").GetBoolean().Should().BeTrue();
			envelope.GetProperty("reason").GetString()
				.Should().Be("sensitive-payload-staff-redacted");
			payload.Should().NotContain("secret token bytes");
		} finally {
			await _CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldRedactAnUnknownJobTypeFailClosed() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var deadLetterId = await _InsertDeadLetterAsync(
			$"spec.unknown.{Guid.NewGuid():N}",
			payload: "{\"anything\":\"visible\"}"
		);

		try {
			using var response = await _SendAsync(token, deadLetterId);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			var payload = document.RootElement
				.GetProperty("detail").GetProperty("payload").GetString();
			Assert.NotNull(payload);
			JsonDocument.Parse(payload).RootElement
				.GetProperty("redacted").GetBoolean()
				.Should().BeTrue("unknown keys fail closed");
			payload.Should().NotContain("visible");
		} finally {
			await _CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var response = await _SendAsync(
			token, Guid.NewGuid().ToString()
		);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var response = await _SendAsync(token, "not-a-guid");

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRequireASession() {
		using var response = await _Http.GetAsync(
			_Url(Guid.NewGuid().ToString())
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await _CreateUnprivilegedStaffUserAsync();

		using var response = await _SendAsync(
			unprivileged.Token, Guid.NewGuid().ToString()
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private async Task<HttpResponseMessage> _SendAsync(
		string token,
		string deadLetterId
	) {
		var request = new HttpRequestMessage(HttpMethod.Get, _Url(deadLetterId))
			.WithSessionToken(token);
		return await _Http.SendAsync(request);
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<string> _InsertDeadLetterAsync(
		string jobType,
		string payload
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_dead_letter
				(original_job_id, job_type, payload, priority, max_attempts, attempts,
				 enqueued_at, failed_at, external_state_status,
				 external_state_prepared_at, external_state_expires_at)
			VALUES (
				{Guid.NewGuid()}, {jobType}, {payload}::jsonb, 0, 10, 10,
				now(), now(), {(int)ExternalStateStatus.Missing}, now(),
				now() + make_interval(days => 7)
			)
			"""
		);

		await using var verify = await _CreateDbContextAsync();
		var row = await verify.JobDeadLetter.SingleAsync(
			d => d.JobType == jobType
		);
		var id = row.Id;
		if (id is null) {
			throw new InvalidOperationException(
				"Inserted job_dead_letter row came back with a NULL id."
			);
		}

		return id.Value.ToString();
	}

	private async Task _CleanupAsync(string deadLetterId) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE id = {Guid.Parse(deadLetterId)}"
		);
	}

	private async Task<AppDbContext> _CreateDbContextAsync() {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString).Options
		);
	}

	private async Task<(string Token, Guid UserId)>
		_CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-dlq-detail-{Guid.NewGuid():N}@example.com";

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "DlqDetail",
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
