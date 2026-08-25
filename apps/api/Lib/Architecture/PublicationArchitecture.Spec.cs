using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Publishing.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Publishing-specific architecture ratchet (Epic D §2/D1): exactly ONE type may
/// write <see cref="Publication.Status"/> — PublicationStatusTransitionService.
/// Every other occurrence of a status write on a publication-shaped identifier in
/// Modules source fails this guard. Roslyn-free line scan on purpose (same
/// technique as PostArchitectureSpec) so the guard cannot drift with analyzer
/// suppressions. Proven RED by planting a rogue writer under
/// Modules/Posts/Services (see .dump/mutation-rogue-writer.md), then removed.
/// </summary>
public sealed class PublicationArchitectureSpec {
	[Fact]
	public void ItShouldConfigureCkPublicationStatusWithExactlyTheEnumValues() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=publication_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Publication));
		entity.Should().NotBeNull();

		var constraint = entity!
			.GetCheckConstraints()
			.SingleOrDefault(c => c.Name == "CK_Publication_Status");
		constraint.Should().NotBeNull(
			"CK_Publication_Status must be configured in PublicationConfiguration"
		);
		constraint!.Sql.Should().Be(
			"status IN (10, 20, 30, 40, 50)",
			"PublicationStatus enum values are 10/Scheduled through 50/Paused"
		);
	}

	[Fact]
	public void ItShouldKeepTheUniquePairPartialAndTheTwoQueryIndexes() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=publication_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Publication));
		entity.Should().NotBeNull();

		var unique = entity!.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ux_publications_post_account"
		);
		unique.Should().NotBeNull("one publication per (post, account)");
		unique!.IsUnique.Should().BeTrue();
		unique.GetFilter().Should().Be(
			"is_deleted = false",
			"a cancelled-and-recreated pair must be free again"
		);

		var dueScan = entity.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_publications_status_scheduled_at"
		);
		dueScan.Should().NotBeNull("the D3 due-scan claims ordered by instant");
		dueScan!.Properties.Select(p => p.Name).Should().Equal(
			nameof(Publication.Status),
			nameof(Publication.ScheduledAtUtc)
		);

		var tenantKeyset = entity.GetIndexes().SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_publications_tenant_scheduled_at_id"
		);
		tenantKeyset.Should().NotBeNull("tenant queue lists paginate keyset");
		tenantKeyset!.Properties.Select(p => p.Name).Should().Equal(
			nameof(Publication.TenantId),
			nameof(Publication.ScheduledAtUtc),
			nameof(Publication.Id)
		);
	}

	[Fact]
	public void ItShouldBoundTheTimeZoneColumnToTheVoLimit() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=publication_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Publication));
		entity.Should().NotBeNull();

		var zone = entity!.FindProperty(nameof(Publication.ScheduledTimeZone));
		zone.Should().NotBeNull();
		zone!.GetMaxLength().Should().Be(
			PublicationSchedule.MaxTimeZoneLength,
			"the column bound mirrors the VO validator"
		);
	}

	[Fact]
	public void ItShouldLetOnlyTheTransitionServiceWritePublicationStatus() {
		var offenders = new List<string>();
		foreach (var path in ModuleSourceFiles()) {
			var relative = Path.GetRelativePath(RepoRoot(), path);
			if (relative.EndsWith(
					Path.Combine("Publishing", "Services",
						"PublicationStatusTransitionService.cs"),
					StringComparison.Ordinal
				)) {
				continue;
			}

			var lines = File.ReadAllLines(path);
			for (var i = 0; i < lines.Length; i++) {
				var line = lines[i];
				if (!line.Contains(".Status =", StringComparison.Ordinal)) {
					continue;
				}

				// A double equals is a READ (status comparison), never a write.
				if (line.Contains(".Status ==", StringComparison.Ordinal)) {
					continue;
				}

				var lowered = line.ToLowerInvariant();
				var targetLooksLikePublication =
					lowered.Contains("publication") || lowered.Contains("pub.");
				if (targetLooksLikePublication) {
					offenders.Add($"{relative}:{i + 1}: {line.Trim()}");
				}
			}
		}

		offenders.Should().BeEmpty(
			"only PublicationStatusTransitionService may write Publication.Status; "
				+ "found {0} rogue writer(s)",
			offenders.Count
		);
	}

	private static IEnumerable<string> ModuleSourceFiles() {
		return Directory.EnumerateFiles(
			Path.Combine(RepoRoot(), "apps", "api", "Modules"),
			"*.cs",
			SearchOption.AllDirectories
		);
	}

	private static string RepoRoot() {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);
		while (directory is not null) {
			if (File.Exists(Path.Combine(directory.FullName, "justfile"))) {
				return directory.FullName;
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the repo root (containing justfile) by walking up from "
				+ $"{AppContext.BaseDirectory}."
		);
	}
}
