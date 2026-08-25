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
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// K-1 (#863): POST /staff/dead-letter/{id}/resolve-unclassified — the resolution
// path for dead-letter rows stuck at status 6 Unclassified. Fail-closed contract:
// 404 unknown/malformed id, 409 when not Unclassified, 403 without the new
// staff.jobs.resolve permission, and a race-safe single-statement transition.
public sealed class ResolveDeadLetterUnclassifiedForStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public ResolveDeadLetterUnclassifiedForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string Url(Guid id) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.Root,
			Routes.Jobs.ForStaff.ResolveUnclassifiedFn(id.ToString())
		);
	}

	[Fact]
	public async Task ItShouldResolveAnUnclassifiedRowStampingMissingWithEventAndAudit() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (deadLetterId, originalJobId, jobType) = await InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.Unclassified
		);

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new {
				note = "Checked the provider; the referenced upload was never created."
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content.ReadFromJsonAsync<ResolvedResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.Id.Should().Be(deadLetterId);
			result.ExternalStateStatus.Should().Be((int)ExternalStateStatus.Missing);

			// Row stamped 4 Missing; recorded bounds kept as evidence.
			await using var verify = await CreateDbContextAsync();
			var row = await verify.JobDeadLetter.SingleAsync(d => d.Id == deadLetterId);
			row.ExternalStateStatus.Should().Be((int)ExternalStateStatus.Missing);
			row.ExternalStatePreparedAt.Should().NotBeNull("recorded bounds are kept");
			row.ExternalStateExpiresAt.Should().NotBeNull("recorded bounds are kept");

			// Exactly one evidence event: operator-detected 6 → 4 with details.
			var events = await verify.JobDeadLetterEvent
				.Where(e => e.DeadLetterId == deadLetterId)
				.ToListAsync();
			events.Should().HaveCount(1);
			var @event = events.Single();
			@event.Event.Should().Be(JobDeadLetterEvents.MissingConfirmed);
			@event.DetectedBy.Should().Be("operator");
			@event.PriorStatus.Should().Be((int)ExternalStateStatus.Unclassified);
			@event.NewStatus.Should().Be((int)ExternalStateStatus.Missing);
			using var details = JsonDocument.Parse(@event.Details);
			details.RootElement.GetProperty("originalJobId").GetString()
				.Should().Be(originalJobId.ToString());
			details.RootElement.GetProperty("jobType").GetString().Should().Be(jobType);
			details.RootElement.GetProperty("reason").GetString()
				.Should().Be("operator_confirmed_absent");
			details.RootElement.GetProperty("note").GetString()
				.Should().Contain("never created");

			// Audit trail records the real actor.
			var audit = await verify.AuditLog
				.Where(a => a.Action == AuditActions.JobDeadLetterTriageResolved)
				.Where(a => a.TargetId == deadLetterId)
				.SingleOrDefaultAsync();
			audit.Should().NotBeNull("the resolution is audit-logged against the real actor");
			Assert.NotNull(audit);
		} finally {
			await CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Url(Guid.NewGuid())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.Root,
			"/not-a-guid/resolve-unclassified"
		);
		var request = new HttpRequestMessage(HttpMethod.Post, url)
			.WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		// No route constraints on ID parameters (repo rule): a malformed id must
		// surface as 404 from the handler, never a framework 400/404 mismatch.
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnConflictWhenRowIsNotAwaitingTriage() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (deadLetterId, _, _) = await InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.NeverPrepared
		);

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Conflict);
			var problem = await response.Content
				.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(problem);
			problem.RootElement.GetProperty("detail").GetString()
				.Should().Contain("NeverPrepared", "the conflict names the actual current state");
		} finally {
			await CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();
		var (deadLetterId, _, _) = await InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.Unclassified
		);

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(unprivileged.Token);
			request.Content = JsonContent.Create(new { });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			// Nothing changed: still Unclassified, no event row.
			await using var verify = await CreateDbContextAsync();
			var row = await verify.JobDeadLetter.SingleAsync(d => d.Id == deadLetterId);
			row.ExternalStateStatus.Should().Be((int)ExternalStateStatus.Unclassified);
			(await verify.JobDeadLetterEvent.AnyAsync(e => e.DeadLetterId == deadLetterId))
				.Should().BeFalse();
		} finally {
			await CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldLoseTheRaceCleanlyOnDoubleResolution() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var (deadLetterId, _, _) = await InsertDeadLetterAsync(
			status: (int)ExternalStateStatus.Unclassified
		);

		try {
			// First resolution wins.
			var first = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(token);
			first.Content = JsonContent.Create(new { });
			using var firstResponse = await _http.SendAsync(first);
			firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

			// Second resolution of the same row hits the conditional transition's
			// guard: zero rows updated → 409 naming the new state, NOT a second
			// event or a silent double-write.
			var second = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(token);
			second.Content = JsonContent.Create(new { });
			using var secondResponse = await _http.SendAsync(second);
			secondResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);
			var problem = await secondResponse.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(problem);
			problem.RootElement.GetProperty("detail").GetString()
				.Should().Contain("Missing", "the conflict names the post-resolution state");

			await using var verify = await CreateDbContextAsync();
			(await verify.JobDeadLetterEvent.CountAsync(e => e.DeadLetterId == deadLetterId))
				.Should().Be(1, "exactly one evidence event exists after the race");
		} finally {
			await CleanupAsync(deadLetterId);
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<(string Token, Guid UserId)> CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-dlq-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "Dlq",
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

	private const string EmptyJson = "{}";

	private async Task<(Guid Id, Guid OriginalJobId, string JobType)> InsertDeadLetterAsync(
		int status
	) {
		var jobType = $"spec.dlq-resolve.{Guid.NewGuid():N}";
		var originalJobId = Guid.NewGuid();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_dead_letter
				(original_job_id, job_type, payload, priority, max_attempts, attempts,
				 enqueued_at, failed_at, external_state_status,
				 external_state_prepared_at, external_state_expires_at)
			VALUES (
				{originalJobId}, {jobType}, {EmptyJson}::jsonb, 0, 10, 10,
				now(), now(),
				{status},
				CASE WHEN {status} IN (1, 2, 4, 5, 6) THEN now() ELSE NULL END,
				CASE WHEN {status} IN (1, 2, 4, 5, 6)
					THEN now() + make_interval(days => 7) ELSE NULL END
			)
			"""
		);

		await using var verify = await CreateDbContextAsync();
		var row = await verify.JobDeadLetter.SingleAsync(d => d.JobType == jobType);
		var deadLetterId = row.Id ?? throw new InvalidOperationException(
			"Inserted job_dead_letter row came back with a NULL id."
		);
		return (deadLetterId, originalJobId, jobType);
	}

	private async Task CleanupAsync(Guid deadLetterId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE id = {deadLetterId}"
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options
		);
	}

	private sealed record ResolvedResponse {
		public Guid Id { get; set; }
		public int ExternalStateStatus { get; set; }
	}
}
