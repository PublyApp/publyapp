using System.Text.RegularExpressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Architecture guard (design §8/§9, F15): the ONLY write path into job_queue is
// IJobEnqueuer inside Infrastructure/Jobs. Any producer constructing JobQueueItem
// rows, adding through the DbSet (property or Set<JobQueueItem>()), bulk-mutating via
// ExecuteUpdate/ExecuteDelete, or issuing raw job_queue DML elsewhere bypasses
// definition policy, payload validation, and provenance stamping — this spec fails
// the build on such drift.
//
// Mechanism choice (review finding): a hardened textual scan — comments stripped so
// they can't false-positive, matching case-insensitive, patterns covering the known
// bypasses (DbSet property mutation, Set<JobQueueItem>(), entity construction, raw
// INSERT/UPDATE/DELETE SQL, ExecuteUpdate/Delete). A Roslyn semantic guard was
// considered and skipped: it would add a Microsoft.CodeAnalysis package to the test
// shell via the centrally-managed Directory.Packages.props, a file the parallel 2B
// lane is editing tonight. Residual gaps (documented): indirection through a local
// alias variable, reflection, and EF interceptors are not detectable textually.
public sealed partial class JobEnqueueBoundarySpec {
	// Paths (relative to apps/api) where touching the queue is legitimate: the
	// engine itself, the EF model/config layer, migrations, and specs/test infra.
	private static readonly string[] AllowedPathPrefixes = [
		"Infrastructure/Jobs/",
		"Data/",
		"Migrations/",
		"Modules/Jobs/Entities/",
		"Lib/Testing/"
	];

	// Matched case-insensitively against comment-stripped source.
	private static readonly string[] ForbiddenPatterns = [
		// DbSet property mutation (Add/AddAsync/AddRange/Remove/RemoveRange).
		"jobqueue.add",
		"jobqueue.remove",
		// Bulk mutation terminals on the queue set.
		"jobqueue.executeupdate",
		"jobqueue.executedelete",
		// Bypassing the DbSet property entirely.
		"set<jobqueueitem>",
		// Constructing rows for insertion.
		"new jobqueueitem",
		// Raw SQL DML.
		"insert into job_queue",
		"update job_queue",
		"delete from job_queue"
	];

	[GeneratedRegex(@"/\*.*?\*/", RegexOptions.Singleline)]
	private static partial Regex BlockComments();

	[GeneratedRegex(@"//[^\r\n]*")]
	private static partial Regex LineComments();

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

			var content = StripComments(File.ReadAllText(file));

			foreach (var pattern in ForbiddenPatterns) {
				if (content.Contains(pattern, StringComparison.OrdinalIgnoreCase)) {
					offenders.Add($"{relative}: '{pattern}'");
				}
			}
		}

		offenders.Should().BeEmpty(
			"job_queue writes outside Infrastructure/Jobs bypass the trusted enqueue "
			+ "boundary (IJobEnqueuer) — enqueue through a JobDefinition instead"
		);
	}

	private static string StripComments(string source) {
		var withoutBlocks = BlockComments().Replace(source, " ");
		return LineComments().Replace(withoutBlocks, " ");
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
