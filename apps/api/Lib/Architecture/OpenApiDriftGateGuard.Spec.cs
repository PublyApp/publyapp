using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Guards the OpenAPI document-generation switch in <c>apps/api/PublyApp.Api.csproj</c>.
///
/// The openapi-spec-drift gate (the <c>openapi-spec-drift.yml</c> workflow AND the local
/// <c>just ci-spec-drift</c>) works by rebuilding with a PLAIN <c>dotnet build</c>
/// (<c>build-api-full</c>) and diffing the resulting <c>apps/api/openapi.json</c>. That only
/// measures drift if a plain build actually regenerates the document. If generation were
/// gated behind an opt-in flag (default-off), the plain build would leave the tracked
/// artifact untouched, <c>git diff</c> would be empty, and the gate would pass vacuously — a
/// stale spec plus a client regenerated from that stale spec would both sail through.
///
/// Round-3 self-mutation: restoring the opt-in <c>GENERATE_OPENAPI</c> flag (default-off
/// generation) left every test in the suite green, because no xunit test observed that a
/// plain build regenerates the artifact — only the drift gate itself did, and the flag
/// disables exactly that observation. This guard pins the real control (the csproj) so the
/// regression is caught in the suite instead of only by the gate it would disarm.
/// </summary>
public sealed class OpenApiDriftGateGuardSpec {
	private const string ApiCsprojRelativePath = "apps/api/PublyApp.Api.csproj";

	[Fact]
	public void ItShouldKeepOpenApiGenerationOnForTheDriftGate() {
		var csproj = ReadApiCsproj();

		csproj.Should().Contain(
			"<OpenApiGenerateDocuments>true</OpenApiGenerateDocuments>",
			"OpenAPI document generation must stay ON for the non-Test build: the "
				+ "drift gate rebuilds with a plain `dotnet build` and diffs "
				+ "apps/api/openapi.json, so a default-off generation makes the gate "
					+ "vacuous (a stale spec and a client generated from it both pass)."
		);

		csproj.Should().NotContain(
			"GENERATE_OPENAPI",
			"OpenAPI generation must NOT be gated behind an opt-in build flag. A "
				+ "default-off flag means the drift gate's plain rebuild no longer "
					+ "regenerates the artifact, so the gate stops measuring drift — "
						+ "the round-3 blocker."
		);
	}

	private static string ReadApiCsproj() {
		var repoRoot = FindRepoRoot();
		var path = Path.Combine(repoRoot, ApiCsprojRelativePath);

		File.Exists(path).Should().BeTrue(
			"the API project file moved — reconcile the guard path, do not let the "
				+ "scan silently narrow"
		);

		return File.ReadAllText(path);
	}

	private static string FindRepoRoot() {
		var current = new DirectoryInfo(AppContext.BaseDirectory);

		while (current is not null) {
			if (File.Exists(Path.Combine(current.FullName, "justfile"))) {
				return current.FullName;
			}

			current = current.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the repo root (justfile) above "
				+ AppContext.BaseDirectory
		);
	}
}
