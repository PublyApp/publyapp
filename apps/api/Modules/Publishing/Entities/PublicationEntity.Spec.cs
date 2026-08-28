using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// Pins the Publication EF model (Epic D §2): status check constraint, the unique
/// (post, account) pair, the due-scan and tenant-list indexes, and the schedule
/// value-object columns. Mirrors PostArchitectureSpec's Roslyn-free technique.
/// </summary>
public sealed class PublicationEntitySpec {
	static PublicationEntitySpec() {
		AppEnvironment.Initialize();
	}

	private static IEntityType Model() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=publication_entity_guard")
			.Options;
		using var dbContext = new AppDbContext(options);
		return dbContext.GetService<IDesignTimeModel>()
			.Model.FindEntityType(typeof(Publication))!;
	}

	[Fact]
	public void ItShouldConfigureCkPublicationStatusWithExactlyTheEnumValues() {
		var entity = Model();

		var constraint = entity
			.GetCheckConstraints()
			.SingleOrDefault(c => c.Name == "CK_Publication_Status");
		constraint.Should().NotBeNull(
			"CK_Publication_Status must be configured in PublicationConfiguration"
		);
		constraint!.Sql.Should().Be(
			"status IN (10, 20, 30, 40, 50)",
			"PublicationStatus values are 10/Scheduled, 20/InProgress, 30/Published, "
			+ "40/Failed, 50/Paused"
		);
	}

	[Fact]
	public void ItShouldDeclareTheUniquePostAccountIndexAsPartialOnLiveRows() {
		var entity = Model();

		var unique = entity.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ux_publications_post_account"
		);
		unique.Should().NotBeNull(
			"one publication row per (post, account) pair is a spec invariant"
		);
		unique!.IsUnique.Should().BeTrue();
		unique.Properties.Select(p => p.Name).Should().Equal(
			nameof(Publication.PostId), nameof(Publication.SocialAccountId)
		);
		unique.GetFilter().Should().Be(
			"is_deleted = false AND status <> 40",
			"a cancelled-and-recreated publication frees its (post, account) pair, AND a "
			+ "terminal FAILED row (status 40) releases the pair so a fresh retry is "
			+ "re-issuable; Published rows keep the pair through the index (D2 round-2 fix)"
		);
	}

	[Fact]
	public void ItShouldDeclareTheDueScanAndTenantListIndexes() {
		var entity = Model();

		var dueScan = entity.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_publications_status_scheduled_at"
		);
		dueScan.Should().NotBeNull("the D3 due-scan claims by (status, instant)");
		dueScan!.Properties.Select(p => p.Name).Should().Equal(
			nameof(Publication.Status), nameof(Publication.ScheduledAtUtc)
		);

		var tenantList = entity.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_publications_tenant_scheduled_at_id"
		);
		tenantList.Should().NotBeNull(
			"tenant queue/calendar lists paginate keyset by (tenant, instant, id)"
		);
		tenantList!.Properties.Select(p => p.Name).Should().Equal(
			nameof(Publication.TenantId),
			nameof(Publication.ScheduledAtUtc),
			nameof(Publication.Id)
		);
	}

	[Fact]
	public void ItShouldMapTheScheduleValueObjectColumns() {
		var entity = Model();
		var table = StoreObjectIdentifier.Table("publications");

		var instant = entity.FindProperty(nameof(Publication.ScheduledAtUtc));
		instant.Should().NotBeNull("the schedule instant is stored");
		instant!.GetColumnName(table).Should().Be("scheduled_at_utc");
		var zone = entity.FindProperty(nameof(Publication.ScheduledTimeZone));
		zone.Should().NotBeNull("the IANA zone label is stored next to the instant");
		zone!.GetColumnName(table).Should().Be("scheduled_time_zone");
		zone!.GetMaxLength().Should().Be(
			PublicationSchedule.MaxTimeZoneLength,
			"IANA zone identifiers stay bounded"
		);
	}

	[Fact]
	public void ItShouldStoreTheIdempotencyKeyOnTheRow() {
		var entity = Model();

		var key = entity.FindProperty(nameof(Publication.IdempotencyKey));
		key.Should().NotBeNull(
			"the deterministic key rides the row so retries and the Bluesky rkey agree"
		);
		key!.IsNullable.Should().BeFalse();
	}
}
