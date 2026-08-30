using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Publishing.Jobs;

using Xunit;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// HTTP-level integration spec for the api/worker readiness guard (issue #1716):
/// under <c>APP_ROLE=api</c> alone NOTHING consumes job_queue, so a "publish
/// now" enqueues a delivery job and the publication stays <c>Scheduled</c>
/// until a SEPARATE worker claims the row. That failure used to be silent; this
/// guard makes the api readiness endpoint refuse to declare itself healthy once
/// a due job has sat unclaimed past the drain-stall threshold, and the /health
/// response names the cause. Every assertion runs against the REAL /health
/// endpoint of the integration host, over a REAL job_queue row.
/// </summary>
public sealed class JobQueueDrainHealthCheckSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;

	public JobQueueDrainHealthCheckSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task ItShouldRefuseReadinessAndNameTheCauseWhenDueJobsStayUnclaimed() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var stallThreshold = AppEnvironment.Instance.JOB_QUEUE_DRAIN_STALL_SECONDS;

		try {
			await InsertStalledPendingJobAsync(db, stallThreshold);

			using var response = await _http.GetAsync("/health");
			var body = await response.Content.ReadAsStringAsync();

			response.StatusCode.Should().Be(
				HttpStatusCode.ServiceUnavailable,
				"readiness must refuse while a due job sits unclaimed past the threshold"
			);
			body.Should().Contain("job_queue_drain", "the failing check is named");
			body.Should().Contain(
				"worker",
				"the cause must say a worker is not draining the queue"
			);
			body.Should().Contain(
				"Scheduled",
				"the cause must say what stays stuck (publications stay Scheduled)"
			);
		} finally {
			await db.JobQueue.ExecuteDeleteAsync();
		}
	}

	[Fact]
	public async Task ItShouldStayReadyOnceTheStalledJobIsConsumed() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		try {
			var stallThreshold = AppEnvironment.Instance.JOB_QUEUE_DRAIN_STALL_SECONDS;
			await InsertStalledPendingJobAsync(db, stallThreshold);

			using var stalled = await _http.GetAsync("/health");
			stalled.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);

			// The worker claims the row (status -> Processing), i.e. the drain
			// resumes: readiness must recover.
			await db.JobQueue.ExecuteUpdateAsync(job => job
				.SetProperty(row => row.Status, JobQueueStatus.Processing));

			using var drained = await _http.GetAsync("/health");
			drained.StatusCode.Should().Be(HttpStatusCode.OK);
			var report = await drained.Content.ReadFromJsonAsync<HealthReportJson>();
			report.Should().NotBeNull();
			Assert.NotNull(report);
			report.Status.Should().Be("Healthy");
		} finally {
			await db.JobQueue.ExecuteDeleteAsync();
		}
	}

	[Fact]
	public async Task ItShouldStayReadyWhenTheJobIsClaimedByAWorkerAlready() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		try {
			// A worker claimed and leased the row long ago (status Processing):
			// it is not waiting for a claimant, so the queue is being drained.
			var stallThreshold = AppEnvironment.Instance.JOB_QUEUE_DRAIN_STALL_SECONDS;
			var backdated = DateTime.UtcNow.AddSeconds(-(stallThreshold + 60));

			var claimed = new JobQueueItem {
				JobType = PublishingJobs.PublishPublicationV1JobType,
				Status = JobQueueStatus.Processing,
				NextAttemptAt = backdated,
				LockedUntil = DateTime.UtcNow.AddSeconds(300),
			};
			db.JobQueue.Add(claimed);
			await db.SaveChangesAsync();

			using var response = await _http.GetAsync("/health");
			response.StatusCode.Should().Be(
				HttpStatusCode.OK,
				"a claimed (Processing) row is not waiting for a worker"
			);
		} finally {
			await db.JobQueue.ExecuteDeleteAsync();
		}
	}

	[Fact]
	public async Task ItShouldStayReadyWhileDueJobsAreStillYoungerThanTheStallThreshold() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		try {
			// Due (next_attempt_at <= now()) but freshly enqueued: a healthy
			// worker claims it within the poll interval, so readiness must not
			// flip on the grace window.
			db.JobQueue.Add(new JobQueueItem {
				JobType = PublishingJobs.PublishPublicationV1JobType,
				Status = JobQueueStatus.Pending,
				NextAttemptAt = DateTime.UtcNow.AddSeconds(-5),
			});
			await db.SaveChangesAsync();

			using var response = await _http.GetAsync("/health");
			response.StatusCode.Should().Be(
				HttpStatusCode.OK,
				"a due job younger than the stall threshold is not a stalled queue"
			);
		} finally {
			await db.JobQueue.ExecuteDeleteAsync();
		}
	}

	[Fact]
	public async Task ItShouldStayReadyWhenTheJobIsNotYetDue() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		try {
			// A scheduled future job (e.g. a post scheduled for tomorrow) is
			// deliberately not claimable yet — it must never count as stalled.
			db.JobQueue.Add(new JobQueueItem {
				JobType = PublishingJobs.PublishPublicationV1JobType,
				Status = JobQueueStatus.Pending,
				NextAttemptAt = DateTime.UtcNow.AddDays(1),
			});
			await db.SaveChangesAsync();

			using var response = await _http.GetAsync("/health");
			response.StatusCode.Should().Be(
				HttpStatusCode.OK,
				"a not-yet-due job must not trip the drain-stall guard"
			);
		} finally {
			await db.JobQueue.ExecuteDeleteAsync();
		}
	}

	[Fact]
	public async Task ItShouldExposeTheStallReasonOnTheReadinessBody() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var stallThreshold = AppEnvironment.Instance.JOB_QUEUE_DRAIN_STALL_SECONDS;

		try {
			await InsertStalledPendingJobAsync(db, stallThreshold);

			using var response = await _http.GetAsync("/health");
			var report = await response.Content.ReadFromJsonAsync<HealthReportJson>();

			report.Should().NotBeNull();
			Assert.NotNull(report);
			report.Status.Should().Be("Unhealthy");
			var drainCheck = report.Checks?.FirstOrDefault(check =>
				check.Name == "job_queue_drain");
			drainCheck.Should().NotBeNull("the failing check is present in the report");
			Assert.NotNull(drainCheck);
			drainCheck.Description.Should().Contain(
				PublishingJobs.PublishPublicationV1JobType,
				"the stuck job type is named in the rendered state"
			);
			drainCheck.Description.Should().Contain(
				"APP_ROLE=worker",
				"the next action is named in plain words"
			);
		} finally {
			await db.JobQueue.ExecuteDeleteAsync();
		}
	}

	// A REAL due job enqueued exactly as publish-now does (the trusted boundary),
	// then backdated past the stall threshold so it reads as stranded.
	private static async Task InsertStalledPendingJobAsync(
		AppDbContext db,
		int stallThresholdSeconds
	) {
		var backdated = DateTime.UtcNow.AddSeconds(-(stallThresholdSeconds + 60));

		var stalled = new JobQueueItem {
			JobType = PublishingJobs.PublishPublicationV1JobType,
			Status = JobQueueStatus.Pending,
			NextAttemptAt = backdated,
		};
		db.JobQueue.Add(stalled);
		await db.SaveChangesAsync();
	}

	private sealed class HealthReportJson {
		public string? Status { get; set; }
		public IReadOnlyList<HealthCheckJson>? Checks { get; set; }
	}

	private sealed class HealthCheckJson {
		public string? Name { get; set; }
		public string? Status { get; set; }
		public string? Description { get; set; }
	}
}
