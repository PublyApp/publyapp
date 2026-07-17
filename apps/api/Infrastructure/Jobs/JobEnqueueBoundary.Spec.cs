using System.Text;
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
// Mechanism (review round-4): the API-shape patterns run against a LEXICALLY masked
// view of each file — a small C# scanner walks the source, strips comments, masks
// string/char literal TEXT, and PRESERVES interpolation-hole expressions (holes are
// code: `$"{db.JobQueue.Add(row)}"` must be caught, while a log message naming
// JobQueue must not be). The raw-SQL pass runs on a comment-stripped view with
// string contents fully visible (SQL lives inside strings). The scanner handles
// regular strings (backslash escapes), verbatim @/$@/@$ strings (doubled-quote
// escapes), interpolated variants with nested holes and quotes inside holes, raw
// string literals with arbitrary 3+ quote delimiters and $-count-matched {{holes}},
// char literals, and adjacent combinations. The detector is itself tested against a
// fixture corpus of known-bad and known-good snippets. Residual gaps (documented):
// alias-variable indirection, reflection, and EF interceptors are not detectable
// textually.
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

	// Raw SQL DML, whitespace tolerant — matched with string contents VISIBLE.
	[GeneratedRegex(
		@"\b(insert\s+into|update|delete\s+from)\s+job_queue\b",
		RegexOptions.IgnoreCase | RegexOptions.Singleline
	)]
	private static partial Regex RawSqlMutation();

	// Matched against the literal-masked view (API shapes are code, not text).
	private static readonly (string Name, Regex Pattern)[] ApiPatterns = [
		("DbSet Add/Remove", DbSetMutation()),
		("ExecuteUpdate/ExecuteDelete", BulkMutation()),
		("Set<JobQueueItem>", SetOfJobQueueItem()),
		("new JobQueueItem", EntityConstruction())
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
	// is tested against known-bad formatting/interpolation bypasses and known-good
	// look-alikes, not just the (currently clean) live codebase.
	[Fact]
	public void ItShouldCatchKnownBypassFormattingsInTheDetectorItself() {
		var q3 = new string('"', 3);
		var q4 = new string('"', 4);

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
			"dbContext.JobQueue . RemoveRange(rows);",
			// Round-4: executable API calls hidden in interpolation holes.
			"var s = $\"{dbContext.JobQueue.Add(row)}\";",
			"var s = $@\"{dbContext.Set<JobQueueItem>().Add(row)}\";",
			"var s = $$" + q3 + "{{dbContext.JobQueue.ExecuteDelete()}}" + q3 + ";",
			// Nested string INSIDE a hole must not hide the surrounding call.
			"var s = $\"{db.JobQueue.Add(Get(\"x\"))}\";",
			// Adjacent literals around real mutating code.
			"var s = \"prefix\" + db.JobQueue.Add(row) + \"suffix\";"
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
			"var a = db.JobQueue.Count(); await db.Session.ExecuteDeleteAsync();",
			// A STRING mentioning JobQueue next to another set's bulk delete.
			"logger.LogInformation(\"JobQueue cleanup: {Count}\", "
				+ "await db.Sessions.ExecuteDeleteAsync());",
			// Round-4: 4-quote raw literal containing a 3-quote run + JobQueue text
			// — masked whole, never prematurely terminated at the inner quotes.
			"var doc = " + q4 + " has " + q3 + " inside and JobQueue.Add(row) text "
				+ q4 + ";",
			// A string nested in a hole is still literal text.
			"var s = $\"{Render(\"JobQueue.Add is documented behavior\")}\";",
			// Adjacent literals that only ASSEMBLE the forbidden text.
			"var s = \"JobQueue\" + \".Add\";"
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

	// Shared detector: API-shape patterns see code only (literal text masked, hole
	// expressions preserved); the raw-SQL pass sees string contents, comments gone.
	private static List<string> FindForbiddenPatterns(string source) {
		var codeOnly = ScanAndMask(source, maskLiteralText: true);
		var withStrings = ScanAndMask(source, maskLiteralText: false);
		var findings = new List<string>();

		foreach (var (name, pattern) in ApiPatterns) {
			if (pattern.IsMatch(codeOnly)) {
				findings.Add(name);
			}
		}

		if (RawSqlMutation().IsMatch(withStrings)) {
			findings.Add("raw job_queue DML");
		}

		return findings;
	}

	// --- lexical scanner (test infrastructure) ------------------------------------
	// Walks C# source: comments become one space; char/string literal TEXT is
	// masked (or kept verbatim, per flag); interpolation-hole expressions are
	// recursively re-scanned as CODE either way.

	private static string ScanAndMask(string source, bool maskLiteralText) {
		var builder = new StringBuilder(source.Length);
		var i = 0;

		while (i < source.Length) {
			var c = source[i];

			if (c == '/' && i + 1 < source.Length && source[i + 1] == '/') {
				while (i < source.Length && source[i] != '\n') {
					i++;
				}
				builder.Append(' ');
				continue;
			}

			if (c == '/' && i + 1 < source.Length && source[i + 1] == '*') {
				var end = source.IndexOf("*/", i + 2, StringComparison.Ordinal);
				i = end < 0 ? source.Length : end + 2;
				builder.Append(' ');
				continue;
			}

			if (c == '\'') {
				i = ScanCharLiteral(source, builder, i, maskLiteralText);
				continue;
			}

			if (c is '"' or '$' or '@') {
				var advanced = TryScanStringLiteral(source, builder, i, maskLiteralText);
				if (advanced > i) {
					i = advanced;
					continue;
				}
			}

			builder.Append(c);
			i++;
		}

		return builder.ToString();
	}

	// Returns the index after the literal, or start when this is not a string
	// (e.g. '@' beginning an identifier).
	private static int TryScanStringLiteral(
		string source,
		StringBuilder builder,
		int start,
		bool mask
	) {
		var i = start;
		var dollars = 0;
		var verbatim = false;

		while (i < source.Length && (source[i] == '$' || source[i] == '@')) {
			if (source[i] == '$') {
				dollars++;
			} else {
				verbatim = true;
			}
			i++;
		}

		if (i >= source.Length || source[i] != '"') {
			return start;
		}

		var quotes = 0;
		while (i + quotes < source.Length && source[i + quotes] == '"') {
			quotes++;
		}

		builder.Append('"');
		int end;
		if (!verbatim && quotes >= 3) {
			// Raw string literal: the opening quote run IS the delimiter — any
			// length >= 3 — so inner runs shorter than it never terminate early.
			end = ScanRawStringBody(source, builder, i + quotes, quotes, dollars, mask);
		} else {
			end = ScanQuotedStringBody(source, builder, i + 1, verbatim, dollars > 0, mask);
		}
		builder.Append('"');

		return end;
	}

	private static int ScanQuotedStringBody(
		string source,
		StringBuilder builder,
		int i,
		bool verbatim,
		bool interpolated,
		bool mask
	) {
		while (i < source.Length) {
			var c = source[i];

			if (c == '"') {
				if (verbatim && i + 1 < source.Length && source[i + 1] == '"') {
					// Doubled-quote escape: literal text.
					if (!mask) {
						builder.Append("\"\"");
					}
					i += 2;
					continue;
				}
				return i + 1;
			}

			if (!verbatim && c == '\\') {
				if (!mask && i + 1 < source.Length) {
					builder.Append(source, i, 2);
				}
				i += 2;
				continue;
			}

			if (interpolated && c == '{') {
				if (i + 1 < source.Length && source[i + 1] == '{') {
					// Escaped brace: literal text.
					if (!mask) {
						builder.Append("{{");
					}
					i += 2;
					continue;
				}
				i = ScanHole(source, builder, i, braceCount: 1, mask);
				continue;
			}

			if (interpolated && c == '}' && i + 1 < source.Length && source[i + 1] == '}') {
				if (!mask) {
					builder.Append("}}");
				}
				i += 2;
				continue;
			}

			if (!mask) {
				builder.Append(c);
			}
			i++;
		}

		return i;
	}

	private static int ScanRawStringBody(
		string source,
		StringBuilder builder,
		int i,
		int delimiterLength,
		int dollars,
		bool mask
	) {
		while (i < source.Length) {
			if (source[i] == '"') {
				var run = 0;
				while (i + run < source.Length && source[i + run] == '"') {
					run++;
				}
				if (run >= delimiterLength) {
					// Quote runs SHORTER than the delimiter are content; this
					// run closes the literal.
					return i + delimiterLength;
				}
				if (!mask) {
					builder.Append(source, i, run);
				}
				i += run;
				continue;
			}

			if (dollars > 0 && source[i] == '{') {
				var run = 0;
				while (i + run < source.Length && source[i + run] == '{') {
					run++;
				}
				if (run >= dollars) {
					// Leading braces beyond the $ count are literal text; the
					// last `dollars` braces open a hole.
					if (!mask) {
						builder.Append('{', run - dollars);
					}
					i += run - dollars;
					i = ScanHole(source, builder, i, braceCount: dollars, mask);
					continue;
				}
				if (!mask) {
					builder.Append(source, i, run);
				}
				i += run;
				continue;
			}

			if (!mask) {
				builder.Append(source[i]);
			}
			i++;
		}

		return i;
	}

	// An interpolation hole is CODE: its expression is preserved and recursively
	// re-scanned (so a string nested in the hole is still masked as text). Tracks
	// nested braces and skips nested string/char literals so a '}' inside them
	// never closes the hole. Opens/closes with `braceCount` braces ($-count in raw
	// interpolated literals, 1 otherwise).
	private static int ScanHole(
		string source,
		StringBuilder builder,
		int i,
		int braceCount,
		bool mask
	) {
		i += braceCount;
		var expressionStart = i;
		var depth = 1;

		while (i < source.Length && depth > 0) {
			var c = source[i];

			if (c == '\'') {
				i = ScanCharLiteral(source, new StringBuilder(), i, mask: true);
				continue;
			}

			if (c is '"' or '$' or '@') {
				var skipped = TryScanStringLiteral(source, new StringBuilder(), i, mask: true);
				if (skipped > i) {
					i = skipped;
					continue;
				}
			}

			if (c == '{') {
				depth++;
				i++;
				continue;
			}

			if (c == '}') {
				if (depth == 1) {
					var run = 0;
					while (i + run < source.Length && source[i + run] == '}') {
						run++;
					}
					if (run >= braceCount) {
						AppendHoleExpression(source, builder, expressionStart, i, mask);
						return i + braceCount;
					}
				}
				depth--;
				i++;
				continue;
			}

			i++;
		}

		// Malformed/unterminated hole: preserve what was seen and stop.
		AppendHoleExpression(source, builder, expressionStart, i, mask);
		return i;
	}

	private static void AppendHoleExpression(
		string source,
		StringBuilder builder,
		int expressionStart,
		int expressionEnd,
		bool mask
	) {
		builder.Append(' ');
		builder.Append(ScanAndMask(source[expressionStart..expressionEnd], mask));
		builder.Append(' ');
	}

	private static int ScanCharLiteral(
		string source,
		StringBuilder builder,
		int start,
		bool mask
	) {
		var i = start + 1;

		while (i < source.Length && source[i] != '\'') {
			if (source[i] == '\\') {
				i++;
			}
			i++;
		}

		i = Math.Min(i + 1, source.Length);
		builder.Append(mask ? "''" : source[start..i]);
		return i;
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
