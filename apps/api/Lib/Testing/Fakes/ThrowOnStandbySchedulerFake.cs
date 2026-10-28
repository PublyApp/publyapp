using Quartz;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// An <see cref="IScheduler"/> whose stop cannot be confirmed: <c>Standby</c> (and
/// <c>Shutdown</c>) throw while <see cref="ShouldThrowOnStop"/> is true. Lets
/// SchedulerLeaderService specs prove the stand-down ordering contract — an
/// unconfirmed scheduler stop must retain leadership and the advisory lock rather
/// than release the lock while triggers may still fire. Only the members the leader
/// service touches (ScheduleJob, Start, Status, Standby, Shutdown)
/// behave; everything else is deliberately unimplemented.
/// </summary>
public sealed class ThrowOnStandbySchedulerFake : IScheduler {
	private bool _Started;

	// Toggleable so specs can flip it off in cleanup and release the real advisory
	// lock through the normal path after asserting the retained-leadership contract.
	public bool ShouldThrowOnStop { get; set; } = true;

	// Models Quartz's real startup hazard (confirmed in 3.18.2, same in 4.x): the scheduler
	// unpauses — becomes active — before Start() returns, so Start can throw AFTER
	// triggers may already be firing. When set, Start flips Status to Running and THEN
	// throws, letting specs prove the fail-closed provisional-startup path.
	public bool ShouldThrowOnStart { get; set; }

	public string SchedulerName {
		get { return nameof(ThrowOnStandbySchedulerFake); }
	}

	public string SchedulerInstanceId {
		get { return nameof(ThrowOnStandbySchedulerFake); }
	}

	public SchedulerContext Context {
		get { return new SchedulerContext(); }
	}

	public SchedulerStatus Status {
		get { return this._Started ? SchedulerStatus.Running : SchedulerStatus.Created; }
	}

	public TimeProvider TimeProvider {
		get { return TimeProvider.System; }
	}

	public IListenerManager ListenerManager {
		get { throw new NotImplementedException(); }
	}

	public ValueTask<string> GetSchedulerInstanceId(CancellationToken cancellationToken = default) {
		return ValueTask.FromResult(this.SchedulerInstanceId);
	}

	public ValueTask<SchedulerStatus> GetStatus(CancellationToken cancellationToken = default) {
		return ValueTask.FromResult(this.Status);
	}

	public ValueTask Start(CancellationToken cancellationToken = default) {
		// Deliberately ordered: active FIRST, throw second (see ShouldThrowOnStart).
		this._Started = true;

		if (this.ShouldThrowOnStart) {
			throw new SchedulerException(
				"ThrowOnStandbySchedulerFake: Start failed after the scheduler became active"
			);
		}

		return ValueTask.CompletedTask;
	}

	public ValueTask Standby(CancellationToken cancellationToken = default) {
		if (this.ShouldThrowOnStop) {
			throw new SchedulerException(
				"ThrowOnStandbySchedulerFake: standby could not be confirmed"
			);
		}

		return ValueTask.CompletedTask;
	}

	public ValueTask Shutdown(
		bool waitForJobsToComplete = false,
		CancellationToken cancellationToken = default
	) {
		if (this.ShouldThrowOnStop) {
			throw new SchedulerException(
				"ThrowOnStandbySchedulerFake: shutdown could not be confirmed"
			);
		}

		return ValueTask.CompletedTask;
	}

	public ValueTask<DateTimeOffset> ScheduleJob(
		IJobDetail jobDetail,
		ITrigger trigger,
		ScheduleJobOptions options = default,
		CancellationToken cancellationToken = default
	) {
		return ValueTask.FromResult(DateTimeOffset.UtcNow);
	}

	public ValueTask DisposeAsync() {
		return ValueTask.CompletedTask;
	}

	public ValueTask<SchedulerMetadata> GetMetadata(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PagedResult<FireInstance>> QueryFireInstances(
		FireInstanceQuery query,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<ClusterNode>> QueryClusterNodes(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask StartDelayed(
		TimeSpan delay,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<DateTimeOffset> ScheduleJob(
		ITrigger trigger,
		ScheduleJobOptions options = default,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<ScheduleTriggerResult> ScheduleTrigger(
		ITrigger trigger,
		TriggerConflict onConflict,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask ScheduleJobs(
		IReadOnlyDictionary<IJobDetail, IReadOnlyCollection<ITrigger>> triggersAndJobs,
		ScheduleJobOptions options = default,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask ScheduleJob(
		IJobDetail jobDetail,
		IReadOnlyCollection<ITrigger> triggersForJob,
		ScheduleJobOptions options = default,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> UnscheduleJob(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<TriggerKey>> UnscheduleJobs(
		IReadOnlyCollection<TriggerKey> triggerKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<TriggerKey>> UnscheduleJobs(
		GroupMatcher<TriggerKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<DateTimeOffset?> RescheduleJob(
		TriggerKey triggerKey,
		ITrigger newTrigger,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> UpdateTriggerDetails(
		TriggerKey triggerKey,
		TriggerDetailsUpdate update,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask SetExecutionLimits(
		ExecutionLimits? limits,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<ExecutionLimits?> GetExecutionLimits(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask AddJob(
		IJobDetail jobDetail,
		AddJobOptions options = default,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> DeleteJob(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<JobKey>> DeleteJobs(
		IReadOnlyCollection<JobKey> jobKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<JobKey>> DeleteJobs(
		GroupMatcher<JobKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask TriggerJob(
		JobKey jobKey,
		JobDataMap? data = null,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> PauseJob(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<JobKey>> PauseJobs(
		IReadOnlyCollection<JobKey> jobKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<string>> PauseJobGroups(
		GroupMatcher<JobKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> PauseTrigger(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<TriggerKey>> PauseTriggers(
		IReadOnlyCollection<TriggerKey> triggerKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<string>> PauseTriggerGroups(
		GroupMatcher<TriggerKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> ResumeJob(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<JobKey>> ResumeJobs(
		IReadOnlyCollection<JobKey> jobKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<string>> ResumeJobGroups(
		GroupMatcher<JobKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> ResumeTrigger(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<TriggerKey>> ResumeTriggers(
		IReadOnlyCollection<TriggerKey> triggerKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<string>> ResumeTriggerGroups(
		GroupMatcher<TriggerKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask PauseAll(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask ResumeAll(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> PauseTriggerWith(
		TriggerKey triggerKey,
		PauseDetails? details,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> PauseJobWith(
		JobKey jobKey,
		PauseDetails? details,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<string>> PauseTriggerGroupsWith(
		GroupMatcher<TriggerKey> matcher,
		PauseDetails? details,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<string>> PauseJobGroupsWith(
		GroupMatcher<JobKey> matcher,
		PauseDetails? details,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask PauseAllWith(
		PauseDetails? details,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<TriggerKey>> PauseTriggersWith(
		IReadOnlyCollection<TriggerKey> triggerKeys,
		PauseDetails? details,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<JobKey>> PauseJobsWith(
		IReadOnlyCollection<JobKey> jobKeys,
		PauseDetails? details,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PauseInfo?> GetTriggerPause(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PauseInfo?> GetTriggerGroupPause(
		string groupName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PauseInfo?> GetJobGroupPause(
		string groupName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PagedResult<JobHeader>> QueryJobs(
		JobQuery query,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PagedResult<TriggerHeader>> QueryTriggers(
		TriggerQuery query,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PagedResult<JobGroup>> QueryJobGroups(
		JobGroupQuery query,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PagedResult<TriggerGroup>> QueryTriggerGroups(
		TriggerGroupQuery query,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<PagedResult<string>> QueryCalendarNames(
		CalendarQuery query,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<IJobDetail>> GetJobDetails(
		IReadOnlyCollection<JobKey> jobKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<ITrigger>> GetTriggers(
		IReadOnlyCollection<TriggerKey> triggerKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<IJobDetail?> GetJobDetail(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<ITrigger?> GetTrigger(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<TriggerState> GetTriggerState(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> ResetTriggerFromErrorState(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<TriggerKey>> ResetTriggersFromErrorState(
		IReadOnlyCollection<TriggerKey> triggerKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<List<TriggerKey>> ResetTriggersFromErrorState(
		GroupMatcher<TriggerKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask AddCalendar(
		string calendarName,
		ICalendar calendar,
		AddCalendarOptions options = default,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> DeleteCalendar(
		string calendarName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<ICalendar?> GetCalendar(
		string calendarName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> Interrupt(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> InterruptFireInstance(
		string fireInstanceId,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> Exists(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> Exists(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask<bool> Exists(
		string calendarName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public ValueTask Clear(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}
}
