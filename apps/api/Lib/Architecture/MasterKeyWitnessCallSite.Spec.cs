using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Review r3 MINOR: nothing pinned the two SocialAccountsMasterKeyWitness boot gates in
/// Program.cs — deleting BOTH left the whole suite green, so the gate was unguarded
/// against regression (adversarial mutation). This spec asserts the REAL artifact: the
/// actual Program.cs source must invoke EnsureMasterKeyUsable in BOTH role branches
/// (worker Generic Host and web host), and each call must feed it the master key from
/// AppEnvironment.
/// </summary>
public sealed class MasterKeyWitnessCallSiteSpec {
	private static string FindProgramCsSource() {
		var dir = new DirectoryInfo(AppContext.BaseDirectory);
		while (dir is not null) {
			var target = Path.Combine(dir.FullName, "apps", "api", "Program.cs");
			if (File.Exists(target)) {
				return File.ReadAllText(target);
			}
			dir = dir.Parent;
		}
		throw new InvalidOperationException(
			"apps/api/Program.cs not found above the test output directory; "
				+ "if Program.cs moved, update this guard."
		);
	}

	[Fact]
	public void ItShouldGateTheWorkerHostWithTheMasterKeyWitness() {
		var source = FindProgramCsSource();
		source.Should().Contain(
			"EnsureMasterKeyUsable",
			"the worker branch must refuse to boot when the master key cannot decrypt persisted data"
		);
	}

	[Fact]
	public void ItShouldGateBothBootPathsWithExactlyTwoWitnessCallSites() {
		var source = FindProgramCsSource();

		// The web-host call site lives after builder.Build(); the worker one inside the
		// Worker-role branch. Count them: exactly TWO call sites are required — api/all
		// AND worker. One deleted = red.
		var count = CountOccurrences(source, "EnsureMasterKeyUsable");
		count.Should().Be(
			2,
			"both boot paths (worker Generic Host and web host) must invoke the witness; "
				+ "a single missing gate lets that role boot with a wrong master key"
		);
	}

	[Fact]
	public void ItShouldFeedEachWitnessCallSiteTheAppEnvironmentMasterKey() {
		// Whitespace-normalised so multi-line call sites still match.
		var source = Normalize(FindProgramCsSource());

		// Each call site must pass AppEnvironment's parsed key, not an ad-hoc value.
		var count = CountOccurrences(
			source,
			"EnsureMasterKeyUsable(AppEnvironment.Instance.SocialAccountsMasterKey"
		);
		count.Should().Be(2, "both call sites must use the AppEnvironment-parsed key");
	}

	private static string Normalize(string source) {
		return string.Concat(
			source.Where(static c => !char.IsWhiteSpace(c))
		);
	}

	private static int CountOccurrences(string haystack, string needle) {
		var count = 0;
		var offset = 0;
		while (true) {
			var idx = haystack.IndexOf(needle, offset, StringComparison.Ordinal);
			if (idx < 0) {
				break;
			}
			count++;
			offset = idx + needle.Length;
		}
		return count;
	}
}
