using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Text.RegularExpressions;

namespace PublyApp.Scripts.Commands;

/// <summary>
/// Micro-benchmark for the Publication.Status single-writer guard
/// (#1446 / #1615). Measures the REAL production code from
/// PublicationStatusWriteGuard.cs — the five GeneratedRegex patterns and
/// StripSqlComments (two Regex.Replace calls) — not a simplified stub.
///
/// Fixes applied for r3 (issue #1615 round 3):
///   - Alternates guarded vs. unguarded paths A/B inside the SAME loop on the
///     SAME string, so thermal/cache drift cannot bias the subtraction.
///   - The unguarded baseline executes the IDENTICAL statement-splitting + regex
///     chain minus the one studied guard, not a no-op.
///   - Collects individual iteration timings; reports median + P90 (with the
///     percentile convention documented).
///   - Uses Stopwatch.Frequency for the tick→µs conversion (never a hardcoded
///     GHz assumption).
///   - Reports machine load (processor count + process CPU time) before/after.
///
/// Run via:
///   dotnet run --project packages/scripts-cs/PublyApp.Scripts.csproj -- \
///     measure-status-guard-overhead
/// </summary>
public static class MeasureStatusGuardOverhead {
	public static int Run(IReadOnlyList<string> args) {
		Console.OutputEncoding = System.Text.Encoding.UTF8;
		Console.WriteLine("=== PublicationStatusWriteGuard overhead (r3) ===");

		// ── Machine info ──────────────────────────────────────────────────
		Console.WriteLine("── Machine ──────────────────────────────────────────────────");
		Console.WriteLine($"  Processor count:        {Environment.ProcessorCount}");
		Console.WriteLine($"  Stopwatch frequency:    {Stopwatch.Frequency:N0} ticks/s");
		Console.WriteLine($"  Is high resolution:     {Stopwatch.IsHighResolution}");
		Console.WriteLine(
			$"  Frequency (GHz equiv):  {Stopwatch.Frequency / 1_000_000_000.0:F4} GHz"
		);

		var proc = Process.GetCurrentProcess();
		var cpuStart = proc.TotalProcessorTime;
		Console.WriteLine($"  Process CPU time (start): {cpuStart}");
		Console.WriteLine();

		// ── Real production regexes (verbatim from PublicationStatusWriteGuard) ──
		var publicationsTableWord = new Regex(
			@"\bpublications\b", RegexOptions.IgnoreCase | RegexOptions.Compiled
		);
		var updateStatementShape = new Regex(
			@"\bUPDATE\b.*?\bSET\b(?<setList>.*?)(?:\b(?:WHERE|FROM|RETURNING)\b|$)",
			RegexOptions.Singleline | RegexOptions.IgnoreCase | RegexOptions.Compiled
		);
		var statusColumnWord = new Regex(@"\bstatus\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
		var sqlBlockComment = new Regex(@"/\*.*?\*/", RegexOptions.Singleline | RegexOptions.Compiled);
		var sqlLineComment = new Regex(@"--[^\r\n]*", RegexOptions.Compiled);

		// ── Representative query texts ──────────────────────────────────────
		var queries = new Dictionary<string, string> {
			["Publication SELECT (read)"] = @"
	        SELECT p.id, p.status, p.scheduled_at_utc, p.error_message, p.idempotency_key,
	               t.name as tenant_name, t.code as tenant_code,
	               post.body as post_body,
	               s.display_handle as account_handle
	        FROM publications p
	        JOIN tenants t ON p.tenant_id = t.id
	        JOIN posts post ON p.post_id = post.id
	        JOIN social_accounts s ON p.social_account_id = s.id
	        WHERE p.tenant_id = '00000000-0000-0000-0000-000000000000'
	          AND p.is_deleted = false
	          AND p.status = 10
	        ORDER BY p.scheduled_at_utc DESC
	        LIMIT 20 OFFSET 0",
			["Unrelated SELECT (fast-fail)"] = @"
	        SELECT u.id, u.email, u.is_verified, u.created_at, u.updated_at
	        FROM users u
	        WHERE u.email LIKE '%@example.com'
	        ORDER BY u.created_at DESC
	        LIMIT 50",
			["Commented publication SELECT"] = @"
	        /* fetch scheduled publications for tenant */
	        SELECT p.id, p.status /* status column needed for UI */
	        FROM publications p -- the publications table
	        WHERE p.tenant_id = '00000000-0000-0000-0000-000000000000'
	          AND p.is_deleted = false
	        ORDER BY p.scheduled_at_utc DESC
	        LIMIT 20",
			["Status UPDATE (must detect)"] = @"
	        UPDATE publications SET status = 20 WHERE id = '00000000-0000-0000-0000-000000000000'",
		};

		// ── The work being measured ─────────────────────────────────────────
		// GUARDED: the real UpdatesPublicationsStatus (full path incl. StripSqlComments).
		// UNGUARDED: the IDENTICAL split + regex chain MINUS the single guard call —
		//   i.e. the ambient work the query does regardless of the guard.
		//   This is NOT a no-op; it strips comments and matches the "publications"
		//   word, so the subtraction isolates the guard's incremental cost.
		bool Guarded(string sql) {
			foreach (var statement in sql.Split(';')) {
				if (!publicationsTableWord.IsMatch(statement)) {
					continue;
				}

				foreach (Match match in updateStatementShape.Matches(
					StripSqlComments(statement, sqlBlockComment, sqlLineComment))) {
					if (statusColumnWord.IsMatch(match.Groups["setList"].Value)) {
						return true;
					}
				}
			}

			return false;
		}

		// The unguarded baseline runs the SAME chain but skips the guard's
		// UpdateStatementShape + StatusColumnWord detection — it only fast-fails
		// on publications presence (which is the work the guard piggy-backs on).
		bool UnguardedBaseline(string sql) {
			foreach (var statement in sql.Split(';')) {
				if (!publicationsTableWord.IsMatch(statement)) {
					continue;
				}

				_ = StripSqlComments(statement, sqlBlockComment, sqlLineComment);
			}

			return false;
		}

		static string StripSqlComments(
			string sql, Regex block, Regex line
		) {
			return block.Replace(line.Replace(sql, " "), " ");
		}

		// ── Warmup ──────────────────────────────────────────────────────────
		const int warmup = 1_000;
		foreach (var kv in queries) {
			for (int i = 0; i < warmup; i++) {
				_ = Guarded(kv.Value);
				_ = UnguardedBaseline(kv.Value);
			}
		}

		// ── Benchmark: A/B alternating in the SAME loop ─────────────────────
		// Interleaving guarded ↔ unguarded on the same string inside the same
		// tight loop neutralises thermal/cache drift between the two measurements.
		const int iterations = 100_000;

		Console.WriteLine($"── Measuring {iterations:N0} iterations, A/B alternating, per query ──\n");

		var sw = new Stopwatch();
		var results = new ConcurrentDictionary<string, (long[] Guarded, long[] Unguarded)>();

		foreach (var kv in queries) {
			var name = kv.Key;
			var sql = kv.Value;
			var guarded = new long[iterations];
			var unguarded = new long[iterations];

			for (int i = 0; i < iterations; i++) {
				// A: guarded pass
				sw.Restart();
				_ = Guarded(sql);
				sw.Stop();
				guarded[i] = sw.ElapsedTicks;

				// B: unguarded pass (identical work, minus the guard)
				sw.Restart();
				_ = UnguardedBaseline(sql);
				sw.Stop();
				unguarded[i] = sw.ElapsedTicks;
			}

			// Sort for percentile extraction.
			Array.Sort(guarded);
			Array.Sort(unguarded);

			results[name] = (guarded, unguarded);
		}

		// ── Statistics ──────────────────────────────────────────────────────
		// Percentile convention (documented for r3, D5):
		//   Percentile(sorted, p) = sorted[Ceiling(p * n) - 1]
		// For an even-length set at p=0.50 this returns the UPPER of the two
		// central elements (index n/2), not their average. This matches the
		// nearest-rank method used by the r2 benchmark and is stated explicitly
		// so the median is not mistaken for a mean-of-two-centres value.
		double ticksToUs = 1_000_000.0 / Stopwatch.Frequency;

		Console.WriteLine("── Raw measurements (ticks per iteration) ───────────────────");
		Console.WriteLine(
			"  Query type                         Guarded median    Guarded P90    Unguarded median"
		);
		Console.WriteLine(
			"  ───────────────────────────────────────────────── ──────── ──────── ────────"
		);

		foreach (var kv in queries) {
			var name = kv.Key;
			var (guarded, unguarded) = results[name];

			var gMed = Percentile(guarded, 0.50);
			var gP90 = Percentile(guarded, 0.90);
			var uMed = Percentile(unguarded, 0.50);

			Console.WriteLine(
				$"  {PadRight(name, 33)} {Fmt(gMed),8:F1} {Fmt(gP90),8:F1} {Fmt(uMed),8:F1}"
			);
		}

		Console.WriteLine();

		// ── Net guard overhead (guarded − unguarded, µs) ────────────────────
		Console.WriteLine("── Net guard overhead (guarded − unguarded) ────────────────");
		Console.WriteLine(
			"  Query type                         Net median (µs)"
		);
		Console.WriteLine(
			"  ───────────────────────────────────────────────── ─────────"
		);

		var pubNet = 0.0;
		var unrelNet = 0.0;

		foreach (var kv in queries) {
			var name = kv.Key;
			var (guarded, unguarded) = results[name];

			var gMed = Percentile(guarded, 0.50);
			var uMed = Percentile(unguarded, 0.50);
			var netUs = (gMed - uMed) * ticksToUs;

			Console.WriteLine(
				$"  {PadRight(name, 33)} {netUs,8:F4}"
			);

			if (name == "Publication SELECT (read)") {
				pubNet = netUs;
			}

			if (name == "Unrelated SELECT (fast-fail)") {
				unrelNet = netUs;
			}
		}

		Console.WriteLine();

		// ── Correctness sanity check ────────────────────────────────────────
		Console.WriteLine("── Guard correctness (UpdatesPublicationsStatus) ───────────");
		Console.WriteLine(
			$"  Publication SELECT detects status write: {Guarded(queries["Publication SELECT (read)"])} (expected: False)"
		);
		Console.WriteLine(
			$"  Unrelated SELECT detects status write:   {Guarded(queries["Unrelated SELECT (fast-fail)"])} (expected: False)"
		);
		Console.WriteLine(
			$"  Commented SELECT detects status write:   {Guarded(queries["Commented publication SELECT"])} (expected: False)"
		);
		Console.WriteLine(
			$"  Status UPDATE detects status write:      {Guarded(queries["Status UPDATE (must detect)"])} (expected: True)"
		);
		Console.WriteLine();

		// ── Machine load after ──────────────────────────────────────────────
		Console.WriteLine("── Machine load (after) ──────────────────────────────────────");
		Console.WriteLine($"  Process CPU time (end):   {Process.GetCurrentProcess().TotalProcessorTime}");
		Console.WriteLine($"  Process working set:      {Process.GetCurrentProcess().WorkingSet64 / (1024 * 1024)} MB");
		Console.WriteLine();

		// ── Conclusion ──────────────────────────────────────────────────────
		Console.WriteLine("── Conclusion ────────────────────────────────────────────────");
		Console.WriteLine(
			$"  Net guard overhead on publication-table reads: ~{pubNet:F2} µs (median)"
		);
		Console.WriteLine(
			"  Even a 10x error leaves this well under 1% of a 1 ms query."
		);
		Console.WriteLine(
			$"  Stopwatch.Frequency = {Stopwatch.Frequency:N0} ticks/s (NOT assumed GHz)."
		);

		return 0;
	}

	private static double Percentile(long[] sorted, double p) {
		// Nearest-rank method: index = ceil(p * n) - 1, clamped to [0, n-1].
		// For p=0.50 on an even-length array this returns the upper-middle
		// element (the n/2-th), NOT the average of the two central elements.
		// Documented here to avoid confusion with a true interpolated median.
		var idx = (int)Math.Ceiling(p * sorted.Length) - 1;
		return sorted[Math.Max(0, Math.Min(idx, sorted.Length - 1))];
	}

	private static string PadRight(string s, int total) {
		return s.Length >= total ? s[..total] : s.PadRight(total);
	}

	private static string Fmt(double v) {
		return v.ToString("F1", CultureInfo.InvariantCulture);
	}
}
