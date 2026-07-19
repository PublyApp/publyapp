using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// Durable identity for one scheduled system-job fire. The composite key survives
/// successful queue-row deletion, so scheduler retries and leader overlap cannot
/// enqueue the same scheduled instant twice.
/// </summary>
[Table("system_job_occurrences")]
public class SystemJobOccurrence : INoTenantEntity {
	[Column("job_key")]
	public required string JobKey { get; set; }

	[Column("scheduled_fire_at")]
	public DateTime ScheduledFireAt { get; set; }

	[Column("enqueued_job_id")]
	public Guid? EnqueuedJobId { get; set; }

	[Column("enqueued_at")]
	public DateTime EnqueuedAt { get; set; }
}
