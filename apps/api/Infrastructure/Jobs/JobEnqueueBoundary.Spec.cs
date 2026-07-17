using System.Text.RegularExpressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Architecture guard (design §8/§9, F15): the ONLY write path into job_queue is
// IJobEnqueuer inside Infrastructure/Jobs. Any producer constructing JobQueueItem
// rows, adding through the DbSet (property or Set<JobQueueItem>()), bulk-mutating via
// ExecuteUpdate/ExecuteDelete (including through intervening query operators), or
// issuing raw job_queue DML elsewhere bypasses definition policy, payload
// validation, and provenance stamping — this spec fails the build on such drift.
//
// Mechanism choice (review findings 8 + re-review 4): a hardened textual scan —
// comments stripped so they can't false-positive, statement-spanning regexes
// tolerant of whitespace/newlines and intervening query operators, and the detector
// is itself tested against known-bad and known-good fixture snippets. A Roslyn
// semantic guard was considered and skipped: it would add a Microsoft.CodeAnalysis
// package through the centrally-managed Directory.Packages.props, a file the
// parallel 2B lane is editing tonight. Residual gaps (documented): indirection
// through a local alias variable, reflection, and EF interceptors are not
// detectable textually.
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

	// DbSet property mutation, whitespace/newline tolerant: JobQueue . Add…,
	// JobQueue\n.AddAsync(…), Remove/RemoveRange included.
	[GeneratedRegex(@"\bJobQueue\s*\.\s*(Add|Remove)", RegexOptions.IgnoreCase)]
	private static partial Regex DbSetMutation();

	// Bulk mutation reached through ANY chain of query operators within the same
	// statement (no ';' between): JobQueue.Where(...).ExecuteDeleteAsync() etc.
	[GeneratedRegex(
		@"\bJobQueue\b[^;]*?\.\s*Execute(Update|Delete)",
		RegexOptions.IgnoreCase | RegexOptions.Singleline
	)]
	private static partial Regex BulkMutation();

	// Bypassing the DbSet property entirely.
	[GeneratedRegex(@"\bSet\s*<\s*JobQueueItem\s*>", RegexOptions.IgnoreCase)]
	private static partial Regex SetOfJobQueueItem();

	// Constructing rows for insertion.
	[GeneratedRegex(@"\bnew\s+JobQueueItem\b", RegexOptions.IgnoreCase)]
	private static partial Regex EntityConstruction();

	// Raw SQL DML, whitespace tolerant.
	[GeneratedRegex(
		@"\b(insert\s+into|update|delete\s+from)\s+job_queue\b",
		RegexOptions.IgnoreCase | RegexOptions.Singleline
	)]
	private static partial Regex RawSqlMutation();

	[GeneratedRegex(@"/\*.*?\*/", RegexOptions.Singleline)]
	private static partial Regex BlockComments();

	[GeneratedRegex(@"//[^\r\n]*")]
	private static partial Regex LineComments();

	private static readonly (string Name, Regex Pattern)[] ForbiddenPatterns = [
		("DbSet Add/Remove", DbSetMutation()),
		("ExecuteUpdate/ExecuteDelete", BulkMutation()),
		("Set<JobQueueItem>", SetOfJobQueueItem()),
		("new JobQueueItem", EntityConstruction()),
		("raw job_queue DML", RawSqlMutation())
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

			foreach (var finding in FindForbiddenPatterns(File.ReadAllText(file))) {
				offenders.Add($"{relative}: {finding}");
			}
		}

		offenders.Should().BeEmpty(
			"job_queue writes outside Infrastructure/Jobs bypass the trusted enqueue "
			+ "boundary (IJobEnqueuer) — enqueue through a JobDefinition instead"
		);
	}

	// The guard is only as strong as what it provably detects: the detector itself
	// is tested against known-bad formatting bypasses and known-good look-alikes,
	// not just the (currently clean) live codebase.
	[Fact]
	public void ItShouldCatchKnownBypassFormattingsInTheDetectorItself() {
		string[] knownBad = [
			// Multiline DbSet mutation.
			"await dbContext.JobQueue\n\t.AddAsync(item, ct);",
			// Bulk mutation through an intervening query operator.
			"await dbContext.JobQueue.Where(j => j.Status == 0).ExecuteDeleteAsync();",
			// Bulk update, multiline with operators.
			"await dbContext.JobQueue\n\t.Where(j => due)\n\t.ExecuteUpdateAsync(s => s);",
			// DbSet bypassed via Set<T>().
			"dbContext.Set<JobQueueItem>().Add(row);",
			"dbContext.Set< JobQueueItem >().AddRange(rows);",
			// Entity construction.
			"var row = new JobQueueItem { JobType = \"x\" };",
			// Raw SQL, mixed case and spacing.
			"cmd.CommandText = \"INSERT  INTO job_queue (id) VALUES (1)\";",
			"await db.Database.ExecuteSqlAsync($\"update job_queue set status = 0\");",
			"await db.Database.ExecuteSqlAsync($\"DELETE FROM job_queue WHERE id = {id}\");",
			// Remove range, spaced.
			"dbContext.JobQueue . RemoveRange(rows);"
		];

		string[] knownGood = [
			// Reads are legal.
			"var due = await dbContext.JobQueue.Where(j => j.Status == 0).ToListAsync();",
			"var count = await dbContext.JobQueue.CountAsync();",
			// Comments never trigger.
			"// never call JobQueue.Add or new JobQueueItem outside the engine",
			"/* INSERT INTO job_queue is engine-only */ var x = 1;",
			// Other identifiers sharing the prefix.
			"JobQueueProcessor.ClaimBatchAsync(db, w, 300, 20, ct);",
			// A different statement's ExecuteDelete after the queue read ended.
			"var a = db.JobQueue.Count(); await db.Session.ExecuteDeleteAsync();"
		];

		foreach (var snippet in knownBad) {
			FindForbiddenPatterns(snippet).Should().NotBeEmpty(
				$"detector must catch: {snippet}"
			);
		}

		foreach (var snippet in knownGood) {
			FindForbiddenPatterns(snippet).Should().BeEmpty(
				$"detector must not flag: {snippet}"
			);
		}
	}

	// Shared detector: comment-strip, then match every statement-spanning pattern.
	private static List<string> FindForbiddenPatterns(string source) {
		var stripped = LineComments().Replace(BlockComments().Replace(source, " "), " ");
		var findings = new List<string>();

		foreach (var (name, pattern) in ForbiddenPatterns) {
			if (pattern.IsMatch(stripped)) {
				findings.Add(name);
			}
		}

		return findings;
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
