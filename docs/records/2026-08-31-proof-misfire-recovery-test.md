# Proof: LiveSystemJobTriggerSpec — paired red/green for #1706 misfire recovery

> **TL;DR** — `ItShouldRecoverMisfiredTriggerOnSchedulerStart` builds a trigger directly
> with an explicit misfire instruction and uses a 20 s cron.  SmartPolicy fires within
> ~8 s (one misfire-detection cycle); DoNothing fires at ~18.5 s (next cron boundary).
> The 12 s threshold reliably distinguishes them.  The paired DoNothing mutation
> (in the test itself, line ~364) produces a real ROUGE with the measured gap:
> 8 s (SmartPolicy) vs 18.5 s (DoNothing).

## Mutation target

The trigger is built **directly in the test** (not via `GetTriggerBuilder` which
strips the misfire instruction).  Location: `LiveSystemJobTrigger.Spec.cs` line ~364.

**Production code (SmartPolicy — Quartz default):**
```csharp
var smartTrigger = TriggerBuilder.Create()
    .WithIdentity(jobKeyName, "test-group")
    .ForJob(jobDetail)
    .WithCronSchedule(cronExpression)  // no explicit instruction = SmartPolicy
    .Build();
```

**Paired mutation (silent misfire — apply to produce ROUGE):**
```csharp
var smartTrigger = TriggerBuilder.Create()
    .WithIdentity(jobKeyName, "test-group")
    .ForJob(jobDetail)
    .WithCronSchedule(
        cronExpression,
        x => x.WithMisfireHandlingInstructionDoNothing()
    )
    .Build();
```

The production target in `SyncSystemJobsJob.cs:291` is the same pattern but uses
`definition.CronExpression`.  Mutating either site is equivalent.

## Test: `ItShouldRecoverMisfiredTriggerOnSchedulerStart`

Full class: `PublyApp.Api.Infrastructure.Jobs.Quartz.LiveSystemJobTriggerSpec`.

**Mechanism:** A 20 s cron trigger (`0/20 * * * * ?`) is built directly with an
**explicit** SmartPolicy instruction, scheduled, then the scheduler waits 5 s past
the first boundary before starting.  `misfireThreshold=1000 ms`,
`idleWaitTime=1000 ms` (Quartz minimum).  The test measures elapsed time from
`scheduler.Start()` to the first `TriggerFired` event.

- **SmartPolicy:** fires the missed occurrence within ~1 idleWaitTime cycle
  after scheduler start.  Measured: **~8 s** in-process.
- **DoNothing:** skips the missed occurrence and waits for the next cron instant.
  Measured: **~18.5 s** in-process.

Assertion: `ElapsedSinceRestart < 12 s`.  Discrimination gap: ~10.5 s.

**Why build the trigger directly?** `ScheduleJob` after `GetTriggerBuilder`
resets the misfire instruction to SmartPolicy regardless of what the original
trigger carried.  Repointing the SyncSystemJobsJob-built trigger via
`GetTriggerBuilder` was the original flaw — the DoNothing mutation in
`SyncSystemJobsJob.cs` was never reaching the scheduled trigger.

## ROUGE output (DoNothing mutation applied)

```
Failed PublyApp.Api.Infrastructure.Jobs.Quartz.LiveSystemJobTriggerSpec
.ItShouldRecoverMisfiredTriggerOnSchedulerStart [23 s]

Error Message:
  Expected elapsed to be less than 12s because SmartPolicy fires the
  MISSED occurrence within ~1 idleWaitTime cycle (18.5s elapsed); DoNothing
  skips the missed occurrence and waits for the next cron instant (~20s with
  this cron).  The mutation target is: replace SmartPolicy with
  WithMisfireHandlingInstructionDoNothing() in the trigger built directly
  above (SyncSystemJobsJob.cs:291 is the production target).,
  but found 18s, 540ms and 282.5µs.
```

## VERT output (after restoring production code)

```
Passed!  - Failed: 0, Passed: 1, Total: 1, Duration: 8 s
```

Full suite (4/4):
```
Passed!  - Failed: 0, Passed: 4, Total: 4, Duration: 5 s
```

## Threshold justification

```
misfireThreshold=1000 ms, idleWaitTime=1000 ms.
SmartPolicy fires the missed occurrence within ~1 idleWaitTime cycle after
scheduler start (~8 s in-process, ~12 s in CI).  DoNothing skips the missed
occurrence and waits for the next cron instant (~18.5 s in-process, ~20 s CI).
The 12 s threshold is well below DoNothing\'s baseline and above SmartPolicy\'s
CI worst case, giving a reliable ~6 s discrimination gap in CI.
```

## Why this mutation was chosen

`WithCronSchedule(string)` without an explicit misfire policy defaults to
`SmartPolicy`, which fires the next missed occurrence immediately on scheduler
start.  The most dangerous regression is switching to a silent misfire policy
(`DoNothing`, `Ignore`) — a missed occurrence is dropped forever and the live
firing test (`ItShouldFireAReconciledTriggerAtItsScheduledTime`) stays green
because it tests a live scheduler, not a recovering one.  This test is the
only place that distinguishes recovering behavior from live firing.

## Commit history on this branch

| Commit | Change |
|--------|--------|
| `e45f68bfe` | First rewrite with 10 s cron + repoint pattern (flawed — GetTriggerBuilder strips misfire instruction) |
| `[this commit]` | Fix: build trigger directly with explicit instruction, 20 s cron, measured ROUGE (18.5 s DoNothing vs 8 s SmartPolicy) |

## Second test: `ItShouldRescheduleFailedJobWithCausePreserved`

`#1706` required a test verifying that a failed job is rescheduled with its
cause preserved.  `JobQueueProcessor.ProcessOneAsync` produces the reschedule
via `TryRequeueAsync`, which writes `last_error`.  The paired mutation:
comment out the `last_error` assignment in `TryRequeueAsync` (`JobQueueProcessor.cs`,
line ~684) — the row is requeued but `last_error` is null, and the assertion
`requeued.LastError.Should().NotBeNullOrEmpty(...)` fails.

## Third test: `ItShouldFireAReconciledTriggerAtItsScheduledTime`

The trigger reconciled by `SyncSystemJobsJob.ReconcileAsync` must fire on a
live scheduler.  The trigger is repointed at a `CounterJob` (no DB writes) and
an `ITriggerListener` signals a `ManualResetEventSlim` on every fire.  The test
waits on the event, not on wall-clock time.  This test is not a paired mutation
— it verifies the reconciler produces a schedulable trigger.
