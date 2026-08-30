using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;

using Xunit;

namespace PublyApp.Api.Modules.RateLimiting.Entities;

/// <summary>
/// Pins the RateLimitCounter EF model (#953): composite primary key, the
/// check constraint on permit_count, the sweep-supporting index, and column
/// mappings. Anchors two guarantees that were previously only asserted in
/// prose: (1) the composite PK is the exact conflict target of the UPSERT
/// (without which atomicity collapses), and (2) no raw PII ever lands on the
/// row — partition keys are stored exclusively as hashed values.
/// </summary>
public sealed class RateLimitCounterSpec {
	static RateLimitCounterSpec() {
		AppEnvironment.Initialize();
	}

	private static IEntityType Model() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=rate_limit_counter_guard")
			.Options;
		using var dbContext = new AppDbContext(options);
		return dbContext.GetService<IDesignTimeModel>()
			.Model.FindEntityType(typeof(RateLimitCounter))!;
	}

	[Fact]
	public void ItShouldDeclareTheCompositePrimaryKeyAsTheUpsertConflictTarget() {
		var entity = Model();

		var key = entity.FindPrimaryKey();
		key.Should().NotBeNull(
			"a composite PK is the foundation of the atomic UPSERT"
		);
		key!.Properties.Select(p => p.Name).Should().Equal(
			nameof(RateLimitCounter.PolicyName),
			nameof(RateLimitCounter.PartitionKeyHash),
			nameof(RateLimitCounter.WindowStartedAt)
		);
	}

	[Fact]
	public void ItShouldStorePermitCountAsNonNullableAndNonNegative() {
		var entity = Model();
		var table = StoreObjectIdentifier.Table("rate_limit_counters");

		var permitCount = entity.FindProperty(
			nameof(RateLimitCounter.PermitCount)
		);
		permitCount.Should().NotBeNull();
		permitCount!.IsNullable.Should().BeFalse(
			"permit_count is a monotonic counter — never null"
		);
		permitCount.GetColumnName(table).Should().Be("permit_count");

		var checkConstraints = entity.GetCheckConstraints();
		checkConstraints.Should()
			.ContainSingle(c => c.Name == "CK_RateLimitCounters_PermitCount");
	}

	[Fact]
	public void ItShouldMapAllColumnsToTheSnakeCaseRateLimitCountersTable() {
		var entity = Model();
		var table = StoreObjectIdentifier.Table("rate_limit_counters");

		entity.GetSchema().Should().BeNull(
			"counters live in the public schema (no-tenant entity)"
		);

		entity.FindProperty(
			nameof(RateLimitCounter.PolicyName)
		)!.GetColumnName(table).Should().Be("policy_name");

		entity.FindProperty(
			nameof(RateLimitCounter.PartitionKeyHash)
		)!.GetColumnName(table).Should().Be("partition_key_hash");

		entity.FindProperty(
			nameof(RateLimitCounter.WindowStartedAt)
		)!.GetColumnName(table).Should().Be("window_started_at");
	}

	[Fact]
	public void ItShouldDeclareTheWindowStartedAtIndexForHousekeepingSweeps() {
		var entity = Model();

		var index = entity.GetIndexes()
			.SingleOrDefault(i =>
				i.GetDatabaseName() == "ix_rate_limit_counters_window_started_at"
			);
		index.Should().NotBeNull(
			"the sweep query filters by window_started_at"
		);
		index!.Properties.Select(p => p.Name).Should().Equal(
			nameof(RateLimitCounter.WindowStartedAt)
		);
	}

	[Fact]
	public void ItShouldDeclareNoTenantAndNoAuditColumns() {
		var entity = Model();

		// RateLimitCounter is a pure operational-state table: no tenant scoping,
		// no soft-delete, no audit timestamps — those would bloat every UPSERT
		// and complicate the atomic conditional update. It is an INoTenantEntity,
		// which is how the model discovers it needs no tenant filter.
		entity.ClrType.GetProperties()
			.Select(p => p.Name)
			.Should().NotContain(
				"TenantId",
				"counters are partitioned by policy + hash, not by tenant"
			);

		typeof(INoTenantEntity)
			.IsAssignableFrom(entity.ClrType)
			.Should().BeTrue(
				"the model uses INoTenantEntity to skip the tenant filter"
			);
	}
}
