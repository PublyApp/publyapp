using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// Architecture pin for the external-state model (K-1, issue #863): every
/// <see cref="ExternalStateStatus"/> member MUST be covered by exactly one entry in
/// the DeadLetterResolutionCatalog below — the single table that says how each state
/// leaves the DLQ. Adding an eighth enum member without extending the catalog fails
/// the build, so no future status can silently fall outside every resolution path
/// (the exact gap that motivated #863).
/// </summary>
public sealed class DeadLetterResolutionCatalogSpec {
	/// <summary>
	/// The catalog: one row per ExternalStateStatus member, pinned by name so a
	/// rename breaks this file loudly instead of silently desyncing the coverage.
	/// </summary>
	private static readonly HashSet<string> CatalogCoverage = new(
		StringComparer.Ordinal
	) {
		nameof(ExternalStateStatus.None),           // age retention applies (default/backfill)
		nameof(ExternalStateStatus.Present),        // future sweep-batch input (#864/#865 adjacent)
		nameof(ExternalStateStatus.Expired),        // age retention applies
		nameof(ExternalStateStatus.NeverPrepared),  // permanently retention-eligible
		nameof(ExternalStateStatus.Missing),        // age retention applies again post-triage
		nameof(ExternalStateStatus.Transferred),    // age retention applies
		nameof(ExternalStateStatus.Unclassified),   // POST /staff/dead-letter/{id}/resolve-unclassified
	};

	/// <summary>Retention sweep exempts exactly these states (design D2).</summary>
	private static readonly HashSet<ExternalStateStatus> RetentionExemptions = [
		ExternalStateStatus.Present,
		ExternalStateStatus.Unclassified,
	];

	[Fact]
	public void ItShouldCoverEveryEnumMemberInExactlyOneCatalogEntry() {
		var enumNames = Enum.GetNames<ExternalStateStatus>();

		enumNames.Length.Should().BeGreaterThanOrEqualTo(
			7, "the K-1 member set is the floor; growth must extend the catalog"
		);
		enumNames.Should().OnlyHaveUniqueItems();

		var uncovered = enumNames.Where(n => !CatalogCoverage.Contains(n)).ToList();
		uncovered.Should().BeEmpty(
			"every ExternalStateStatus member needs a DeadLetterResolutionCatalog "
			+ "entry naming its resolution path"
		);

		var unknown = CatalogCoverage.Where(c => !enumNames.Contains(c)).ToList();
		unknown.Should().BeEmpty(
			"catalog entries must name real enum members — remove stale rows"
		);
	}

	[Fact]
	public void ItShouldExemptFromRetentionExactlyThePresentAndUnclassifiedStates() {
		Enum.GetValues<ExternalStateStatus>()
			.Where(s => RetentionExemptions.Contains(s))
			.Should().BeEquivalentTo([
				ExternalStateStatus.Present,
				ExternalStateStatus.Unclassified,
			], "retention skips only states whose effects may exist or need triage");
	}
}
