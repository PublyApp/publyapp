using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.RateLimiting.Entities;

/// <summary>
/// Mapping for <see cref="RateLimitCounter"/>. The composite primary key
/// (policy_name, partition_key_hash, window_started_at) is the exact conflict
/// target of the atomic conditional UPSERT every acquisition executes; the window
/// index backs the housekeeping sweep that deletes lapsed windows.
/// </summary>
public sealed class RateLimitCounterConfiguration :
	IEntityTypeConfiguration<RateLimitCounter> {
	public void Configure(EntityTypeBuilder<RateLimitCounter> builder) {
		builder.ToTable(table => {
			table.HasCheckConstraint(
				"CK_RateLimitCounters_PermitCount",
				"permit_count >= 0"
			);
		});

		builder
			.HasIndex(counter => counter.WindowStartedAt)
			.HasDatabaseName("ix_rate_limit_counters_window_started_at");
	}
}
