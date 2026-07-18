using Quartz;
using Quartz.Impl.Matchers;
using Quartz.Spi;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// An <see cref="IScheduler"/> whose stop cannot be confirmed: <c>Standby</c> (and
/// <c>Shutdown</c>) throw while <see cref="ShouldThrowOnStop"/> is true. Lets
/// SchedulerLeaderService specs prove the stand-down ordering contract — an
/// unconfirmed scheduler stop must retain leadership and the advisory lock rather
/// than release the lock while triggers may still fire. Only the members the leader
/// service touches (JobFactory, ScheduleJob, Start, state flags, Standby, Shutdown)
/// behave; everything else is deliberately unimplemented.
/// </summary>
public sealed class ThrowOnStandbySchedulerFake : IScheduler {
	private bool _started;

	// Toggleable so specs can flip it off in cleanup and release the real advisory
	// lock through the normal path after asserting the retained-leadership contract.
	public bool ShouldThrowOnStop { get; set; } = true;

	// Models Quartz's real startup hazard (confirmed in 3.18.2): the scheduler
	// unpauses — becomes active — before Start() returns, so Start can throw AFTER
	// triggers may already be firing. When set, Start flips IsStarted true and THEN
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

	public bool InStandbyMode {
		get { return false; }
	}

	public bool IsShutdown {
		get { return false; }
	}

	public bool IsStarted {
		get { return _started; }
	}

	public IJobFactory JobFactory {
		set { _ = value; }
	}

	public IListenerManager ListenerManager {
		get { throw new NotImplementedException(); }
	}

	public Task Start(CancellationToken cancellationToken = default) {
		// Deliberately ordered: active FIRST, throw second (see ShouldThrowOnStart).
		_started = true;

		if (ShouldThrowOnStart) {
			throw new SchedulerException(
				"ThrowOnStandbySchedulerFake: Start failed after the scheduler became active"
			);
		}

		return Task.CompletedTask;
	}

	public Task StartDelayed(TimeSpan delay, CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task Standby(CancellationToken cancellationToken = default) {
		if (ShouldThrowOnStop) {
			throw new SchedulerException(
				"ThrowOnStandbySchedulerFake: standby could not be confirmed"
			);
		}

		return Task.CompletedTask;
	}

	public Task Shutdown(CancellationToken cancellationToken = default) {
		return Shutdown(waitForJobsToComplete: false, cancellationToken);
	}

	public Task Shutdown(bool waitForJobsToComplete, CancellationToken cancellationToken = default) {
		if (ShouldThrowOnStop) {
			throw new SchedulerException(
				"ThrowOnStandbySchedulerFake: shutdown could not be confirmed"
			);
		}

		return Task.CompletedTask;
	}

	public Task<DateTimeOffset> ScheduleJob(
		IJobDetail jobDetail,
		ITrigger trigger,
		CancellationToken cancellationToken = default
	) {
		return Task.FromResult(DateTimeOffset.UtcNow);
	}

	public Task<DateTimeOffset> ScheduleJob(
		ITrigger trigger,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task ScheduleJobs(
		IReadOnlyDictionary<IJobDetail, IReadOnlyCollection<ITrigger>> triggersAndJobs,
		bool replace,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task ScheduleJob(
		IJobDetail jobDetail,
		IReadOnlyCollection<ITrigger> triggersForJob,
		bool replace,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> UnscheduleJob(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> UnscheduleJobs(
		IReadOnlyCollection<TriggerKey> triggerKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<DateTimeOffset?> RescheduleJob(
		TriggerKey triggerKey,
		ITrigger newTrigger,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task AddJob(
		IJobDetail jobDetail,
		bool replace,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task AddJob(
		IJobDetail jobDetail,
		bool replace,
		bool storeNonDurableWhileAwaitingScheduling,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> DeleteJob(JobKey jobKey, CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task<bool> DeleteJobs(
		IReadOnlyCollection<JobKey> jobKeys,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task TriggerJob(JobKey jobKey, CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task TriggerJob(
		JobKey jobKey,
		JobDataMap data,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task PauseJob(JobKey jobKey, CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task PauseJobs(
		GroupMatcher<JobKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task PauseTrigger(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task PauseTriggers(
		GroupMatcher<TriggerKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task ResumeJob(JobKey jobKey, CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task ResumeJobs(
		GroupMatcher<JobKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task ResumeTrigger(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task ResumeTriggers(
		GroupMatcher<TriggerKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task PauseAll(CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task ResumeAll(CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<string>> GetJobGroupNames(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<string>> GetTriggerGroupNames(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<string>> GetPausedTriggerGroups(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<JobKey>> GetJobKeys(
		GroupMatcher<JobKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<ITrigger>> GetTriggersOfJob(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<TriggerKey>> GetTriggerKeys(
		GroupMatcher<TriggerKey> matcher,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<IJobDetail?> GetJobDetail(
		JobKey jobKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ITrigger?> GetTrigger(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<TriggerState> GetTriggerState(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task ResetTriggerFromErrorState(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task AddCalendar(
		string calName,
		ICalendar calendar,
		bool replace,
		bool updateTriggers,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> DeleteCalendar(
		string calName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ICalendar?> GetCalendar(
		string calName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<string>> GetCalendarNames(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> Interrupt(JobKey jobKey, CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task<bool> Interrupt(
		string fireInstanceId,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> CheckExists(JobKey jobKey, CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task<bool> CheckExists(
		TriggerKey triggerKey,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task Clear(CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task<SchedulerMetaData> GetMetaData(CancellationToken cancellationToken = default) {
		throw new NotImplementedException();
	}

	public Task<IReadOnlyCollection<IJobExecutionContext>> GetCurrentlyExecutingJobs(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> IsJobGroupPaused(
		string groupName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<bool> IsTriggerGroupPaused(
		string groupName,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}
}
