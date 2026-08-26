using System.ComponentModel.DataAnnotations.Schema;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.RateLimiting.Entities;

/// <summary>
/// Shared fixed-window rate-limit counter (#953). One row per named policy,
/// hashed partition key and window-aligned start timestamp; every replica UPSERTs
/// the same row, so N processes share a single budget per partition. Partition
/// keys embed client IPs, emails, session fingerprints and tenant IDs, so they are
/// stored only as truncated SHA-256 hashes — never raw (same no-PII stance as the
/// throttle logs). Rows are pure operational state: no soft deletes, no audit
/// tracking, hard-deleted by housekeeping once their window lapses.
/// </summary>
[Table("rate_limit_counters")]
[PrimaryKey(
	nameof(PolicyName),
	nameof(PartitionKeyHash),
	nameof(WindowStartedAt)
)]
public class RateLimitCounter : INoTenantEntity {
	[Column("policy_name")]
	public required string PolicyName { get; set; }

	[Column("partition_key_hash")]
	public required string PartitionKeyHash { get; set; }

	[Column("window_started_at")]
	public required DateTime WindowStartedAt { get; set; }

	[Column("permit_count")]
	public long PermitCount { get; set; }
}
