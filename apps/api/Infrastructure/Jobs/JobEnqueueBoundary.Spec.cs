using System.Text;
using System.Text.RegularExpressions;

using FluentAssertions;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Architecture guard (design §8/§9, F15): the ONLY write path into job_queue is
// IJobEnqueuer inside Infrastructure/Jobs. Any producer constructing JobQueueItem
// rows, adding through the DbSet (property or Set<JobQueueItem>()), bulk-mutating via
// ExecuteUpdate/ExecuteDelete (including through intervening query operators), or
// issuing raw job_queue DML elsewhere bypasses definition policy, payload
// validation, and provenance stamping — this spec fails the build on such drift.
//
// Mechanism (review round-5, captain decision): the source is lexed by ROSLYN
// (Microsoft.CodeAnalysis.CSharp — already pinned centrally for packages/lint-cs),
// not a hand-rolled scanner. Two views are rendered from the token/trivia stream:
// the MASKED view blanks string/char literal TOKEN text — including interpolated
// string text portions and format clauses, which are literal per the C# grammar —
// while interpolation EXPRESSION tokens stay visible, and comments become spaces;
// the UNMASKED view only drops comments, keeping all string text for the raw-SQL
// pass. Roslyn's lexer handles every grammar case by construction: comments inside
// holes, format clauses, arbitrary-length raw delimiters, nesting. The API-shape
// regex patterns run over the masked render; the detector is itself tested against
// a fixture corpus. Residual gaps (documented): alias-variable indirection,
// reflection, and EF interceptors are not detectable lexically.
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
			"var s = \"prefix\" + db.JobQueue.Add(row) + \"suffix\";",
			// Round-5: a comment inside the hole must not end the hole early and
			// hide the mutation that follows it.
			"var s = $\"{/* } */ db.JobQueue.Add(row)}\";",
			// Round-7: masking an inactive branch must not consume active code
			// immediately following its closing directive.
			"#if false\ndb.JobQueue.Add(inactive);\n#endif\ndb.JobQueue.Add(active);",
			// Round-8: all preprocessor branches are conservatively scanned,
			// including permanently disabled and configuration-specific code.
			"#if false\ndbContext.JobQueue.Add(row);\n#endif",
			"#if DEBUG\ndbContext.JobQueue.Add(row);\n#endif",
			"#if NET10_0_OR_GREATER\ndbContext.JobQueue.Add(row);\n#endif",
			"#if true\nvar value = 1;\n#else\ndbContext.JobQueue.Add(row);\n#endif",
			"#if true\nvar value = 1;\n#elif DEBUG\ndbContext.JobQueue.Add(row);\n#endif",
			"#if DEBUG\ncmd.CommandText = \"DELETE FROM job_queue WHERE id = 1\";\n#endif"
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
			// 4-quote raw literal containing a 3-quote run + JobQueue text —
			// masked whole, never prematurely terminated at the inner quotes.
			"var doc = " + q4 + " has " + q3 + " inside and JobQueue.Add(row) text "
				+ q4 + ";",
			// A string nested in a hole is still literal text.
			"var s = $\"{Render(\"JobQueue.Add is documented behavior\")}\";",
			// Adjacent literals that only ASSEMBLE the forbidden text.
			"var s = \"JobQueue\" + \".Add\";",
			// Round-5: a format clause is literal text per the C# grammar, not
			// executable code.
			"var s = $\"{value:JobQueue.Add(row)}\";",
			// Comments inside disabled text are still comments after recursive
			// rendering, so SQL-looking prose must not leak into either view.
			"#if false\n// INSERT INTO job_queue (id) VALUES (1)\n#endif",
			// Directive message text is metadata, not executable source.
			"#region JobQueue.Add(row)\nvar value = 1;\n#endregion"
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
		var (codeOnly, withStrings) = RenderViews(source);
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

	// String/char literal TEXT tokens, blanked in the masked view. Interpolated
	// strings are not single tokens: their literal portions AND format clauses lex
	// as InterpolatedStringTextToken while hole expressions are ordinary tokens —
	// so masking these kinds hides exactly the text and keeps the code.
	private static readonly HashSet<SyntaxKind> LiteralTextTokenKinds = [
		SyntaxKind.StringLiteralToken,
		SyntaxKind.SingleLineRawStringLiteralToken,
		SyntaxKind.MultiLineRawStringLiteralToken,
		SyntaxKind.Utf8StringLiteralToken,
		SyntaxKind.Utf8SingleLineRawStringLiteralToken,
		SyntaxKind.Utf8MultiLineRawStringLiteralToken,
		SyntaxKind.CharacterLiteralToken,
		SyntaxKind.InterpolatedStringTextToken
	];

	// Renders both views in one pass over Roslyn's token/trivia stream. Every token
	// carries its exact leading/trailing trivia, so appending
	// trivia + token + trivia reproduces the file; comments (incl. doc comments)
	// become a space in both views, literal-text tokens become spaces in the masked
	// view only.
	private static (string CodeOnly, string WithStrings) RenderViews(string source) {
		var root = CSharpSyntaxTree.ParseText(source).GetRoot();
		var masked = new StringBuilder(source.Length);
		var unmasked = new StringBuilder(source.Length);

		foreach (var token in root.DescendantTokens(descendIntoTrivia: false)) {
			AppendTrivia(masked, unmasked, token.LeadingTrivia);

			var text = token.Text;
			unmasked.Append(text);
			masked.Append(
				LiteralTextTokenKinds.Contains(token.Kind())
					? new string(' ', text.Length)
					: text
			);

			AppendTrivia(masked, unmasked, token.TrailingTrivia);
		}

		return (masked.ToString(), unmasked.ToString());
	}

	private static void AppendTrivia(
		StringBuilder masked,
		StringBuilder unmasked,
		SyntaxTriviaList triviaList
	) {
		foreach (var trivia in triviaList) {
			// Disabled text is plain C# source from a non-selected preprocessor
			// branch. Render it recursively so every build configuration (including
			// #if false) is covered by the same literal/comment masking rules.
			if (trivia.IsKind(SyntaxKind.DisabledTextTrivia)) {
				var disabledText = trivia.ToFullString();
				var (disabledCodeOnly, disabledWithStrings) = RenderViews(disabledText);
				AppendRenderedSegment(masked, disabledCodeOnly, trivia.FullSpan.Length);
				AppendRenderedSegment(unmasked, disabledWithStrings, trivia.FullSpan.Length);
				continue;
			}

			// Directive conditions and messages are metadata, not executable source.
			if (trivia.IsDirective) {
				var blank = new string(' ', trivia.FullSpan.Length);
				masked.Append(blank);
				unmasked.Append(blank);
				continue;
			}

			if (trivia.IsKind(SyntaxKind.SingleLineCommentTrivia)
				|| trivia.IsKind(SyntaxKind.MultiLineCommentTrivia)
				|| trivia.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia)
				|| trivia.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia)) {
				masked.Append(' ');
				unmasked.Append(' ');
				continue;
			}

			var text = trivia.ToFullString();
			masked.Append(text);
			unmasked.Append(text);
		}
	}

	private static void AppendRenderedSegment(
		StringBuilder builder,
		string rendered,
		int originalLength
	) {
		// Comment trivia is intentionally contracted to one space by RenderViews.
		// Copy at most the original span and pad any shortfall so recursively
		// splicing a disabled branch cannot shift the source that follows it. The
		// detector reports pattern names, not source offsets, so internal offsets
		// within a contracted comment are not consumed.
		var copyLength = Math.Min(rendered.Length, originalLength);
		builder.Append(rendered.AsSpan(0, copyLength));
		builder.Append(' ', originalLength - copyLength);
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
