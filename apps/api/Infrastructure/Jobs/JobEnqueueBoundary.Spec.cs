using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Architecture guard (design §8/§9, F15): the ONLY write path into job_queue is
// IJobEnqueuer inside Infrastructure/Jobs. Any producer constructing JobQueueItem
// rows, adding to the JobQueue DbSet, or issuing raw job_queue inserts elsewhere
// bypasses definition policy, payload validation, and provenance stamping — this
// spec fails the build on such drift, source-scanning like the repo's other
// architecture conventions assert reflection facts.
public sealed class JobEnqueueBoundarySpec {
	// Paths (relative to apps/api) where touching the queue is legitimate: the
	// engine itself, the EF model/config layer, migrations, and specs/test infra.
	private static readonly string[] AllowedPathPrefixes = [
		"Infrastructure/Jobs/",
		"Data/",
		"Migrations/",
		"Modules/Jobs/Entities/",
		"Lib/Testing/"
	];

	private static readonly string[] ForbiddenPatterns = [
		"JobQueue.Add",
		"JobQueue.Remove",
		"new JobQueueItem",
		"INSERT INTO job_queue"
	];

	[Fact]
	public void ItShouldOnlyWriteJobQueueRowsFromInsideTheEngine() {
		var apiRoot = FindApiRoot();
		var offenders = new List<string>();

		foreach (var file in Directory.EnumerateFiles(apiRoot, "*.cs", SearchOption.AllDirectories)) {
			var relative = Path.GetRelativePath(apiRoot, file).Replace('\\', '/');

			if (relative.Contains("/obj/") || relative.Contains("/bin/")
				|| relative.Contains(".artifacts/")
				|| relative.EndsWith(".Spec.cs", StringComparison.Ordinal)
				|| AllowedPathPrefixes.Any(p => relative.StartsWith(p, StringComparison.Ordinal))) {
				continue;
			}

			var content = File.ReadAllText(file);
			foreach (var pattern in ForbiddenPatterns) {
				if (content.Contains(pattern, StringComparison.Ordinal)) {
					offenders.Add($"{relative}: '{pattern}'");
				}
			}
		}

		offenders.Should().BeEmpty(
			"job_queue writes outside Infrastructure/Jobs bypass the trusted enqueue "
			+ "boundary (IJobEnqueuer) — enqueue through a JobDefinition instead"
		);
	}

	// The test assembly runs from apps/api/.artifacts/bin/...; walk up until the
	// directory containing PublyApp.Api.csproj (the apps/api root).
	private static string FindApiRoot() {
		var current = new DirectoryInfo(AppContext.BaseDirectory);

		while (current is not null) {
			if (File.Exists(Path.Combine(current.FullName, "PublyApp.Api.csproj"))) {
				return current.FullName;
			}

			current = current.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the apps/api root (PublyApp.Api.csproj) above "
			+ AppContext.BaseDirectory
		);
	}
}
