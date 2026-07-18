using System.Diagnostics;
using System.Globalization;

using FluentAssertions;

using Serilog;
using Serilog.Core;
using Serilog.Events;
using Serilog.Parsing;

using Xunit;

namespace PublyApp.Api.Lib.Logging;

// The redaction backstop's own contract (design §5.1, R2-8/R3-5/O13). LoggerSinkGraph.Spec
// proves the wrapper is the only path to a durable sink; this proves what it does when an
// event reaches it.
public sealed class SanitizingLogEventSinkSpec {
	// An exception message carrying exactly what must never reach a sink: a recipient
	// address and a token-shaped blob, as a provider error body would.
	private const string RecipientAddress = "victim@example.com";
	private const string ResetToken = "abcdefghijklmnopqrstuvwxyz0123456789";

	[Fact]
	public void ItShouldStripTheRawExceptionFromTheForwardedEvent() {
		var captured = EmitThrough(new InvalidOperationException("boom"));

		captured.Exception.Should().BeNull(
			"Serilog renders LogEvent.Exception — message included — straight into console "
			+ "and file sinks, so the replacement event must not carry it at all"
		);
	}

	[Fact]
	public void ItShouldReplaceTheExceptionWithRedactedTypeMessageAndStackMetadata() {
		var exception = Thrown(
			new InvalidOperationException($"send to {RecipientAddress} failed, token={ResetToken}")
		);

		var captured = EmitThrough(exception);

		PropertyText(captured, SanitizingLogEventSink.ExceptionTypeProperty)
			.Should().Contain(nameof(InvalidOperationException), "the type is the safe error code");

		var message = PropertyText(captured, SanitizingLogEventSink.ExceptionMessageProperty);
		message.Should().NotContain(RecipientAddress, "recipient addresses must be redacted");
		message.Should().NotContain(ResetToken, "token-shaped runs must be redacted");
		message.Should().Contain("[redacted-email]");
		message.Should().Contain("[redacted-token]");

		captured.Properties.Should().ContainKey(
			SanitizingLogEventSink.ExceptionStackProperty,
			"stack frames are code locations and carry no payload, so they survive"
		);
		PropertyText(captured, SanitizingLogEventSink.ExceptionStackProperty)
			.Should().Contain(nameof(SanitizingLogEventSinkSpec), "the throwing frame is preserved");
	}

	[Fact]
	public void ItShouldPreserveSafePropertiesAndCorrelationWhenRedacting() {
		var captured = EmitThrough(
			new InvalidOperationException("boom"),
			new LogEventProperty("job_id", new ScalarValue("job-42"))
		);

		PropertyText(captured, "job_id").Should().Contain("job-42",
			"structured properties went through Serilog's normal destructuring path and are safe");
		captured.Level.Should().Be(LogEventLevel.Error);
		captured.MessageTemplate.Text.Should().Be("failure");
	}

	[Fact]
	public void ItShouldPreserveSafePropertiesOnEventsWithoutAnException() {
		var sink = new CapturingSink();
		var original = BuildEvent(
			exception: null,
			new LogEventProperty("job_id", new ScalarValue("job-42"))
		);

		new SanitizingLogEventSink(sink).Emit(original);

		var captured = sink.Captured.Should().ContainSingle().Subject;
		captured.Exception.Should().BeNull();
		PropertyText(captured, "job_id").Should().Contain("job-42",
			"a benign scalar property survives the no-exception path untouched");
		captured.MessageTemplate.Text.Should().Be("failure");
	}

	// The no-exception path must NOT assume scalar properties are safe (finding F3): a raw
	// exception message can flow in as an ordinary string property with no LogEvent.Exception.
	[Fact]
	public void ItShouldRedactAScalarStringPropertyOnTheNoExceptionPath() {
		var sink = new CapturingSink();
		var original = BuildEvent(
			exception: null,
			new LogEventProperty(
				"ErrorMessage",
				new ScalarValue($"send to {RecipientAddress} failed, token={ResetToken}")
			)
		);

		new SanitizingLogEventSink(sink).Emit(original);

		var captured = sink.Captured.Should().ContainSingle().Subject;
		var message = PropertyText(captured, "ErrorMessage");
		message.Should().NotContain(RecipientAddress).And.NotContain(ResetToken);
		message.Should().Contain("[redacted-email]").And.Contain("[redacted-token]");
	}

	// A property whose VALUE is an exception object (not the LogEvent.Exception) must be
	// replaced with safe metadata, never its raw message (finding F3).
	[Fact]
	public void ItShouldReplaceAnExceptionValuedScalarPropertyWithSafeMetadata() {
		var exception = Thrown(
			new InvalidOperationException($"send to {RecipientAddress} failed, token={ResetToken}")
		);
		var sink = new CapturingSink();
		var original = BuildEvent(
			exception: null,
			new LogEventProperty("Error", new ScalarValue(exception))
		);

		new SanitizingLogEventSink(sink).Emit(original);

		var captured = sink.Captured.Should().ContainSingle().Subject;
		var message = PropertyText(captured, "Error");
		message.Should().NotContain(RecipientAddress).And.NotContain(ResetToken);
		message.Should().Contain(nameof(InvalidOperationException), "the safe type is preserved");
	}

	// --- configured-pipeline tests: real Serilog end to end -------------------------

	// (a) A raw exception message carried as a scalar template property with NO
	// LogEvent.Exception — the exact StaffUserCoreService/UpdateStaffUser shape — is redacted
	// when it flows through the SAME wrapper the app composes (via WriteTo.Sanitized).
	[Fact]
	public void ItShouldRedactAnExceptionMessageScalarPropertyThroughTheConfiguredPipeline() {
		var (logger, capture) = BuildConfiguredPipeline();

		using (logger) {
			logger.Error(
				"update failed {ErrorMessage}",
				$"send to {RecipientAddress} failed, token={ResetToken}"
			);
		}

		var captured = capture.Captured.Should().ContainSingle().Subject;
		captured.Exception.Should().BeNull("this leak never sets LogEvent.Exception");

		var message = PropertyText(captured, "ErrorMessage");
		message.Should().NotContain(RecipientAddress, "recipient addresses must be redacted");
		message.Should().NotContain(ResetToken, "token-shaped runs must be redacted");
		message.Should().Contain("[redacted-email]").And.Contain("[redacted-token]");
	}

	// (b) An exception object passed as a destructured template property (NOT the exception
	// overload) sets no LogEvent.Exception, so the old fast path forwarded its message to the
	// durable sink. The hardened sink must strip its payload end to end.
	[Fact]
	public void ItShouldRedactADestructuredExceptionPropertyThroughTheConfiguredPipeline() {
		var (logger, capture) = BuildConfiguredPipeline();
		var exception = Thrown(
			new InvalidOperationException($"send to {RecipientAddress} failed, token={ResetToken}")
		);

		using (logger) {
			logger.Error("update failed {@Error}", exception);
		}

		var captured = capture.Captured.Should().ContainSingle().Subject;
		captured.Exception.Should()
			.BeNull("passing an exception as a property sets no LogEvent.Exception");

		var rendered = RenderProperties(captured);
		rendered.Should().NotContain(RecipientAddress, "the destructured message must be redacted");
		rendered.Should().NotContain(ResetToken, "token-shaped runs must be redacted");
	}

	// A log call must not be able to pass off its own values as the redacted fields.
	[Fact]
	public void ItShouldDropCallerSuppliedPropertiesThatSpoofTheRedactedFields() {
		var captured = EmitThrough(
			new InvalidOperationException($"real cause, token={ResetToken}"),
			new LogEventProperty(
				SanitizingLogEventSink.ExceptionMessageProperty,
				new ScalarValue($"spoofed, token={ResetToken}")
			)
		);

		captured.Properties[SanitizingLogEventSink.ExceptionMessageProperty]
			.Should().NotBeNull();
		PropertyText(captured, SanitizingLogEventSink.ExceptionMessageProperty)
			.Should().NotContain("spoofed", "the sink's own redacted value wins")
			.And.NotContain(ResetToken, "and it is still redacted");
	}

	// --- F3: dictionary KEYS are sanitized, not just values -------------------------

	// A token/email placed in a dictionary KEY (the exact exception.Data-key shape) must be
	// redacted. Serilog dictionary keys are ScalarValues rendered verbatim by durable sinks,
	// so the old recursion — which rebuilt each entry with element.Key UNCHANGED — leaked
	// them (finding F3).
	[Fact]
	public void ItShouldRedactSensitiveStringKeysInADictionaryValue() {
		var dictionary = new DictionaryValue([
			KeyValue($"token={ResetToken}", "safe-value"),
			KeyValue($"contact {RecipientAddress}", "safe-value"),
		]);
		var sink = new CapturingSink();

		new SanitizingLogEventSink(sink).Emit(
			BuildEvent(exception: null, new LogEventProperty("Data", dictionary)));

		var captured = sink.Captured.Should().ContainSingle().Subject;
		var rendered = RenderProperties(captured);
		rendered.Should().NotContain(ResetToken, "a token in a dictionary KEY must be redacted");
		rendered.Should().NotContain(RecipientAddress, "an email in a dictionary KEY must be redacted");
		rendered.Should().Contain("[redacted-token]").And.Contain("[redacted-email]");
	}

	// Redaction is many-to-one, so two distinct keys can collapse to the SAME sentinel. That
	// must be handled deterministically: no dropped entry, and never two equal keys handed to
	// the DictionaryValue constructor (finding F3).
	[Fact]
	public void ItShouldDisambiguateDictionaryKeysThatRedactToTheSameSentinel() {
		var dictionary = new DictionaryValue([
			KeyValue("alice@example.com", "first"),
			KeyValue("bob@example.com", "second"),
		]);
		var sink = new CapturingSink();

		new SanitizingLogEventSink(sink).Emit(
			BuildEvent(exception: null, new LogEventProperty("Data", dictionary)));

		var captured = sink.Captured.Should().ContainSingle().Subject;
		var sanitized = captured.Properties["Data"].Should().BeOfType<DictionaryValue>().Subject;

		sanitized.Elements.Should().HaveCount(2, "a redaction collision must not drop an entry");
		sanitized.Elements.Select(element => element.Key.Value).Should().OnlyHaveUniqueItems(
			"colliding sanitized keys are disambiguated deterministically, never left as duplicates");
		RenderProperties(captured).Should()
			.NotContain("alice@example.com").And.NotContain("bob@example.com");
	}

	// End-to-end through the SAME wrapper the app composes: a Dictionary<string,string> with
	// sensitive keys destructures to a DictionaryValue with ScalarValue keys, and those keys
	// must be redacted by the configured pipeline (finding F3).
	[Fact]
	public void ItShouldRedactSensitiveDictionaryKeysThroughTheConfiguredPipeline() {
		var (logger, capture) = BuildConfiguredPipeline();
		var data = new Dictionary<string, string> {
			[$"token={ResetToken}"] = "value",
			[$"user {RecipientAddress}"] = "value",
		};

		using (logger) {
			logger.Error("boom {@Data}", data);
		}

		var captured = capture.Captured.Should().ContainSingle().Subject;
		var rendered = RenderProperties(captured);
		rendered.Should().NotContain(ResetToken, "token-shaped dictionary keys must be redacted");
		rendered.Should().NotContain(RecipientAddress, "email dictionary keys must be redacted");
	}

	// The finding's named shape: a token/email placed in exception.Data as a KEY, logged via
	// logger.Error("{@Error}", exception). Whatever internal shape Serilog destructures Data
	// into, the sensitive key must not reach the durable sink (finding F3).
	[Fact]
	public void ItShouldRedactSensitiveExceptionDataKeysThroughTheConfiguredPipeline() {
		var (logger, capture) = BuildConfiguredPipeline();
		var exception = new InvalidOperationException("boom");
		exception.Data[$"token={ResetToken}"] = "value";
		exception.Data[$"user {RecipientAddress}"] = "value";

		using (logger) {
			logger.Error("update failed {@Error}", exception);
		}

		var captured = capture.Captured.Should().ContainSingle().Subject;
		var rendered = RenderProperties(captured);
		rendered.Should().NotContain(ResetToken, "a token in exception.Data must not leak as a key");
		rendered.Should().NotContain(RecipientAddress, "an email in exception.Data must not leak as a key");
	}

	// --- F1: NON-string dictionary keys are sanitized, not passed through -----------

	// The exact finding shape: a token + email carried in a NON-string dictionary key. Serilog
	// treats a `Uri` as a built-in scalar rendered via ToString(), so the old
	// `key.Value is not string` fast-return handed the raw Uri straight to the sink. A
	// non-string key must be rendered and redacted like any string key (finding F1).
	[Fact]
	public void ItShouldRedactSensitiveNonStringKeysLikeAUriInADictionaryValue() {
		var uri = new Uri($"https://host/{ResetToken}?email={RecipientAddress}");
		var dictionary = new DictionaryValue([
			new KeyValuePair<ScalarValue, LogEventPropertyValue>(
				new ScalarValue(uri), new ScalarValue("safe-value")),
		]);
		var sink = new CapturingSink();

		new SanitizingLogEventSink(sink).Emit(
			BuildEvent(exception: null, new LogEventProperty("Data", dictionary)));

		var captured = sink.Captured.Should().ContainSingle().Subject;
		var rendered = RenderProperties(captured);
		rendered.Should().NotContain(ResetToken,
			"a token in a NON-string (Uri) dictionary key must be redacted, not passed through");
		rendered.Should().NotContain(RecipientAddress,
			"an email in a Uri dictionary key must be redacted");
		rendered.Should().Contain("[redacted-token]").And.Contain("[redacted-email]");
	}

	// End-to-end through the SAME wrapper the app composes: a `Uri` placed in exception.Data as
	// a KEY, logged via logger.Error("{@Error}", exception). Serilog renders the Uri key via
	// ToString(), so the sensitive path/query must be redacted before it reaches a durable sink
	// (finding F1).
	[Fact]
	public void ItShouldRedactSensitiveUriExceptionDataKeysThroughTheConfiguredPipeline() {
		var (logger, capture) = BuildConfiguredPipeline();
		var exception = new InvalidOperationException("boom");
		exception.Data[new Uri($"https://host/{ResetToken}?email={RecipientAddress}")] = "value";

		using (logger) {
			logger.Error("update failed {@Error}", exception);
		}

		var captured = capture.Captured.Should().ContainSingle().Subject;
		var rendered = RenderProperties(captured);
		rendered.Should().NotContain(ResetToken,
			"a token in a Uri exception.Data key must not leak through the configured pipeline");
		rendered.Should().NotContain(RecipientAddress,
			"an email in a Uri exception.Data key must not leak");
	}

	// --- F2: collision disambiguation is near-linear, not quadratic -----------------

	// N keys that all redact to ONE sentinel must be disambiguated in O(N) work. The old loop
	// reset the suffix scan to #2 for every colliding key, doing ~N*(N-1)/2 HashSet probes and
	// candidate-string allocations on the process-wide sink; a per-base monotonic counter makes
	// it linear (finding F2). N is kept modest so this test's CPU burst stays small (~100 ms)
	// and does not amplify the suite's pre-existing startup race, while the separation stays
	// decisive on fast and slow hardware alike: the linear path finishes in ~100 ms here, and
	// the quadratic path was measured at ~10 s for N=20_000, so at this N it is ~16 s — well
	// above the 5 s bound (which in turn leaves linear ~50x of headroom).
	[Fact]
	public void ItShouldDisambiguateManyCollidingKeysInNearLinearTime() {
		const int keyCount = 25_000;
		var padding = new string('A', 28);
		var elements = Enumerable.Range(0, keyCount)
			.Select(index => KeyValue($"{padding}{index}", "value"))
			.ToArray();
		var dictionary = new DictionaryValue(elements);
		var sink = new CapturingSink();

		var stopwatch = Stopwatch.StartNew();
		new SanitizingLogEventSink(sink).Emit(
			BuildEvent(exception: null, new LogEventProperty("Data", dictionary)));
		stopwatch.Stop();

		var captured = sink.Captured.Should().ContainSingle().Subject;
		var sanitized = captured.Properties["Data"].Should().BeOfType<DictionaryValue>().Subject;

		sanitized.Elements.Should().HaveCount(keyCount,
			"every colliding key is kept, never dropped");
		sanitized.Elements.Select(element => element.Key.Value).Should().OnlyHaveUniqueItems(
			"a monotonic per-base suffix disambiguates all collisions to distinct keys");
		stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(5),
			"collision disambiguation must be near-linear, not quadratic, on the hot logging path");
	}

	// --- F4: the recursive walk is depth-bounded, not stack-overflowing -------------

	// The public Serilog StructureValue/SequenceValue/DictionaryValue constructors accept an
	// arbitrarily deep acyclic graph. The old unbounded recursive walk threw an uncatchable
	// StackOverflowException on a sufficiently deep property and killed the process (finding
	// F4). The bound replaces content past the limit with a safe sentinel and returns normally.
	[Fact]
	public void ItShouldBoundRecursionDepthInsteadOfOverflowingTheStack() {
		LogEventPropertyValue graph = new ScalarValue($"leaf token={ResetToken}");
		for (var depth = 0; depth < 5_000; depth++) {
			graph = new StructureValue([new LogEventProperty("next", graph)]);
		}
		var sink = new CapturingSink();

		var act = () => new SanitizingLogEventSink(sink).Emit(
			BuildEvent(exception: null, new LogEventProperty("graph", graph)));

		act.Should().NotThrow(
			"a deep acyclic value graph must be depth-bounded, never overflow the process stack");

		var captured = sink.Captured.Should().ContainSingle().Subject;
		var rendered = RenderProperties(captured);
		rendered.Should().Contain("[redacted-depth-exceeded]",
			"content past the depth bound is replaced with a safe sentinel");
		rendered.Should().NotContain(ResetToken,
			"the leaf far below the depth bound is dropped with everything past the limit");
	}

	// --- helpers ------------------------------------------------------------------

	private static KeyValuePair<ScalarValue, LogEventPropertyValue> KeyValue(string key, string value) {
		return new KeyValuePair<ScalarValue, LogEventPropertyValue>(
			new ScalarValue(key), new ScalarValue(value));
	}

	private static LogEvent EmitThrough(Exception exception, params LogEventProperty[] properties) {
		var sink = new CapturingSink();

		new SanitizingLogEventSink(sink).Emit(BuildEvent(exception, properties));

		return sink.Captured.Should().ContainSingle().Subject;
	}

	// Builds the SAME sanitizing wrapper the app composes (SanitizingSinkConfigurationExtensions
	// .Sanitized) around a capturing sink, then drives it through the real Serilog pipeline —
	// so these tests exercise property capture + the wrapper together, not the wrapper alone.
	private static (Logger logger, CapturingSink sink) BuildConfiguredPipeline() {
		var capture = new CapturingSink();
		var logger = new LoggerConfiguration()
			.WriteTo.Sanitized(wrapped => wrapped.Sink(capture))
			.CreateLogger();

		return (logger, capture);
	}

	private static string RenderProperties(LogEvent logEvent) {
		return string.Join(
			" ",
			logEvent.Properties.Values.Select(value =>
				value.ToString(format: null, CultureInfo.InvariantCulture))
		);
	}

	private static LogEvent BuildEvent(Exception? exception, params LogEventProperty[] properties) {
		return new LogEvent(
			DateTimeOffset.UtcNow,
			LogEventLevel.Error,
			exception,
			new MessageTemplateParser().Parse("failure"),
			properties
		);
	}

	// Materializes an exception with a real stack trace — an exception that was never
	// thrown has no frames, which would make the stack assertions vacuous.
	private static Exception Thrown(Exception exception) {
		try {
			throw exception;
		} catch (Exception caught) {
			return caught;
		}
	}

	private static string PropertyText(LogEvent logEvent, string propertyName) {
		logEvent.Properties.Should().ContainKey(propertyName);

		return logEvent.Properties[propertyName].ToString();
	}

	private sealed class CapturingSink : ILogEventSink {
		public List<LogEvent> Captured { get; } = [];

		public void Emit(LogEvent logEvent) {
			Captured.Add(logEvent);
		}
	}
}
