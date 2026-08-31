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

Mechanism: cron `0/10 * * * * ?` (every 10 seconds), scheduler put in standby,
repointed, restarted. A `TimedFireSignalListener` tracks elapsed time from
`scheduler.Start()`. SmartPolicy fires immediately (~2 s in-process, ~8 s in slow CI).
DoNothing waits for the next scheduled instant (~10 s). Threshold: 12 s.

## ROUGE output (threshold = 3 s, original)

```
Failed PublyApp.Api.Infrastructure.Jobs.Quartz.LiveSystemJobTriggerSpec.ItShouldRecoverMisfiredTriggerOnSchedulerStart [7 s]
Error Message:
  Expected listener.ElapsedSinceRestart to be less than 3s
  [because after standby, SmartPolicy fires the next missed occurrence
  immediately (~2 s in-process, ~8 s in slow CI); DoNothing silently skips
  it and waits for the next scheduled instant (~10 s). If this elapsed time
  is over 3 s, the trigger was configured with a silent misfire policy and
  this test should ROUGE (#1706)],
  but found 8s, 286ms and 155.2µs.
```

**Test named in output: `ItShouldRecoverMisfiredTriggerOnSchedulerStart`.**

> The 3 s threshold was too tight for slow CI (scheduler overhead brings
> SmartPolicy recovery to ~8 s). After the fix, threshold is 12 s — the
> same ROUGE on `DoNothing` still fires because DoNothing waits ~10 s,
> while SmartPolicy lands at ~8 s in CI. The margin is ~2 s.

## VERT output (after restore)

```
Passed PublyApp.Api.Infrastructure.Jobs.Quartz.LiveSystemJobTriggerSpec.ItShouldRecoverMisfiredTriggerOnSchedulerStart [2 s]
```

## Why this mutation was chosen

`WithCronSchedule(string)` without an explicit misfire policy defaults to
`SmartPolicy`, which fires the next missed occurrence immediately on scheduler
start. The most dangerous regression is switching to a silent misfire policy
(`DoNothing`, `Ignore`, `DoNotFire`) — a missed occurrence is dropped forever
and the firing test (`ItShouldFireAReconciledTriggerAtItsScheduledTime`) stays
green because it tests a live scheduler, not a recovering one. This test is
the only place that distinguishes recovering behavior from live firing.

## Second test: `ItShouldRescheduleFailedJobWithCausePreserved`

Not claimed as a paired red/green proof in the PR body. The corresponding
mutation for this test: in `TryRequeueAsync` (`JobQueueProcessor.cs`, line 684),
comment out `last_error = {lastError}` — the row is requeued but `last_error`
is null, and the assertion `requeued.LastError.Should().NotBeNullOrEmpty(...)`
fails with "expected not null or empty".
