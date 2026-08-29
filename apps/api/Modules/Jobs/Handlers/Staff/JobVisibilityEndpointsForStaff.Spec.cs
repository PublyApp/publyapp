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

// A5 (#636) — the brief's NON-NEGOTIABLE fix #8: the group spec covers ALL TEN
// staff jobs routes, not nine. Reachability + permission gates in one pass:
// privileged staff admin walks all ten (200s; the mutations each leave their
// expected row), an unprivileged staff user walks all ten and gets 403 on every
// one of them.
public sealed class JobVisibilityEndpointsForStaffSpec : IClassFixture<ApiFixture> {
	private const string EmptyJson = "{}";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public JobVisibilityEndpointsForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string QueueUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.Queue.Root
		);
	}

	private static string QueueItemUrl(string id) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.Queue.Root,
			Routes.Jobs.ForStaff.Queue.GetByIdFn(id)
		);
	}

	private static string DlqListUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.DeadLetter.Root
		);
	}

	private static string DlqItemUrl(string id) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.DeadLetter.Root,
			Routes.Jobs.ForStaff.DeadLetter.GetByIdFn(id)
		);
	}

	// Route 5 lives at the K-1 root — it NEVER moved.
	private static string RequeueUrl(string id) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.Root,
			Routes.Jobs.ForStaff.DeadLetter.RequeueFn(id)
		);
	}

	private static string SysJobsUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.SystemJobs.Root
		);
	}

	private static string SysJobUrl(string id) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Jobs.ForStaff.JobsRoot,
			Routes.Jobs.ForStaff.SystemJobs.Root,
			Routes.Jobs.ForStaff.SystemJobs.GetByIdFn(id)
		);
	}

	[Fact]
	public async Task
		ItShouldReachAllTenStaffJobsRoutesForStaffAdminAndForbiddenForUnprivileged() {
		var adminToken = await _authClient.LoginAsStaffAdminAsync();

		var queueItemId = await SeedQueueItemAsync();
		var deadLetterId = await InsertDeadLetterAsync();
		var definitionId = await SeedDefinitionAsync();
		var requeuedJobId = Guid.Empty;

		try {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

			// --- privileged walk: ten routes, ten successes -------------------

			using var r1 = await SendAsync(adminToken, () =>
				new HttpRequestMessage(HttpMethod.Get, QueueUrl()));
			r1.StatusCode.Should().Be(HttpStatusCode.OK, "route 1: GET /queue");

			using var r2 = await SendAsync(adminToken, () =>
				new HttpRequestMessage(HttpMethod.Get, QueueItemUrl(queueItemId)));
			r2.StatusCode.Should().Be(HttpStatusCode.OK, "route 2: GET /queue/{id}");

			using var r3 = await SendAsync(adminToken, () =>
				new HttpRequestMessage(HttpMethod.Get, DlqListUrl()));
			r3.StatusCode.Should().Be(HttpStatusCode.OK, "route 3: GET /dead-letter");

			using var r4 = await SendAsync(adminToken, () =>
				new HttpRequestMessage(HttpMethod.Get, DlqItemUrl(deadLetterId.ToString())));
			r4.StatusCode.Should().Be(
				HttpStatusCode.OK, "route 4: GET /jobs/dead-letter/{id}"
			);

			// Route 5: POST requeue at the K-1 root.
			using var r5 = await SendAsync(adminToken, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Post, RequeueUrl(deadLetterId.ToString())
				);
				request.Content = JsonContent.Create(new { });
				return request;
			});
			r5.StatusCode.Should().Be(
				HttpStatusCode.OK, "route 5: POST /dead-letter/{id}/requeue"
			);

			// Route 8 (trigger) produced a queue copy; cleanup covers it via
			// the requeue lineage delete + tracked job types below.
			var requeuedRow = await dbContext.JobQueue
				.AsNoTracking()
				.SingleAsync(j => j.RequeuedFromDeadLetterId == deadLetterId);
			requeuedJobId = requeuedRow.Id
				?? throw new InvalidOperationException(
					"Requeued job_queue row came back with a NULL id."
				);

			using var r6 = await SendAsync(adminToken, () =>
				new HttpRequestMessage(HttpMethod.Get, SysJobsUrl()));
			r6.StatusCode.Should().Be(
				HttpStatusCode.OK, "route 6: GET /system-jobs"
			);

			using var r7 = await SendAsync(adminToken, () =>
				new HttpRequestMessage(HttpMethod.Get, SysJobUrl(definitionId)));
			r7.StatusCode.Should().Be(
				HttpStatusCode.OK, "route 7: GET /system-jobs/{id}"
			);

			using var r8 = await SendAsync(adminToken, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Post,
					PathUtils.Join(SysJobUrl(definitionId), "trigger")
				);
				request.Content = JsonContent.Create(new { });
				return request;
			});
			r8.StatusCode.Should().Be(
				HttpStatusCode.OK,
				"route 8: POST /system-jobs/{id}/trigger (while still enabled)"
			);
			var triggerBody = await r8.Content.ReadFromJsonAsync<JsonDocument>();
			Assert.NotNull(triggerBody);
			triggerBody.RootElement.GetProperty("key").GetString()
				.Should().NotBeNull();
			var triggeredJobId = triggerBody.RootElement
				.GetProperty("jobId").GetString();
			Guid.TryParse(triggeredJobId, out _).Should().BeTrue(
				"the trigger enqueued a real row"
			);
			(await dbContext.JobQueue.CountAsync(j =>
				j.Id == Guid.Parse(triggeredJobId!)
			)).Should().Be(1, "exactly one queue row for this trigger");

			using var r9 = await SendAsync(adminToken, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Patch,
					PathUtils.Join(SysJobUrl(definitionId), "enabled")
				);
				request.Content = JsonContent.Create(new { isEnabled = false });
				return request;
			});
			r9.StatusCode.Should().Be(
				HttpStatusCode.OK, "route 9: PATCH /system-jobs/{id}/enabled"
			);
			var afterEnabledFlip = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.SingleAsync(d => d.Id == Guid.Parse(definitionId));
			afterEnabledFlip.IsEnabled.Should()
				.BeFalse("the enabled flip actually landed");

			using var r10 = await SendAsync(adminToken, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Patch,
					PathUtils.Join(SysJobUrl(definitionId), "cron")
				);
				request.Content = JsonContent.Create(
					new { cronExpression = "0 15 4 * * ?" }
				);
				return request;
			});
			r10.StatusCode.Should().Be(
				HttpStatusCode.OK, "route 10: PATCH /system-jobs/{id}/cron"
			);
			var afterCronUpdate = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.SingleAsync(d => d.Id == Guid.Parse(definitionId));
			afterCronUpdate.CronExpression.Should().Be("0 15 4 * * ?");

			// --- unprivileged walk: the same ten routes, ten 403s -------------

			var unprivileged = await CreateUnprivilegedStaffUserAsync();

			using var u1 = await SendAsync(unprivileged.Token, () =>
				new HttpRequestMessage(HttpMethod.Get, QueueUrl()));
			u1.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u2 = await SendAsync(unprivileged.Token, () =>
				new HttpRequestMessage(HttpMethod.Get, QueueItemUrl(queueItemId)));
			u2.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u3 = await SendAsync(unprivileged.Token, () =>
				new HttpRequestMessage(HttpMethod.Get, DlqListUrl()));
			u3.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u4 = await SendAsync(unprivileged.Token, () =>
				new HttpRequestMessage(HttpMethod.Get, DlqItemUrl(deadLetterId.ToString())));
			u4.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u5 = await SendAsync(unprivileged.Token, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Post, RequeueUrl(deadLetterId.ToString())
				);
				request.Content = JsonContent.Create(new { });
				return request;
			});
			u5.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u6 = await SendAsync(unprivileged.Token, () =>
				new HttpRequestMessage(HttpMethod.Get, SysJobsUrl()));
			u6.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u7 = await SendAsync(unprivileged.Token, () =>
				new HttpRequestMessage(HttpMethod.Get, SysJobUrl(definitionId)));
			u7.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u8 = await SendAsync(unprivileged.Token, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Patch,
					PathUtils.Join(SysJobUrl(definitionId), "enabled")
				);
				request.Content = JsonContent.Create(new { isEnabled = true });
				return request;
			});
			u8.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u9 = await SendAsync(unprivileged.Token, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Patch,
					PathUtils.Join(SysJobUrl(definitionId), "cron")
				);
				request.Content = JsonContent.Create(
					new { cronExpression = "0 0 3 * * ?" }
				);
				return request;
			});
			u9.StatusCode.Should().Be(HttpStatusCode.Forbidden);

			using var u10 = await SendAsync(unprivileged.Token, () => {
				var request = new HttpRequestMessage(
					HttpMethod.Post,
					PathUtils.Join(SysJobUrl(definitionId), "trigger")
				);
				request.Content = JsonContent.Create(new { });
				return request;
			});
			u10.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		} finally {
			await CleanupAsync(deadLetterId, definitionId, requeuedJobId);
		}
	}

	private async Task<HttpResponseMessage> SendAsync(
		string token,
		Func<HttpRequestMessage> createRequest
	) {
		var request = createRequest().WithSessionToken(token);
		return await _http.SendAsync(request);
	}

	// --- helpers ------------------------------------------------------------------------

	private async Task<string> SeedQueueItemAsync() {
		var jobType = $"spec.a5.group.queue.{Guid.NewGuid():N}";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		dbContext.JobQueue.Add(new JobQueueItem {
			JobType = jobType,
			Payload = "{}",
			Priority = 0,
			MaxAttempts = 10,
		});
		_ = await dbContext.SaveChangesAsync();
		_trackedQueueJobTypes.Add(jobType);

		await using var verify = await CreateDbContextAsync();
		var row = await verify.JobQueue.SingleAsync(j => j.JobType == jobType);
		return row.Id!.Value.ToString();
	}

	private async Task<Guid> InsertDeadLetterAsync() {
		var jobType = $"spec.a5.group.dlq.{Guid.NewGuid():N}";
		_trackedDlqJobTypes.Add(jobType);

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
		return row.Id ?? throw new InvalidOperationException(
			"Inserted job_dead_letter row came back with a NULL id."
		);
	}

	private async Task<string> SeedDefinitionAsync() {
		var jobKey = $"spec.a5.group.sys.{Guid.NewGuid():N}";
		_trackedSysJobKeys.Add(jobKey);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var definition = new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0 3 * * ?",
			ScheduleEpoch = Guid.NewGuid(),
			IsEnabled = true,
			Description = "A5 group spec row",
		};
		dbContext.SystemJobDefinition.Add(definition);
		_ = await dbContext.SaveChangesAsync();

		return definition.Id!.Value.ToString();
	}

	private readonly List<string> _trackedQueueJobTypes = [];
	private readonly List<string> _trackedDlqJobTypes = [];
	private readonly List<string> _trackedSysJobKeys = [];

	private async Task CleanupAsync(
		Guid deadLetterId,
		string definitionId,
		Guid extraJobId
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		if (extraJobId != Guid.Empty) {
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM job_queue WHERE id = {extraJobId}"
			);
		}
		foreach (var tracked in _trackedQueueJobTypes) {
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM job_queue WHERE job_type = {tracked}"
			);
		}
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE requeued_from_dead_letter_id = {deadLetterId}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter_events WHERE dead_letter_id = {deadLetterId}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE id = {deadLetterId}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM audit_logs WHERE target_id = {Guid.Parse(definitionId)}"
		);
		foreach (var jobKey in _trackedSysJobKeys) {
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM job_queue WHERE job_type = {jobKey}"
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM audit_logs
				WHERE target_id IN (
					SELECT id FROM system_job_definitions WHERE job_key = {jobKey}
				)
				"""
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM system_job_occurrences WHERE job_key = {jobKey}"
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM system_job_definitions WHERE job_key = {jobKey}"
			);
		}
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
		var email = $"no-perms-group-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "Group",
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
