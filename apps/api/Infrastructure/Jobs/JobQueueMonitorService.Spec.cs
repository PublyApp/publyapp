using System.Data.Common;
using System.Diagnostics.Metrics;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Threshold evaluation is proven both by the returned breach codes AND by the actual
// structured WARNING logs (a capturing logger). Sampling + the observable gauges are proven
// against seeded queue states with exact numbers (baseline delta + gauge==sample equality)
// read back through a MeterListener. The live sampler is removed from the test host
// (ApiFactory) so this spec's monitor owns the only gauge set (design §7.2).
public sealed class JobQueueMonitorServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public JobQueueMonitorServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// --- threshold alerting: returned breach codes (pure) -------------------------------

	[Fact]
	public void ItShouldAlertWhenDueDepthExceedsThresholdAndStaySilentAtOrBelow() {
		using var monitor = CreateMonitor();

		monitor.EvaluateAndAlert(
			JobQueueSample.Empty with { DueDepthBulk = JobQueueMonitorService.DueDepthWarnThreshold + 1 }
		).Should().Contain("due_depth");

		monitor.EvaluateAndAlert(
			JobQueueSample.Empty with { DueDepthBulk = JobQueueMonitorService.DueDepthWarnThreshold }
		).Should().NotContain("due_depth");
	}

	[Fact]
	public void ItShouldAlertWhenOldestHighPriorityAgeExceedsItsThreshold() {
		using var monitor = CreateMonitor();

		monitor.EvaluateAndAlert(
			JobQueueSample.Empty with {
				OldestDueAgeSecondsHigh = JobQueueMonitorService.OldestAgeHighWarnSeconds + 1
			}
		).Should().Contain("oldest_due_age_high");

		// The same age is silent for the bulk class (its threshold is far higher).
		monitor.EvaluateAndAlert(
			JobQueueSample.Empty with {
				OldestDueAgeSecondsBulk = JobQueueMonitorService.OldestAgeHighWarnSeconds + 1
			}
		).Should().NotContain("oldest_due_age_bulk");
	}

	[Fact]
	public void ItShouldAlertWhenOldestBulkPriorityAgeExceedsItsThreshold() {
		using var monitor = CreateMonitor();

		monitor.EvaluateAndAlert(
			JobQueueSample.Empty with {
				OldestDueAgeSecondsBulk = JobQueueMonitorService.OldestAgeBulkWarnSeconds + 1
			}
		).Should().Contain("oldest_due_age_bulk");
	}

	[Fact]
	public void ItShouldAlertWhenTheDeadLetterQueueGrewInTheLastHour() {
		using var monitor = CreateMonitor();

		monitor.EvaluateAndAlert(JobQueueSample.Empty with { DeadLetterGrowth1h = 1 })
			.Should().Contain("dlq_growth");
		monitor.EvaluateAndAlert(JobQueueSample.Empty with { DeadLetterGrowth1h = 0 })
			.Should().NotContain("dlq_growth");
	}

	// #864/K-2: rows retention HOLDS past its window because nobody has triaged them.
	// Same anomaly semantics as dlq_growth — re-breaches every sample while > 0, silent at 0.
	[Fact]
	public void ItShouldAlertWhileUntriagedMissingRowsAreHeldAndStaySilentAtZero() {
		using var monitor = CreateMonitor();

		monitor.EvaluateAndAlert(JobQueueSample.Empty with { MissingTriagedCount = 1 })
			.Should().Contain("dlq_untriaged_missing");
		monitor.EvaluateAndAlert(JobQueueSample.Empty with { MissingTriagedCount = 5 })
			.Should().Contain(
				"dlq_untriaged_missing",
				"the condition re-breaches on every sample while any row remains held"
			);
		monitor.EvaluateAndAlert(JobQueueSample.Empty)
			.Should().NotContain("dlq_untriaged_missing");
	}

	[Fact]
	public void ItShouldAlertOnProcessingOverLeaseOnlyAfterThreeConsecutiveSamples() {
		using var monitor = CreateMonitor();
		var breached = JobQueueSample.Empty with { ProcessingOverLeaseCount = 1 };

		monitor.EvaluateAndAlert(breached).Should().NotContain("processing_over_lease");
		monitor.EvaluateAndAlert(breached).Should().NotContain("processing_over_lease");
		monitor.EvaluateAndAlert(breached).Should().Contain(
			"processing_over_lease", "a sustained over-lease condition alerts on the 3rd sample"
		);

		// A clean sample resets the streak, silencing the alert again.
		monitor.EvaluateAndAlert(JobQueueSample.Empty).Should().NotContain("processing_over_lease");
		monitor.EvaluateAndAlert(breached).Should().NotContain("processing_over_lease");
	}

	// --- threshold alerting: actual structured warning logs ------------------------------

	[Fact]
	public void ItShouldLogAWarningWithPropertiesAboveThresholdAndNothingBelow() {
		var logger = new CapturingLogger<JobQueueMonitorService>();
		using var monitor = new JobQueueMonitorService(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			logger,
			new SchedulerSyncState()
		);

		var overBy = JobQueueMonitorService.DueDepthWarnThreshold + 1;
		monitor.EvaluateAndAlert(JobQueueSample.Empty with { DueDepthBulk = overBy });

		var warning = logger.Warnings.Should().ContainSingle(
			"exactly one threshold (due_depth) is breached"
		).Subject;
		warning.Message.Should().Contain("due_depth");
		warning.State.Should().Contain(
			kvp => kvp.Key == "DueDepth" && Equals(kvp.Value, (long)overBy),
			"the warning carries the breached value as a structured property"
		);
		warning.State.Should().Contain(
			kvp => kvp.Key == "Threshold"
				&& Equals(kvp.Value, JobQueueMonitorService.DueDepthWarnThreshold),
			"the warning carries the threshold as a structured property"
		);

		logger.Clear();
		monitor.EvaluateAndAlert(
			JobQueueSample.Empty with { DueDepthBulk = JobQueueMonitorService.DueDepthWarnThreshold }
		);
		logger.Warnings.Should().BeEmpty("no threshold breached ⇒ no warning is logged");
	}

	// --- sampling + gauges (DB + MeterListener) -----------------------------------------

	[Fact]
	public async Task ItShouldSampleSeededQueueStateAndEmitMatchingGauges() {
		var jobType = $"spec.monitor.{Guid.NewGuid():N}";
		var recipient = $"{jobType}@example.com";
		await using var dbContext = await CreateDbContextAsync();
		using var monitor = CreateMonitor();

		try {
			// Baseline captures ambient rows; the delta after seeding is the EXACT seeded
			// count regardless of what else lives in the shared queue.
			var before = await monitor.SampleAsync(dbContext, CancellationToken.None);

			await SeedDueHighAsync(dbContext, jobType, count: 4);
			await SeedDueBulkAsync(dbContext, jobType, count: 5);
			await SeedProcessingOverLeaseAsync(dbContext, jobType, count: 2);
			await SeedDeadLetterAsync(dbContext, jobType, count: 3);
			await SeedEmailFailureAsync(dbContext, recipient);

			var after = await monitor.SampleAsync(dbContext, CancellationToken.None);

			// Time-window and queue values are exact; DLQ size is a non-negative catalog
			// estimate and is therefore asserted independently below.
			after.DueDepthHigh.Should().Be(before.DueDepthHigh + 4);
			after.DueDepthBulk.Should().Be(before.DueDepthBulk + 5);
			after.ProcessingOverLeaseCount.Should().Be(before.ProcessingOverLeaseCount + 2);
			after.DeadLetterSize.Should().BeGreaterThanOrEqualTo(
				0, "the approximate catalog size is never negative"
			);
			after.DeadLetterGrowth1h.Should().Be(before.DeadLetterGrowth1h + 3);
			after.EmailLogFailures1h.Should().Be(before.EmailLogFailures1h + 1);
			after.OldestDueAgeSecondsHigh.Should().BeGreaterThan(
				0, "a due row aged 5 minutes in the past has positive age"
			);
			after.OldestDueAgeSecondsBulk.Should().BeGreaterThan(
				0, "a due bulk row aged 5 minutes in the past has positive age"
			);

			// Every gauge/tag series emits exactly the sampled value (ten series total).
			var gauges = ReadGauges();
			gauges.DueHigh.Should().Be(after.DueDepthHigh);
			gauges.DueBulk.Should().Be(after.DueDepthBulk);
			gauges.OverLease.Should().Be(after.ProcessingOverLeaseCount);
			gauges.DlqSize.Should().Be(after.DeadLetterSize);
			gauges.DlqGrowth.Should().Be(after.DeadLetterGrowth1h);
			gauges.EmailFailures.Should().Be(after.EmailLogFailures1h);
			gauges.DeadTuples.Should().Be(after.JobQueueDeadTuples);
			gauges.OldestHigh.Should().Be(after.OldestDueAgeSecondsHigh);
			gauges.OldestBulk.Should().Be(after.OldestDueAgeSecondsBulk);
		} finally {
			await DeleteByTypeAsync(jobType, recipient);
		}
	}

	[Fact]
	public async Task ItShouldReadAQueueSampleWithOneCoherentAggregateStatement() {
		var interceptor = new CountingCommandInterceptor();
		await using var dbContext = await CreateDbContextAsync(interceptor);
		using var monitor = CreateMonitor();

		await monitor.SampleAsync(dbContext, CancellationToken.None);

		interceptor.ReaderCommandCount.Should().Be(
			1, "all queue-health values must share one PostgreSQL statement snapshot"
		);
		interceptor.LastReaderCommandText.Should().Contain(
			"reltuples", "DLQ size must avoid an exact full-table count every minute"
		);
		interceptor.LastReaderCommandText.Should().MatchRegex(
			@"FROM job_dead_letter\s+WHERE failed_at",
			"DLQ growth must remain an indexable one-hour range query"
		);
	}

	// #864/K-2, sampled end to end: a durable untriaged missing-anomaly row shows up in
	// the sample's MissingTriagedCount and the jobs.dlq.untriaged_missing gauge with the
	// exact seeded delta — triaging it (the acknowledgement stamp) drops both back.
	[Fact]
	public async Task ItShouldSampleAndEmitTheUntriagedMissingCountUntilTriaged() {
		var jobType = $"{JobDeadLetter.MissingJobTypePrefix}spec.monitor-missing.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		using var monitor = CreateMonitor();

		try {
			var before = await monitor.SampleAsync(dbContext, CancellationToken.None);

			await SeedDeadLetterAsync(dbContext, jobType, count: 2);
			var held = await monitor.SampleAsync(dbContext, CancellationToken.None);

			held.MissingTriagedCount.Should().Be(
				before.MissingTriagedCount + 2,
				"two durable untriaged missing-anomaly rows are counted exactly"
			);
			ReadGauges().UntriagedMissing.Should().Be(held.MissingTriagedCount);

			// The operator acknowledgement releases them from the held set (#636 will be
			// the real writer; here the stamp itself is what is under test).
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE job_dead_letter
				SET triaged_at = now(), triaged_by = 'spec'
				WHERE job_type = {jobType}
				"""
			);
			var released = await monitor.SampleAsync(dbContext, CancellationToken.None);

			released.MissingTriagedCount.Should().Be(
				before.MissingTriagedCount,
				"triage empties the held set — the alert recovers only then"
			);
		} finally {
			await DeleteByTypeAsync(jobType, $"spec.monitor-cleanup.{Guid.NewGuid():N}@example.com");
		}
	}

	[Fact]
	public async Task ItShouldRecoverAfterASampleErrorAndStopDuringAControlledDelay() {
		var innerScopeFactory = _fixture.Factory.Services
			.GetRequiredService<IServiceScopeFactory>();
		var scopeFactory = new FailingOnceScopeFactory(innerScopeFactory);
		var logger = new CapturingLogger<JobQueueMonitorService>();
		var secondDelayEntered = new TaskCompletionSource(
			TaskCreationOptions.RunContinuationsAsynchronously
		);
		var delayCalls = 0;

		async Task ControlledDelay(TimeSpan delay, CancellationToken cancellationToken) {
			delay.Should().Be(TimeSpan.FromSeconds(60));
			if (Interlocked.Increment(ref delayCalls) == 1) {
				return;
			}

			secondDelayEntered.TrySetResult();
			await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
		}

		using var monitor = new JobQueueMonitorService(
			scopeFactory, logger, new SchedulerSyncState(), ControlledDelay
		);
		await monitor.StartAsync(CancellationToken.None);
		await secondDelayEntered.Task.WaitAsync(TimeSpan.FromSeconds(10));
		await monitor.StopAsync(CancellationToken.None);

		scopeFactory.Attempts.Should().BeGreaterThanOrEqualTo(
			2, "the loop retries after the first sample error"
		);
		logger.Warnings.Should().ContainSingle(
			entry => entry.Message.Contains("sample failed", StringComparison.Ordinal)
		);
	}

	// --- helpers ------------------------------------------------------------------------

	private sealed record GaugeReadings(
		long DueHigh,
		long DueBulk,
		double OldestHigh,
		double OldestBulk,
		long OverLease,
		long DlqSize,
		long DlqGrowth,
		long EmailFailures,
		long DeadTuples,
		long UntriagedMissing
	);

	private static GaugeReadings ReadGauges() {
		using var listener = new MeterListener();
		long dueHigh = -1;
		long dueBulk = -1;
		long overLease = -1;
		long dlqSize = -1;
		long dlqGrowth = -1;
		long emailFailures = -1;
		long deadTuples = -1;
		long untriagedMissing = -1;
		var oldestHigh = -1.0;
		var oldestBulk = -1.0;

		listener.InstrumentPublished = (instrument, activeListener) => {
			if (instrument.Meter.Name != JobsMetrics.MeterName) {
				return;
			}

			if (instrument.Name is "jobs.due_depth" or "jobs.oldest_due_age_seconds"
				or "jobs.processing_over_lease" or "jobs.dlq_size" or "jobs.dlq_growth_1h"
				or "jobs.dlq.untriaged_missing"
				or "email.log_failures_1h" or "jobs.queue_dead_tuples") {
				activeListener.EnableMeasurementEvents(instrument);
			}
		};
		listener.SetMeasurementEventCallback<long>((instrument, measurement, tags, state) => {
			if (instrument.Name == "jobs.due_depth") {
				if (TagClass(tags) == "high") {
					dueHigh = measurement;
				} else if (TagClass(tags) == "bulk") {
					dueBulk = measurement;
				}
			} else if (instrument.Name == "jobs.processing_over_lease") {
				overLease = measurement;
			} else if (instrument.Name == "jobs.dlq_size") {
				dlqSize = measurement;
			} else if (instrument.Name == "jobs.dlq_growth_1h") {
				dlqGrowth = measurement;
			} else if (instrument.Name == "email.log_failures_1h") {
				emailFailures = measurement;
			} else if (instrument.Name == "jobs.queue_dead_tuples") {
				deadTuples = measurement;
			} else if (instrument.Name == "jobs.dlq.untriaged_missing") {
				untriagedMissing = measurement;
			}
		});
		listener.SetMeasurementEventCallback<double>((instrument, measurement, tags, state) => {
			if (instrument.Name == "jobs.oldest_due_age_seconds") {
				if (TagClass(tags) == "high") {
					oldestHigh = measurement;
				} else if (TagClass(tags) == "bulk") {
					oldestBulk = measurement;
				}
			}
		});

		listener.Start();
		listener.RecordObservableInstruments();

		return new GaugeReadings(
			dueHigh,
			dueBulk,
			oldestHigh,
			oldestBulk,
			overLease,
			dlqSize,
			dlqGrowth,
			emailFailures,
			deadTuples,
			untriagedMissing
		);
	}

	private static string? TagClass(ReadOnlySpan<KeyValuePair<string, object?>> tags) {
		foreach (var tag in tags) {
			if (tag.Key == "priority_class") {
				return tag.Value as string;
			}
		}

		return null;
	}

	// --- G-12: leader observability (design §7.2 / R2-10) -------------------------------

	// The Phase-3 gate, stated exactly: the pg_locks probe must report leader absence
	// WITHOUT attempting the advisory lock. The PRIMARY proof is the executed SQL itself,
	// captured through the command interceptor: it must be a pg_locks catalog read with the
	// exact advisory-key predicates and must NOT call pg_try_advisory_lock / pg_advisory_lock.
	// A behavioral post-state acquire alone cannot prove this — a hostile probe could
	// try-acquire, derive presence from the result, and release before returning, passing
	// both behavioral arms. The two behavioral arms are kept below as secondary controls.
	[Fact]
	public async Task ItShouldReportLeaderAbsenceWithoutAttemptingTheAdvisoryLock() {
		var interceptor = new CountingCommandInterceptor();
		await using var dbContext = await CreateDbContextAsync(interceptor);
		using var monitor = CreateMonitor();

		var sample = await monitor.SampleAsync(dbContext, CancellationToken.None);

		// Primary proof: the exact statement the probe ran, with the FULL advisory-key
		// predicate pinned — not merely "some pg_locks read". A lock on a DIFFERENT key, a
		// different database, or a different objsubid must not be mistaken for the leader lock.
		var probeSql = interceptor.LastReaderCommandText;
		probeSql.Should().Contain(
			"pg_locks", "leader presence must be read from the pg_locks catalog (§7.2)"
		);
		probeSql.Should().Contain(
			"locktype = 'advisory'",
			"the probe must match the advisory lock class, not merely any lock"
		);
		probeSql.Should().Contain(
			"granted", "only a GRANTED advisory lock counts as a present leader"
		);
		probeSql.Should().Contain(
			"database =",
			"the probe must scope to THIS database's advisory locks, not any database's"
		);
		probeSql.Should().Contain(
			"classid =", "the high 32 bits of the leader lock key must be matched"
		);
		probeSql.Should().Contain(
			"objid =", "the low 32 bits of the leader lock key must be matched"
		);
		probeSql.Should().Contain(
			"objsubid = 1",
			"a two-argument bigint advisory lock has objsubid = 1 — pinning it stops a "
			+ "different advisory lock class from masquerading as the leader lock"
		);

		// The Phase-3 gate: NO command the probe issued may ATTEMPT the advisory lock. Assert
		// the RAW absence of the acquisition functions across the COMPLETE captured command set
		// (reader + scalar + non-query, sync and async) — a hostile implementation could
		// acquire in an earlier command and run the clean aggregate last, so inspecting only
		// the final reader is insufficient. The production query names no acquisition function,
		// so a raw absence check needs no comment stripping (which could itself be defeated).
		interceptor.AllCommands.Should().NotBeEmpty(
			"the probe must have issued at least one command to inspect"
		);
		foreach (var commandText in interceptor.AllCommands) {
			commandText.Should().NotContainEquivalentOf(
				"pg_try_advisory_lock",
				"the probe must never ATTEMPT the lock — that would let the observer take "
				+ "leadership or contend with the scheduler's connection (the Phase-3 gate)"
			);
			commandText.Should().NotContainEquivalentOf(
				"pg_advisory_lock",
				"the probe must never acquire the lock either — pg_locks is a read-only catalog"
			);
		}

		sample.LeaderPresent.Should().BeFalse(
			"no scheduler leader holds the advisory lock in this spec's cloned database"
		);

		monitor.EvaluateAndAlert(sample).Should().Contain(
			"scheduler_leader_absent",
			"leader absence is itself an alertable condition — a follower with no leader "
			+ "present is exactly the case R2-10 un-gated this sampler to cover"
		);

		// Secondary behavioral control: the probe left the lock untouched and available.
		await using var connection = new NpgsqlConnection(GetTestConnectionString());
		await connection.OpenAsync();
		await using var command = new NpgsqlCommand(
			$"SELECT pg_try_advisory_lock({SchedulerLeaderService.SchedulerLeaderLockKey})",
			connection
		);

		(await command.ExecuteScalarAsync()).Should().Be(
			true,
			"the sampler must observe leadership by reading pg_locks, never by attempting "
			+ "the lock — a probe that acquired it would block this acquire"
		);
	}

	// Non-vacuity twin of the spec above: with the lock genuinely held, the same probe
	// must read 1 and the condition must fall silent. Without this, a probe hardwired to
	// `false` would satisfy the absence assertion.
	[Fact]
	public async Task ItShouldReportLeaderPresentWhenTheAdvisoryLockIsHeld() {
		await using var dbContext = await CreateDbContextAsync();
		using var monitor = CreateMonitor();

		// A dedicated session holding the real key, standing in for a live leader.
		await using var leaderConnection = new NpgsqlConnection(GetTestConnectionString());
		await leaderConnection.OpenAsync();
		await using var acquire = new NpgsqlCommand(
			$"SELECT pg_advisory_lock({SchedulerLeaderService.SchedulerLeaderLockKey})",
			leaderConnection
		);
		await acquire.ExecuteNonQueryAsync();

		var sample = await monitor.SampleAsync(dbContext, CancellationToken.None);

		sample.LeaderPresent.Should().BeTrue(
			"the probe must see the advisory lock a live leader holds"
		);
		monitor.EvaluateAndAlert(sample).Should().NotContain(
			"scheduler_leader_absent", "a leader is present, so the condition is quiet"
		);
	}

	// A wedged-but-present leader: the lock is held, so the absence condition stays quiet,
	// but reconciliation has stopped. Staleness is what catches it.
	[Fact]
	public void ItShouldAlertWhenTheLeaderSyncGoesStaleAndStaySilentAtOrBelow() {
		using var monitor = CreateMonitor();

		var stale = JobQueueSample.Empty with {
			SchedulerSyncAgeSeconds = JobQueueMonitorService.SchedulerSyncStaleSeconds + 1,
		};
		monitor.EvaluateAndAlert(stale).Should().Contain("scheduler_sync_stale");

		var atThreshold = JobQueueSample.Empty with {
			SchedulerSyncAgeSeconds = JobQueueMonitorService.SchedulerSyncStaleSeconds,
		};
		monitor.EvaluateAndAlert(atThreshold).Should().NotContain(
			"scheduler_sync_stale", "the threshold is a strict exceedance, not an inclusive one"
		);
	}

	// A follower runs no reconcile, so it owes no sync: it must never report the leader's
	// staleness. Otherwise every follower in the fleet would alert forever.
	[Fact]
	public void ItShouldStaySilentOnSyncStalenessWhenThisReplicaIsNotTheLeader() {
		using var monitor = CreateMonitor();

		monitor.EvaluateAndAlert(
			JobQueueSample.Empty with { SchedulerSyncAgeSeconds = null }
		).Should().NotContain("scheduler_sync_stale");
	}

	// The sample's sync age is derived from the shared state the leader path writes, and
	// the three transitions have to compose: a follower owes nothing; a fresh leader is
	// measured from its election (so a leader wedged from birth still breaches rather than
	// waiting forever on a first sync that never lands); a demoted leader owes nothing
	// again, so it cannot keep alerting on the timestamp it happens to still hold.
	[Fact]
	public async Task ItShouldMeasureSyncStalenessFromElectionUntilTheFirstSyncCompletes() {
		await using var dbContext = await CreateDbContextAsync();
		var syncState = new SchedulerSyncState();
		using var monitor = new JobQueueMonitorService(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<JobQueueMonitorService>.Instance,
			syncState
		);

		(await monitor.SampleAsync(dbContext, CancellationToken.None))
			.SchedulerSyncAgeSeconds.Should().BeNull("a follower owes no sync");

		var staleBy = JobQueueMonitorService.SchedulerSyncStaleSeconds + 10;
		syncState.MarkLeadershipAcquiredAt(DateTimeOffset.UtcNow.AddSeconds(-staleBy));
		var electedSample = await monitor.SampleAsync(dbContext, CancellationToken.None);

		electedSample.SchedulerSyncAgeSeconds.Should().BeGreaterThan(
			JobQueueMonitorService.SchedulerSyncStaleSeconds,
			"a leader elected long ago that has never completed a sync is wedged, and "
			+ "measuring from election is what makes that visible"
		);
		monitor.EvaluateAndAlert(electedSample).Should().Contain("scheduler_sync_stale");

		syncState.MarkSyncCompleted();
		var syncedSample = await monitor.SampleAsync(dbContext, CancellationToken.None);

		syncedSample.SchedulerSyncAgeSeconds.Should().BeLessThan(
			JobQueueMonitorService.SchedulerSyncStaleSeconds,
			"a completed reconcile resets the baseline"
		);
		monitor.EvaluateAndAlert(syncedSample).Should().NotContain("scheduler_sync_stale");

		syncState.MarkLeadershipLost();
		(await monitor.SampleAsync(dbContext, CancellationToken.None))
			.SchedulerSyncAgeSeconds.Should().BeNull(
				"a demoted replica owes no sync and must stop reporting staleness"
			);
	}

	// The scheduler gauges observed through a MeterListener, INCLUDING the pre-sample edge:
	// scheduler.leader_present must emit NOTHING while leader presence is unknown (never a
	// fabricated healthy 1), then 0 for a real absent probe; scheduler.last_sync_at must
	// stay silent until this replica leads AND has completed a sync.
	[Fact]
	public async Task ItShouldEmitSchedulerGaugesOnlyWhenKnownAndNeverFabricateAHealthyLeader() {
		await using var dbContext = await CreateDbContextAsync();
		var syncState = new SchedulerSyncState();
		using var monitor = new JobQueueMonitorService(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<JobQueueMonitorService>.Instance,
			syncState
		);

		// Pre-sample: presence is UNKNOWN — the gauge emits no measurement, and sync is owed
		// by no one, so its gauge is silent too.
		var before = ReadSchedulerGauges();
		before.LeaderPresent.Should().BeNull(
			"before any probe completes, leader presence is unknown — the gauge must emit "
			+ "nothing rather than a fabricated healthy 1"
		);
		before.LastSyncAt.Should().BeNull("no leadership yet ⇒ no last_sync_at series");

		// A real probe against this cloned DB (no leader) emits 0 — from the probe, not a
		// pre-sample default.
		await monitor.SampleAsync(dbContext, CancellationToken.None);
		ReadSchedulerGauges().LeaderPresent.Should().Be(
			0, "an absent leader reads 0 from a real pg_locks probe, never a fabricated value"
		);

		// last_sync_at appears only once this replica leads and has completed a sync.
		syncState.MarkLeadershipAcquired();
		syncState.MarkSyncCompleted();
		ReadSchedulerGauges().LastSyncAt.Should().NotBeNull(
			"a completed reconcile under leadership publishes scheduler.last_sync_at"
		);
	}

	private sealed record SchedulerGaugeReadings(int? LeaderPresent, long? LastSyncAt);

	private static SchedulerGaugeReadings ReadSchedulerGauges() {
		using var listener = new MeterListener();
		int? leaderPresent = null;
		long? lastSyncAt = null;

		listener.InstrumentPublished = (instrument, activeListener) => {
			if (instrument.Meter.Name != JobsMetrics.MeterName) {
				return;
			}

			if (instrument.Name is "scheduler.leader_present" or "scheduler.last_sync_at") {
				activeListener.EnableMeasurementEvents(instrument);
			}
		};
		listener.SetMeasurementEventCallback<int>((instrument, measurement, tags, state) => {
			if (instrument.Name == "scheduler.leader_present") {
				leaderPresent = measurement;
			}
		});
		listener.SetMeasurementEventCallback<long>((instrument, measurement, tags, state) => {
			if (instrument.Name == "scheduler.last_sync_at") {
				lastSyncAt = measurement;
			}
		});

		listener.Start();
		listener.RecordObservableInstruments();

		return new SchedulerGaugeReadings(leaderPresent, lastSyncAt);
	}

	// --- #865: prepared-state sweep-lag observability ------------------------------------

	// The eligible-vs-deleted gap, sampled from the durable table (R6-4's rule): the age of
	// the OLDEST prepared-send row that is already deletable — a resolved-job orphan past
	// the retention floor — yet still on disk. Healthy: oscillates between 0 and the
	// seeded 10-minute cadence. A disabled or failing sweep drives it up forever; the
	// EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES threshold turns that into an alert.
	[Fact]
	public async Task ItShouldSamplePreparedStateOverdueSecondsFromTheOldestDeletableOrphan() {
		var marker = $"spec.monitor-prepared.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		using var monitor = CreateMonitor();

		try {
			var orphanJobId = Guid.NewGuid();
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO email_prepared_sends
					(job_id, envelope, request_sha256, provider_idempotency_key, prepared_at)
				VALUES (
					{orphanJobId}, {EmptyJson}::jsonb, 'sha', {marker},
					now() - make_interval(days => {OverdueFloorDays}, mins => {OverdueMinutes})
				)
				"""
			);

			var after = await monitor.SampleAsync(dbContext, CancellationToken.None);

			var floorSeconds = OverdueFloorDays * 24 * 60 * 60;
			after.PreparedStateOverdueSeconds.Should().BeGreaterThanOrEqualTo(
				floorSeconds + (OverdueMinutes * 60) - 30,
				"the sampled gauge carries the age of the oldest deletable prepared row "
				+ "(retention floor + the extra minutes it has been waiting)"
			);
			after.PreparedStateOverdueSeconds.Should().BeLessThanOrEqualTo(
				floorSeconds + ((OverdueMinutes + 5) * 60),
				"sampling must not fabricate overdue ages far above the oldest real row"
			);
		} finally {
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM email_prepared_sends WHERE provider_idempotency_key = {marker}"
			);
		}
	}

	// A young orphan (inside its retention floor) is NOT overdue: nothing is deletable, so
	// the gap reads 0 — a lagging-but-healthy sweep must not page anyone.
	[Fact]
	public async Task ItShouldReadZeroPreparedStateOverdueWhenNothingIsEligibleForDeletion() {
		var marker = $"spec.monitor-young.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		using var monitor = CreateMonitor();

		try {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO email_prepared_sends
					(job_id, envelope, request_sha256, provider_idempotency_key, prepared_at)
				VALUES (
					{Guid.NewGuid()}, {EmptyJson}::jsonb, 'sha', {marker}, now()
				)
				"""
			);

			(await monitor.SampleAsync(dbContext, CancellationToken.None))
				.PreparedStateOverdueSeconds.Should().Be(
					0, "a row inside its retention floor is not deletable, so nothing is overdue"
				);
		} finally {
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM email_prepared_sends WHERE provider_idempotency_key = {marker}"
			);
		}
	}

	// The alert boundary, pinned exactly at the configured lag threshold (strict exceedance):
	// above it the sample breaches with the cause and next action named in the WARNING;
	// at/below it stays silent.
	[Fact]
	public void ItShouldAlertOnPreparedStateSweepLagOnlyPastTheConfiguredThreshold() {
		var logger = new CapturingLogger<JobQueueMonitorService>();
		var thresholdSeconds =
			AppEnvironment.Instance.EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES * 60;

		var capturingMonitor = new JobQueueMonitorService(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			logger,
			new SchedulerSyncState()
		);

		capturingMonitor.EvaluateAndAlert(
			JobQueueSample.Empty with { PreparedStateOverdueSeconds = thresholdSeconds + 1 }
		).Should().Contain("prepared_state_sweep_overdue");
		logger.Warnings.Should().ContainSingle(
			entry => entry.Message.Contains("prepared", StringComparison.OrdinalIgnoreCase),
			"the warning names the lagging prepared-state sweep"
		);

		logger.Clear();
		capturingMonitor.EvaluateAndAlert(
			JobQueueSample.Empty with { PreparedStateOverdueSeconds = thresholdSeconds }
		).Should().NotContain(
			"prepared_state_sweep_overdue",
			"the threshold is a strict exceedance — at-threshold is not yet a breach"
		);
	}

	// The overdue gauge emits the sampled value through the meter like every other §7.2
	// signal — no series, no alerting backend can read what the sampler never emits.
	[Fact]
	public async Task ItShouldEmitThePreparedStateOverdueGaugeWithTheSampledValue() {
		var marker = $"spec.monitor-gauge.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		using var monitor = CreateMonitor();

		try {
			var orphanJobId = Guid.NewGuid();
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO email_prepared_sends
					(job_id, envelope, request_sha256, provider_idempotency_key, prepared_at)
				VALUES (
					{orphanJobId}, {EmptyJson}::jsonb, 'sha', {marker},
					now() - make_interval(days => {OverdueFloorDays}, mins => {OverdueMinutes})
				)
				"""
			);

			var sample = await monitor.SampleAsync(dbContext, CancellationToken.None);
			ReadOverdueGauge().Should().Be(
				sample.PreparedStateOverdueSeconds,
				"the observable gauge observes the latest sample, exactly like jobs.dlq_size"
			);
		} finally {
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM email_prepared_sends WHERE provider_idempotency_key = {marker}"
			);
		}
	}

	private static double ReadOverdueGauge() {
		using var listener = new MeterListener();
		// NaN, never -1: the unsampled sample member defaults to -1, so a -1 listener seed
		// could coincide with it and fake a pass before the gauge exists.
		var overdue = double.NaN;

		listener.InstrumentPublished = (instrument, activeListener) => {
			if (instrument.Meter.Name == JobsMetrics.MeterName
				&& instrument.Name == "jobs.prepared_state_overdue_seconds") {
				activeListener.EnableMeasurementEvents(instrument);
			}
		};
		listener.SetMeasurementEventCallback<double>((instrument, measurement, tags, state) => {
			if (instrument.Name == "jobs.prepared_state_overdue_seconds") {
				overdue = measurement;
			}
		});

		listener.Start();
		listener.RecordObservableInstruments();

		return overdue;
	}

	private const int OverdueFloorDays = 7;

	// Extra minutes past the floor the seeded orphan has been waiting, comfortably inside a
	// healthy cadence gap so the assertion never straddles the alert threshold.
	private const int OverdueMinutes = 5;

	private JobQueueMonitorService CreateMonitor() {
		return new JobQueueMonitorService(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<JobQueueMonitorService>.Instance,
			new SchedulerSyncState()
		);
	}

	private string GetTestConnectionString() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return connectionString;
	}

	private static async Task SeedDueHighAsync(
		AppDbContext dbContext,
		string jobType,
		int count
	) {
		for (var i = 0; i < count; i++) {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO job_queue (job_type, priority, status, next_attempt_at)
				VALUES ({jobType}, 100, 0, now() - interval '5 minutes')
				"""
			);
		}
	}

	private static async Task SeedDueBulkAsync(
		AppDbContext dbContext,
		string jobType,
		int count
	) {
		for (var i = 0; i < count; i++) {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO job_queue (job_type, priority, status, next_attempt_at)
				VALUES ({jobType}, 10, 0, now() - interval '5 minutes')
				"""
			);
		}
	}

	private static async Task SeedProcessingOverLeaseAsync(
		AppDbContext dbContext,
		string jobType,
		int count
	) {
		for (var i = 0; i < count; i++) {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO job_queue (job_type, priority, status, locked_until)
				VALUES ({jobType}, 100, 1, now() - interval '1 minute')
				"""
			);
		}
	}

	private const string EmptyJson = "{}";

	private static async Task SeedDeadLetterAsync(
		AppDbContext dbContext,
		string jobType,
		int count
	) {
		for (var i = 0; i < count; i++) {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO job_dead_letter
					(original_job_id, job_type, payload, priority, max_attempts, attempts,
					 enqueued_at, failed_at)
				VALUES (uuidv7(), {jobType}, {EmptyJson}::jsonb, 0, 10, 10, now(), now())
				"""
			);
		}
	}

	private static async Task SeedEmailFailureAsync(
		AppDbContext dbContext,
		string recipient
	) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO email_log (kind, recipient, outcome, occurred_at)
			VALUES (
				{(int)EmailKind.StaffInvitation},
				{recipient},
				{(int)EmailLogOutcome.PermanentlyFailed},
				now()
			)
			"""
		);
	}

	private async Task DeleteByTypeAsync(string jobType, string recipient) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobType}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type = {jobType}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM email_log WHERE recipient = {recipient}"
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync(
		params IInterceptor[] interceptors
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql(connectionString);
		if (interceptors.Length > 0) {
			options.AddInterceptors(interceptors);
		}

		return new AppDbContext(options.Options);
	}

	// Records EVERY command text across reader/scalar/non-query, sync AND async, so an
	// absence assertion covers the complete set of statements a probe issued — not just the
	// last reader, which a hostile implementation could keep clean while acquiring the lock in
	// an earlier scalar/non-query command. ReaderCommandCount / LastReaderCommandText stay for
	// the one-statement and predicate-pinning assertions.
	private sealed class CountingCommandInterceptor : DbCommandInterceptor {
		private readonly List<string> _commands = [];
		private readonly Lock _gate = new();

		public int ReaderCommandCount { get; private set; }
		public string LastReaderCommandText { get; private set; } = string.Empty;

		public IReadOnlyList<string> AllCommands {
			get {
				lock (_gate) {
					return _commands.ToList();
				}
			}
		}

		private void CaptureReader(DbCommand command) {
			lock (_gate) {
				ReaderCommandCount++;
				LastReaderCommandText = command.CommandText;
				_commands.Add(command.CommandText);
			}
		}

		private void Capture(DbCommand command) {
			lock (_gate) {
				_commands.Add(command.CommandText);
			}
		}

		public override InterceptionResult<DbDataReader> ReaderExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result
		) {
			CaptureReader(command);
			return result;
		}

		public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result,
			CancellationToken cancellationToken = default
		) {
			CaptureReader(command);
			return ValueTask.FromResult(result);
		}

		public override InterceptionResult<object> ScalarExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result
		) {
			Capture(command);
			return result;
		}

		public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result,
			CancellationToken cancellationToken = default
		) {
			Capture(command);
			return ValueTask.FromResult(result);
		}

		public override InterceptionResult<int> NonQueryExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result
		) {
			Capture(command);
			return result;
		}

		public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			Capture(command);
			return ValueTask.FromResult(result);
		}
	}

	private sealed class FailingOnceScopeFactory : IServiceScopeFactory {
		private readonly IServiceScopeFactory _inner;

		public FailingOnceScopeFactory(IServiceScopeFactory inner) {
			_inner = inner;
		}

		public int Attempts { get; private set; }

		public IServiceScope CreateScope() {
			Attempts++;
			if (Attempts == 1) {
				throw new InvalidOperationException("expected first-cycle failure");
			}

			return _inner.CreateScope();
		}
	}

	// Minimal ILogger capture double: records level + rendered message + the structured
	// state key-values so specs assert real warning logs and their properties (no repo
	// capturing-logger helper exists yet).
	private sealed class CapturingLogger<T> : ILogger<T> {
		public sealed record Entry(
			LogLevel Level,
			string Message,
			IReadOnlyList<KeyValuePair<string, object?>> State
		);

		private readonly List<Entry> _entries = [];

		public IEnumerable<Entry> Warnings {
			get { return _entries.Where(e => e.Level == LogLevel.Warning); }
		}

		public void Clear() {
			_entries.Clear();
		}

		public IDisposable BeginScope<TState>(TState state) where TState : notnull {
			return NullScope.Instance;
		}

		public bool IsEnabled(LogLevel logLevel) {
			return true;
		}

		public void Log<TState>(
			LogLevel logLevel,
			EventId eventId,
			TState state,
			Exception? exception,
			Func<TState, Exception?, string> formatter
		) {
			var kvps = state as IReadOnlyList<KeyValuePair<string, object?>>
				?? Array.Empty<KeyValuePair<string, object?>>();
			_entries.Add(new Entry(logLevel, formatter(state, exception), kvps));
		}

		private sealed class NullScope : IDisposable {
			public static readonly NullScope Instance = new();

			public void Dispose() {
			}
		}
	}
}
