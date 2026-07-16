using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// Append-only terminal record of a job that exhausted its attempts. A poison job is
/// copied here and hard-deleted from job_queue in one transaction (design §6). Never
/// soft-deleted, so — like <see cref="JobQueueItem"/> — it does NOT inherit
/// <see cref="BaseAttributes"/>: it carries an explicit uuidv7 id plus manual
/// created_at/failed_at only. The staff dashboard (#636) reads this and can requeue
/// by re-inserting into job_queue.
/// </summary>
[Table("job_dead_letter")]
public class JobDeadLetter : INoTenantEntity {
	[Column("id")]
	public Guid? Id { get; set; }

	// The job_queue.id this row came from. Nullable because the originating row is
	// deleted in the same transaction and a requeued-then-failed job may not carry
	// its ancestor's id.
	[Column("original_job_id")]
	public Guid? OriginalJobId { get; set; }

	[Column("job_type")]
	public required string JobType { get; set; }

	[Column("payload", TypeName = "jsonb")]
	public required string Payload { get; set; }

	[Column("attempts")]
	public int Attempts { get; set; }

	[Column("last_error")]
	public string? LastError { get; set; }

	[Column("failed_at")]
	public DateTime FailedAt { get; set; } = DateTime.UtcNow;

	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	public static JobDeadLetter FromJob(JobQueueItem job) {
		return new JobDeadLetter {
			OriginalJobId = job.Id,
			JobType = job.JobType,
			Payload = job.Payload,
			Attempts = job.Attempts,
			LastError = job.LastError
		};
	}
}
