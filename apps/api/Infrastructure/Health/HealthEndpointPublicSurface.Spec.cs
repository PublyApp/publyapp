using System.Net;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Publishing.Jobs;

using Xunit;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Public surface of the health endpoints (issue #2037): the JSON written on
/// <c>/health/ready</c>, <c>/health</c>, and <c>/health/drain</c> is
/// unauthenticated and rate-limit exempt, so it must NEVER leak internal naming
/// (job type strings, table names, environment variables, deployment commands,
/// queue depth, or age). The house rule
/// about naming a failure cause in plain words is about the operator, not about
/// publishing internals to anyone: this spec pins the public surface to
/// product-language sentences only and proves the operational detail still
/// reaches the protected logs where an operator can read it.
///
/// <p>Every assertion runs against the REAL health endpoints of the integration
/// host, over a REAL database row.
/// </summary>
public sealed class HealthEndpointPublicSurfaceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;

	public HealthEndpointPublicSurfaceSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task ItShouldUseOnlyThePublicHealthSchemaOnHealthyEndpoints() {
		foreach (var path in new[] { "/health/ready", "/health", "/health/drain" }) {
			using var response = await _http.GetAsync(path);
			var body = await response.Content.ReadAsStringAsync();

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			HealthTestHelper.AssertPublicHealthBody(body);
		}
	}

	[Fact]
	public async Task ItShouldRefuseDrainButPublishNoInternalNamingWhenDueJobsStayUnclaimed() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var stallThreshold = AppEnvironment.Instance.JOB_QUEUE_DRAIN_STALL_SECONDS;

		try {
			await InsertStalledPendingJobAsync(db, stallThreshold);

			using var response = await _http.GetAsync("/health/drain");
			var body = await response.Content.ReadAsStringAsync();
			HealthTestHelper.AssertPublicHealthBody(body);
			var report = JsonSerializer.Deserialize<HealthTestHelper.HealthReportJson>(
				body,
				HealthTestHelper.JsonOptions
			);

			response.StatusCode.Should().Be(
				HttpStatusCode.ServiceUnavailable,
				"the drain surface must still refuse when the worker is down"
			);
			report.Should().NotBeNull();
			Assert.NotNull(report);

			// Useful for an uptime monitor: the failing check is named AND the cause
			// is stated in plain words — the house rule #1716 still applies.
			report.Status.Should().Be("Unhealthy");
			var drainCheck = report.Checks?.FirstOrDefault(check =>
				check.Name == "scheduled publication delivery");
			drainCheck.Should().NotBeNull(
				"the failing check is still present in the public report"
			);
			Assert.NotNull(drainCheck);
			drainCheck.Status.Should().Be(
				"Unhealthy",
				"per-check status stays accurate for a probing monitor"
			);
			drainCheck.Description.Should().NotBeNullOrWhiteSpace(
				"the cause is named for an operator, but in product language — never as raw internals"
			);

			drainCheck.Description.Should().Be("Scheduled publications are not being sent.");
		} finally {
			await db.JobQueue.ExecuteDeleteAsync();
		}
	}

	[Fact]
	public async Task ItShouldPublishNoInternalNamingOnTheReadinessBodyWhenMigrationsArePending() {
		using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var migrations = dbContext.Database.GetMigrations().ToList();
		migrations.Should().HaveCountGreaterThan(1);

		var migrator = dbContext.Database.GetService<IMigrator>();
		var previousMigration = migrations[^2];
		var latestMigration = migrations[^1];

		await migrator.MigrateAsync(previousMigration);
		try {
			using var ready = await _http.GetAsync("/health/ready");
			ready.StatusCode.Should().Be(
				HttpStatusCode.ServiceUnavailable,
				"readiness must still refuse while a migration is pending"
			);

			using var aggregate = await _http.GetAsync("/health");
			aggregate.StatusCode.Should().Be(
				HttpStatusCode.ServiceUnavailable,
				"the /health aggregate follows the readiness verdict"
			);

			var readyBody = await ready.Content.ReadAsStringAsync();
			var aggregateBody = await aggregate.Content.ReadAsStringAsync();
			HealthTestHelper.AssertPublicHealthBody(readyBody);
			HealthTestHelper.AssertPublicHealthBody(aggregateBody);
			var readyReport = JsonSerializer.Deserialize<HealthTestHelper.HealthReportJson>(
				readyBody,
				HealthTestHelper.JsonOptions
			);
			var aggregateReport = JsonSerializer.Deserialize<HealthTestHelper.HealthReportJson>(
				aggregateBody,
				HealthTestHelper.JsonOptions
			);

			Assert.NotNull(readyReport);
			Assert.NotNull(aggregateReport);
			var readyMigrationCheck = readyReport.Checks?.FirstOrDefault(check =>
				check.Name == "application readiness");
			var aggregateMigrationCheck = aggregateReport.Checks?.FirstOrDefault(check =>
				check.Name == "application readiness");
			Assert.NotNull(readyMigrationCheck);
			Assert.NotNull(aggregateMigrationCheck);
			readyMigrationCheck.Description.Should().Be(
				"The application is not ready to serve traffic yet."
			);
			aggregateMigrationCheck.Description.Should().Be(
				"The application is not ready to serve traffic yet."
			);
		} finally {
			await migrator.MigrateAsync(latestMigration);
		}
	}

	[Fact]
	public async Task ItShouldUseAGenericSafeSummaryForAnUnknownHealthRegistration() {
		var context = new DefaultHttpContext();
		context.Response.Body = new MemoryStream();
		var report = new HealthReport(
			new Dictionary<string, HealthReportEntry> {
				["internal_registration_name"] = new HealthReportEntry(
					HealthStatus.Unhealthy,
					"count=9 age=80",
					TimeSpan.Zero,
					exception: new InvalidOperationException("internal exception"),
					data: new Dictionary<string, object> {
						["count"] = 9,
						["age"] = 80,
					}
				),
				[HealthCheckMessages.DatabaseMigrationRegistrationName] = new HealthReportEntry(
					HealthStatus.Unhealthy,
					"Database schema migration 20260905_add_secret is pending.",
					TimeSpan.Zero,
					exception: new InvalidOperationException("internal database exception"),
					data: new Dictionary<string, object> {
						["pendingMigrationCount"] = 1,
					}
				),
			},
			TimeSpan.Zero
		);

		await HealthResponseWriter.WriteAsync(context, report);
		context.Response.Body.Position = 0;
		var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

		HealthTestHelper.AssertPublicHealthBody(body);
		using var document = JsonDocument.Parse(body);
		var descriptions = document.RootElement
			.GetProperty("checks")
			.EnumerateArray()
			.Select(check => check.GetProperty("description").GetString())
			.ToArray();
		descriptions
			.Should()
			.HaveCount(2)
			.And.OnlyContain(
				description => description == "The application health status is unavailable."
			);
	}

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
}
