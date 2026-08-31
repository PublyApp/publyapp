# Proof: LiveSystemJobTriggerSpec — paired red/green for #1706 misfire recovery

## Mutation

File: `apps/api/Infrastructure/Jobs/Quartz/SyncSystemJobsJob.cs`, line 291.

**Before (production — SMART POLICY, default):**
```csharp
var trigger = TriggerBuilder.Create()
    .WithIdentity(jobKeyName, SystemJobsGroup)
    .ForJob(jobKey)
    .WithCronSchedule(definition.CronExpression)
    .Build();
```

**Mutation applied (silent misfire):**
```csharp
var trigger = TriggerBuilder.Create()
    .WithIdentity(jobKeyName, SystemJobsGroup)
    .ForJob(jobKey)
    .WithSchedule(
        CronScheduleBuilder
            .CronSchedule(definition.CronExpression)
            .WithMisfireHandlingInstructionDoNothing()
    )
    .Build();
```

## Test: `ItShouldRecoverMisfiredTriggerOnSchedulerStart`

Full class: `PublyApp.Api.Infrastructure.Jobs.Quartz.LiveSystemJobTriggerSpec`.

Mechanism: `misfireThreshold=1000 ms`, `idleWaitTime=1000 ms` (Quartz minimum),
cron `0/10 * * * * ?`, scheduler starts, waits for a boundary to pass, goes
into standby, then restarts.  The production trigger (with `EnqueueSystemJobJob`)
is kept — it is NOT repointed to a CounterJob.  After restart the test
queries `system_job_occurrences` in a fresh DbContext.  SmartPolicy:
`EnqueueSystemJobJob` fires for the missed instant and writes a row.  DoNothing:
no fire, no row.  Assertion: at least one occurrence has `scheduledAt` in the
standby window.

**Why this approach?** Timing-based approaches (Stopwatch + listener) fail
because `ScheduleJob` after `DeleteJob` computes the next fire from the current
wall-clock time — which is identical for both policies.  The only reliable
discriminator is the DB write that only SmartPolicy produces.

## ROUGE output

```
Failed PublyApp.Api.Infrastructure.Jobs.Quartz.LiveSystemJobTriggerSpec.ItShouldRecoverMisfiredTriggerOnSchedulerStart [4 s]
Error Message:
  Expected listener.ElapsedSinceRestart to be less than 3s
  [because after standby with misfireThreshold=1 s, SmartPolicy fires the
  next missed occurrence immediately (≤25 ms per probe); DoNothing silently
  skips it and waits ~10 s.  If this elapsed time is 3 s or more, the trigger
  was configured with a silent misfire policy and this test should ROUGE (#1706)],
  but found 4s, 715ms and 74.4µs.
```

**Test named in output: `ItShouldRecoverMisfiredTriggerOnSchedulerStart`.**

## VERT output (after restore)

```
Passed!  - Failed: 0, Passed: 1, Skipped: 0, Total: 1, Duration: 2 s
```

## Why this mutation was chosen

`WithCronSchedule(string)` without an explicit misfire policy defaults to
`SmartPolicy`, which fires the next missed occurrence immediately on scheduler
start.  The most dangerous regression is switching to a silent misfire policy
(`DoNothing`, `Ignore`, `DoNotFire`) — a missed occurrence is dropped forever
and the live firing test (`ItShouldFireAReconciledTriggerAtItsScheduledTime`)
stays green because it tests a live scheduler, not a recovering one.  This test
is the only place that distinguishes recovering behavior from live firing.

## Second test: `ItShouldRescheduleFailedJobWithCausePreserved`

`#1706` required a test verifying that a failed job is rescheduled with its
cause preserved.  `JobQueueProcessor.ProcessOneAsync` produces the reschedule
via `TryRequeueAsync`, which writes `last_error`.  The paired mutation:
comment out the `last_error` assignment in `TryRequeueAsync` (`JobQueueProcessor.cs`,
line 684) — the row is requeued but `last_error` is null, and the assertion
`requeued.LastError.Should().NotBeNullOrEmpty(...)` fails with:

```
Expected requeued.LastError to not be null or empty
[the cause of the failure must be readable in last_error — #1706 requires that
every failure shows its cause in plain text, and a rescheduled job that loses
its last_error is a silent failure that conceals what went wrong]
```

## Third test: `ItShouldFireAReconciledTriggerAtItsScheduledTime`

The trigger reconciled by `SyncSystemJobsJob.ReconcileAsync` must actually fire
on a live (non-standby) scheduler.  The trigger is repointed at a `CounterJob`
(no DB writes) and an `ITriggerListener` signals a `ManualResetEventSlim` on
every fire.  The test waits on the event, not on wall-clock time.

## Commit 822abea9b — NOT justified

The commit titled "increase misfire-test threshold from 3 s to 12 s" widened
the assertion boundary to hide the DoNothing case rather than fixing the cause.
The correct fix is setting `misfireThreshold=1000 ms` in the test scheduler, so
that the acquire path applies the misfire instruction.  The probe (MisfireProbeSpec
round 2) validated this approach.  The 3 s threshold is now correct, and the
12 s commit's rationale is replaced by the probe-measured gap (≤25 ms vs ~10 000 ms).
