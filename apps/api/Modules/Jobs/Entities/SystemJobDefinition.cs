using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// A dashboard-configurable recurring system job (design §4.3). Unlike
/// <see cref="JobQueueItem"/>, this is low-churn config edited from the staff dashboard
/// (#636): it DOES inherit <see cref="BaseAttributes"/> because <c>updated_at</c>
/// tracking is wanted and the soft-delete default is harmless — operators disable a job
/// by flipping <see cref="IsEnabled"/>, not by deleting it. SyncSystemJobsJob reconciles
/// the enabled, non-deleted rows into the leader's live Quartz scheduler every 60 s.
/// </summary>
[Table("system_job_definitions")]
public class SystemJobDefinition : BaseAttributes, INoTenantEntity {
	// Stable identity, e.g. 'session-cleanup'. Also the job_type enqueued when the
	// cron trigger fires (matched against an IJobHandler in a later phase).
	[Column("job_key")]
	public required string JobKey { get; set; }

	// Quartz cron expression driving the recurring trigger.
	[Column("cron_expression")]
	public required string CronExpression { get; set; }

	// Fences fires from a retired Quartz registration. SyncSystemJobsJob rotates this
	// value when the live trigger's cron differs from the definition and stamps the
	// current value into the replacement trigger's JobDataMap.
	[Column("schedule_epoch")]
	public Guid ScheduleEpoch { get; set; }

	// Operational on/off switch. Disabling removes the trigger without losing the row.
	[Column("is_enabled")]
	public bool IsEnabled { get; set; } = true;

	[Column("description")]
	public string? Description { get; set; }

	// Bookkeeping: when SyncSystemJobsJob's trigger last enqueued a job_queue row.
	[Column("last_enqueued_at")]
	public DateTime? LastEnqueuedAt { get; set; }
}
