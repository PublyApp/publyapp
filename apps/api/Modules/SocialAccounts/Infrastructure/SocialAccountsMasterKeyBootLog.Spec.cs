using System.Security.Cryptography;

using FluentAssertions;

using Microsoft.Extensions.Logging;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Capturing test logger (#1284): records every formatted log call in memory so specs can
/// assert on the boot canary pass line without standing up Serilog or the real host.
/// </summary>
public sealed class CapturingTestLogger : ILogger {
	public sealed record Entry(LogLevel Level, string Message);

	public List<Entry> Entries { get; } = [];

	public IDisposable? BeginScope<TState>(TState state)
		where TState : notnull {
		return null;
	}

	public bool IsEnabled(LogLevel logLevel) {
		return true;
	}

	public void Log<TState>(
		LogLevel logLevel,
		EventId eventId,
		TState state,
		Exception? exception,
		Func<TState, Exception?, string> formatter
	) {
		Entries.Add(new Entry(logLevel, formatter(state, exception)));
	}
}

/// <summary>
/// #1284: at REAL boot, when the master-key canary round-trip PASSES, exactly one
/// structured Information line states that the canary passed — so an operator can tell a
/// verified boot from a db-less doc-gen run, which skips the canary entirely. The
/// fail-loud refusal path stays silent about success and unchanged otherwise. Paired
/// red/green proof: delete either LogInformation call, or stop passing the logger in
/// Program.cs, and these specs go red.
/// </summary>
public sealed class SocialAccountsMasterKeyBootLogSpec {
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
	public void ItShouldLogTheCanaryPassLineWhenFirstBootMintsTheCanary() {
		var logger = new CapturingTestLogger();
		var store = new ScriptedCanaryStore(); // empty → first boot mints the canary

		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(NewKey(), store, logger);

		logger.Entries.Should().ContainSingle(
			e => e.Level == LogLevel.Information
				&& e.Message == SocialAccountsMasterKeyWitness.CanaryPassedLogLine,
			"a first boot that mints the canary IS a passing boot and must say so"
		);
	}

	[Fact]
	public void ItShouldLogTheCanaryPassLineWhenAStoredCanaryDecrypts() {
		var logger = new CapturingTestLogger();
		var store = new ScriptedCanaryStore();
		var key = NewKey();
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(key, store); // mint (no logger)

		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(key, store, logger); // verify path

		logger.Entries.Should().Contain(
			e => e.Level == LogLevel.Information
				&& e.Message == SocialAccountsMasterKeyWitness.CanaryPassedLogLine,
			"every verified boot against the persisted canary must log the pass line"
		);
	}

	[Fact]
	public void ItShouldNotLogACanaryPassLineWhenTheCanaryIsSkipped() {
		var logger = new CapturingTestLogger();

		// canaryStore: null — the db-less build-time OpenAPI generation path. Only the
		// parse/size contract ran; claiming a pass would be a lie operators would trust.
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(NewKey(), null, logger);

		// #1309 (adversarial review round 1, MINOR): the previous NotContain(
		// CanaryPassedLogLine) was too weak — a DIFFERENTLY-worded log on the db-less path
		// passed it while still claiming a verification that never ran. The skipped path
		// verifies nothing beyond key SIZE, so the captured logger must stay EMPTY. The
		// paired red proof (a mutant logging a differently-worded line on this path) is
		// recorded in .dump/task2-skipped-path-mutation-proof.md.
		logger.Entries.Should().BeEmpty(
			"the doc-gen path verifies nothing beyond key SIZE and must log NOTHING at all; "
				+ "any line here would claim a verification that never ran"
		);
	}

	[Fact]
	public void ItShouldNotLogACanaryPassLineWhenAWrongKeyRefusesToBoot() {
		var logger = new CapturingTestLogger();
		var store = new ScriptedCanaryStore();
		var keyA = NewKey();
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyA, store); // A mints

		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(NewKey(), store, logger); // B: refused

		act.Should().Throw<InvalidOperationException>();
		logger.Entries.Should().BeEmpty(
			"a refused boot must never claim the canary passed"
		);
	}

	[Fact]
	public void ItShouldWireThePassLineIntoBothRealBootCallSitesInProgramCs() {
		// Whitespace-normalised (same approach as MasterKeyWitnessCallSiteSpec) so the
		// multi-line call sites still match.
		var source = Normalize(FindProgramCsSource());

		// Both role branches (web host AND worker Generic Host) must hand the witness a
		// real ILoggerFactory-built logger named after the witness — removing either
		// wiring leaves a boot path whose success is invisible to operators. Red if the
		// line is unwired. (The LogInformation(CanaryPassedLogLine) calls themselves are
		// pinned by the four behavioural specs above.)
		var wiredCallSites = CountOccurrences(
			source,
			"GetRequiredService<ILoggerFactory>().CreateLogger("
				+ "nameof(Modules.SocialAccounts.Infrastructure.SocialAccountsMasterKeyWitness))"
		);
		wiredCallSites.Should().Be(
			2,
			"both boot paths must pass the witness logger so the canary pass line is logged"
		);
	}

	private static string Normalize(string source) {
		return string.Concat(
			source.Where(static c => !char.IsWhiteSpace(c))
		);
	}

	private static byte[] NewKey() {
		var key = new byte[32];
		RandomNumberGenerator.Fill(key);
		return key;
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
