using System.Net;
using System.Net.Http.Json;
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
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// A5 (#636): POST /staff/dead-letter/{id}/requeue — reproduces the preserved
// envelope into job_queue and audit-logs who did it. Contract: 200 with the new
// job id, lineage stamped both ways, ONE Requeued evidence event, ONE audit row;
// 404 unknown/malformed, 409 when the row was already requeued (nothing changes),
// 403 leaves the row untouched.
public sealed class RequeueDeadLetterForStaffSpec : IClassFixture<ApiFixture> {
	private const string EmptyJson = "{}";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public RequeueDeadLetterForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	// K-1 root: the requeue path NEVER moved off /staff/dead-letter.
	private static string Url(string deadLetterId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.Root,
			Routes.Jobs.ForStaff.DeadLetter.RequeueFn(deadLetterId)
		);
	}

	[Fact]
	public async Task ItShouldRequeueIntoJobQueueStampingLineageAuditAndEvent() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var deadLetterId = await InsertDeadLetterAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { note = "spec requeue" });
			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var document = await response.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(document);
			document.RootElement.GetProperty("deadLetterId").GetString()
				.Should().Be(deadLetterId);
			var newJobId = Guid.Parse(
				document.RootElement.GetProperty("jobId").GetString()!
			);
			document.RootElement.GetProperty("key").GetString()
				.Should().Be(ResponseKeys.DeadLetterRequeueSuccess.Value);

			// Lineage stamped both ways: DLQ row points at the copy, copy carries
			// requeued_from_dead_letter_id back.
			await using var verify = await CreateDbContextAsync();
			var dlRow = await verify.JobDeadLetter
				.SingleAsync(d => d.Id == Guid.Parse(deadLetterId));
			dlRow.RequeuedAsJobId.Should().Be(newJobId);
			dlRow.RequeuedAt.Should().NotBeNull();

			var queueRow = await verify.JobQueue
				.SingleAsync(j => j.Id == newJobId);
			queueRow.RequeuedFromDeadLetterId.Should().Be(Guid.Parse(deadLetterId));
			queueRow.Status.Should().Be(JobQueueStatus.Pending);
			queueRow.Attempts.Should().Be(0);

			// Exactly ONE evidence event for the requeue.
			var events = await verify.JobDeadLetterEvent
				.Where(e => e.DeadLetterId == Guid.Parse(deadLetterId))
				.ToListAsync();
			events.Should().ContainSingle(e =>
				e.Event == JobDeadLetterEvents.Requeued
			);

			// Audit trail records the real actor against the DLQ row.
			var audit = await verify.AuditLog
				.Where(a => a.Action == AuditActions.JobDeadLetterRequeued)
				.Where(a => a.TargetId == Guid.Parse(deadLetterId))
				.SingleOrDefaultAsync();
			audit.Should().NotBeNull("the requeue is audit-logged");
			Assert.NotNull(audit);

			// Cleanup of the produced queue row happens in Finally below.
			_producedJobIds.Add(newJobId);
		} finally {
			await CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Url(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMalformedIdWithoutRouteConstraint() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(HttpMethod.Post, Url("not-a-guid"))
			.WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnConflictWhenRowWasAlreadyRequeued() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var deadLetterId = await InsertDeadLetterAsync();

		try {
			// Stamp the OUT pair first: the row has already been requeued once.
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE job_dead_letter
				SET requeued_as_job_id = {Guid.NewGuid()}, requeued_at = now()
				WHERE id = {Guid.Parse(deadLetterId)}
				"""
			);

			var request = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(token);
			request.Content = JsonContent.Create(new { });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Conflict);
			var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(problem);
			problem.TranslationKey.Should()
				.Be(ResponseKeys.DeadLetterRequeueConflict.Value);
		} finally {
			await CleanupAsync(deadLetterId);
		}
	}

	[Fact]
	public async Task ItShouldReturnForbiddenAndChangeNothingWithoutPermission() {
		var unprivileged = await CreateUnprivilegedStaffUserAsync();
		var deadLetterId = await InsertDeadLetterAsync();

		try {
			var request = new HttpRequestMessage(HttpMethod.Post, Url(deadLetterId))
				.WithSessionToken(unprivileged.Token);
			request.Content = JsonContent.Create(new { });

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			// Nothing changed: no OUT lineage, no queue copy, no event, no audit.
			await using var verify = await CreateDbContextAsync();
			var row = await verify.JobDeadLetter
				.SingleAsync(d => d.Id == Guid.Parse(deadLetterId));
			row.RequeuedAsJobId.Should().BeNull();
			row.RequeuedAt.Should().BeNull();
			(await verify.JobQueue.AnyAsync(
				j => j.RequeuedFromDeadLetterId == Guid.Parse(deadLetterId)
			)).Should().BeFalse();
			(await verify.JobDeadLetterEvent.AnyAsync(
				e => e.DeadLetterId == Guid.Parse(deadLetterId)
					&& e.Event == JobDeadLetterEvents.Requeued
			)).Should().BeFalse();
			(await verify.AuditLog.AnyAsync(
				a => a.Action == AuditActions.JobDeadLetterRequeued
					&& a.TargetId == Guid.Parse(deadLetterId)
			)).Should().BeFalse();
		} finally {
			await CleanupAsync(deadLetterId);
		}
	}

	private readonly List<Guid> _producedJobIds = [];

	// --- helpers ------------------------------------------------------------------------

	private async Task<string> InsertDeadLetterAsync() {
		var jobType = $"spec.a5.requeue.{Guid.NewGuid():N}";

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
				now(), now(), {(int)ExternalStateStatus.Unclassified}, now(),
				now() + make_interval(days => 7)
			)
			"""
		);

		await using var verify = await CreateDbContextAsync();
		var row = await verify.JobDeadLetter.SingleAsync(d => d.JobType == jobType);
		return (row.Id ?? throw new InvalidOperationException(
			"Inserted job_dead_letter row came back with a NULL id."
		)).ToString();
	}

	private async Task CleanupAsync(string deadLetterId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			DELETE FROM job_queue WHERE requeued_from_dead_letter_id = {Guid.Parse(deadLetterId)}
			"""
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter_events WHERE dead_letter_id = {Guid.Parse(deadLetterId)}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE id = {Guid.Parse(deadLetterId)}"
		);
		foreach (var jobId in _producedJobIds) {
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM job_queue WHERE id = {jobId}"
			);
		}
		_producedJobIds.Clear();
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
		CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-requeue-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "Requeue",
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
