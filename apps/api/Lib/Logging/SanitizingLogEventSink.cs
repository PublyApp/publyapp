using System.Globalization;

using PublyApp.Api.Infrastructure.Jobs;

using Serilog.Core;
using Serilog.Events;

namespace PublyApp.Api.Lib.Logging;

/// <summary>
/// The process-wide redaction backstop in front of every durable sink (design §5.1,
/// R2-8/R3-5/O13).
/// <para>
/// Serilog treats <see cref="LogEvent.Exception"/> as a special object and renders it —
/// message and all — through the console and file sinks. Destructuring policies do NOT
/// apply to it, so no destructurer can sanitize it; that is why this is a sink wrapper
/// rather than a policy. A naive <c>_logger.LogError(ex, ...)</c> anywhere in the process
/// would otherwise put a Resend 4xx body, a reset token, or a recipient address into a
/// log file verbatim.
/// </para>
/// <para>
/// <see cref="Emit"/> therefore forwards a REPLACEMENT event with
/// <c>Exception = null</c>: the safe structured properties, message template, level,
/// timestamp and trace/span correlation are preserved, and the exception is re-expressed
/// as the only three things about it that cannot carry an untrusted payload —
/// <see cref="ExceptionTypeProperty"/>, a redacted and 2 KB-bounded
/// <see cref="ExceptionMessageProperty"/>, and <see cref="ExceptionStackProperty"/> (code
/// locations), all produced by <see cref="JobErrorSanitizer"/>.
/// </para>
/// <para>
/// This does not license naive call sites — the engine still logs
/// <see cref="JobErrorSanitizer.Describe"/> explicitly. It is the backstop that makes the
/// guarantee hold without relying on call-site discipline.
/// </para>
/// </summary>
public sealed class SanitizingLogEventSink : ILogEventSink, IDisposable {
	public const string ExceptionTypeProperty = "exception_type";
	public const string ExceptionMessageProperty = "exception_message";
	public const string ExceptionStackProperty = "exception_stack";

	// A caller-supplied property under one of these names would be silently overwritten
	// by (or collide with) the ones added here, so they are dropped from the replacement
	// event first. This also stops a log call from spoofing the redacted fields.
	private static readonly string[] ReservedProperties = [
		ExceptionTypeProperty,
		ExceptionMessageProperty,
		ExceptionStackProperty,
	];

	private readonly ILogEventSink _wrapped;

	public SanitizingLogEventSink(ILogEventSink wrapped) {
		if (wrapped is null) {
			throw new ArgumentNullException(nameof(wrapped));
		}

		_wrapped = wrapped;
	}

	public void Emit(LogEvent logEvent) {
		if (logEvent is null) {
			throw new ArgumentNullException(nameof(logEvent));
		}

		_wrapped.Emit(Sanitize(logEvent));
	}

	private static LogEvent Sanitize(LogEvent logEvent) {
		var exception = logEvent.Exception;
		var hasException = exception is not null;

		// Walk EVERY property, whether or not LogEvent.Exception is set. The no-Exception
		// path used to forward events untouched on the assumption their structured
		// properties were safe; that is false (finding F3). A raw exception message can
		// ride in as a scalar string (the StaffUserCoreService/UpdateStaffUser shape) and
		// an exception object can ride in as a template property — neither sets
		// LogEvent.Exception, so both slipped past the old fast path into the durable file
		// sink. Reserved names are dropped ONLY when we are about to add the redacted
		// exception fields, so a caller cannot spoof or collide with them.
		var properties = logEvent.Properties
			.Where(property =>
				!(hasException
					&& ReservedProperties.Contains(property.Key, StringComparer.Ordinal)))
			.Select(property =>
				new LogEventProperty(property.Key, SanitizeValue(property.Value)))
			.ToList();

		if (exception is not null) {
			properties.Add(new LogEventProperty(
				ExceptionTypeProperty,
				new ScalarValue(exception.GetType().FullName)
			));
			properties.Add(new LogEventProperty(
				ExceptionMessageProperty,
				new ScalarValue(JobErrorSanitizer.Sanitize(exception.Message))
			));
			properties.Add(new LogEventProperty(
				ExceptionStackProperty,
				new SequenceValue(
					JobErrorSanitizer.DescribeStackFrames(exception)
						.Select(frame => new ScalarValue(frame))
				)
			));
		}

		return new LogEvent(
			logEvent.Timestamp,
			logEvent.Level,
			exception: null,
			logEvent.MessageTemplate,
			properties,
			logEvent.TraceId ?? default,
			logEvent.SpanId ?? default
		);
	}

	// A small, explicit bound on how deep the recursive walk descends (finding F4). The
	// public Serilog StructureValue/SequenceValue/DictionaryValue constructors accept an
	// arbitrarily deep acyclic graph, and an unbounded recursive walk over one throws an
	// UNCATCHABLE StackOverflowException that terminates the process. The bound is
	// comfortably above Serilog's own destructuring depth (10 by default), so it never
	// clips a legitimately destructured value, yet orders of magnitude below the frame
	// count that overflows the stack. Beyond it, content is replaced with a safe sentinel.
	// Cycle detection is unnecessary: the immutable constructors cannot form a self-reference.
	private const int MaxPropertyDepth = 20;

	private static readonly ScalarValue DepthExceededSentinel =
		new("[redacted-depth-exceeded]");

	// Recursively neutralizes a structured property value:
	//  • an exception object — however it arrived (a `{Ex}` scalar or a `{@Ex}`
	//    destructured value) — is replaced with the same safe type + redacted-message
	//    description the exception path emits, never its raw text;
	//  • every scalar string is run through the redactor (emails, token-shaped blobs,
	//    control chars), so a raw exception message carried as an ordinary property loses
	//    its payload even though the sink cannot know it came from an exception;
	//  • structures, sequences and dictionaries are descended so a nested exception or
	//    string cannot hide one level down — but only to MaxPropertyDepth (finding F4);
	//  • dictionary KEYS are redacted too, not just values (finding F3): Serilog dictionary
	//    keys are ScalarValues rendered by durable sinks, so a token/email placed in
	//    exception.Data as a KEY would otherwise leak verbatim.
	private static LogEventPropertyValue SanitizeValue(LogEventPropertyValue value) {
		return SanitizeValue(value, depth: 0);
	}

	private static LogEventPropertyValue SanitizeValue(LogEventPropertyValue value, int depth) {
		// Depth-bound the walk BEFORE descending (finding F4): past the limit we stop
		// recursing and emit a sentinel, so a pathologically deep graph can never overflow
		// the stack. Scalars are leaves and never recurse, so they are always processed.
		if (depth >= MaxPropertyDepth && value is not ScalarValue) {
			return DepthExceededSentinel;
		}

		switch (value) {
			case ScalarValue scalar:
				if (scalar.Value is Exception exception) {
					return new ScalarValue(JobErrorSanitizer.Describe(exception));
				}

				if (scalar.Value is string text) {
					return new ScalarValue(JobErrorSanitizer.Sanitize(text));
				}

				if (scalar.Value is null) {
					return scalar;
				}

				// A NON-string scalar can still carry untrusted text (finding F1). Serilog
				// renders Uri and other built-in scalars via IFormattable/ToString(), and a
				// non-generic IDictionary such as `exception.Data` destructures to a sequence of
				// `Key`/`Value` structures — so `exception.Data[new Uri("…?email=…")]` arrives
				// here as a Uri-valued scalar, NOT a string, and the old string-only branch let
				// it through. Render it the way a durable sink would and redact it. When
				// redaction changes nothing — numbers, bools, dates, Guids, enums have no
				// email/token payload — the original typed scalar is kept so structured fidelity
				// is preserved; the sanitized string is substituted only when redaction fires.
				var rendered = RenderScalar(scalar);
				var sanitized = JobErrorSanitizer.Sanitize(rendered) ?? string.Empty;

				return string.Equals(rendered, sanitized, StringComparison.Ordinal)
					? scalar
					: new ScalarValue(sanitized);

			case StructureValue structure:
				return new StructureValue(
					structure.Properties
						.Select(property =>
							new LogEventProperty(property.Name, SanitizeValue(property.Value, depth + 1))),
					structure.TypeTag
				);

			case SequenceValue sequence:
				return new SequenceValue(
					sequence.Elements.Select(element => SanitizeValue(element, depth + 1)));

			case DictionaryValue dictionary:
				return new DictionaryValue(SanitizeDictionaryElements(dictionary, depth + 1));

			default:
				return value;
		}
	}

	// Rebuilds a dictionary's entries with BOTH key and value sanitized (findings F1/F3). A
	// key is NOT always a string: Serilog treats `Uri`, `Guid`, `int`, enums and other
	// built-in types as scalars that durable sinks render through `IFormattable`/`ToString()`,
	// so a token/email carried in a NON-string key — e.g.
	// `exception.Data[new Uri("…?email=…")]` — would otherwise reach a sink verbatim. Every
	// key is therefore rendered the way a sink renders it and run through the same redactor as
	// a scalar string value. Redaction is many-to-one — two distinct keys (`token=A…`,
	// `token=B…`) can both collapse to `[redacted-token]` — so colliding sanitized keys are
	// disambiguated DETERMINISTICALLY (` #2`, ` #3`, …). That keeps every entry (no silent
	// drop) and never hands the DictionaryValue constructor two equal keys.
	private static IEnumerable<KeyValuePair<ScalarValue, LogEventPropertyValue>>
		SanitizeDictionaryElements(DictionaryValue dictionary, int depth) {
		var usedKeys = new HashSet<string>(StringComparer.Ordinal);
		var nextSuffixByBase = new Dictionary<string, int>(StringComparer.Ordinal);
		var sanitized = new List<KeyValuePair<ScalarValue, LogEventPropertyValue>>();

		foreach (var element in dictionary.Elements) {
			sanitized.Add(new KeyValuePair<ScalarValue, LogEventPropertyValue>(
				SanitizeDictionaryKey(element.Key, usedKeys, nextSuffixByBase),
				SanitizeValue(element.Value, depth)
			));
		}

		return sanitized;
	}

	private static ScalarValue SanitizeDictionaryKey(
		ScalarValue key,
		HashSet<string> usedKeys,
		Dictionary<string, int> nextSuffixByBase) {
		var redacted = JobErrorSanitizer.Sanitize(RenderScalar(key)) ?? string.Empty;

		if (usedKeys.Add(redacted)) {
			return new ScalarValue(redacted);
		}

		// The base sentinel is already taken. Advance a per-base suffix MONOTONICALLY instead
		// of restarting the scan at #2 for every colliding key (finding F2): N keys collapsing
		// to one sentinel would otherwise do ~N*(N-1)/2 HashSet probes and string allocations
		// on this process-wide hot path. usedKeys is still consulted so a suffix a literal
		// already-suffixed key occupies is skipped, keeping the result unique and deterministic.
		var suffix = nextSuffixByBase.TryGetValue(redacted, out var next) ? next : 2;
		var candidate = string.Create(CultureInfo.InvariantCulture, $"{redacted} #{suffix}");
		while (!usedKeys.Add(candidate)) {
			suffix++;
			candidate = string.Create(CultureInfo.InvariantCulture, $"{redacted} #{suffix}");
		}

		nextSuffixByBase[redacted] = suffix + 1;

		return new ScalarValue(candidate);
	}

	// The rendered text of a scalar, produced the way a durable sink produces it, so the text
	// that could otherwise leak is exactly the text we sanitize (finding F1). A string is used
	// as-is; every other scalar — `Uri`, `Guid`, `int`, enums, and even a null value — is
	// rendered through Serilog's own scalar rendering, which routes non-strings through
	// `IFormattable`/`ToString()`. Used for both dictionary keys and non-string scalar values.
	private static string RenderScalar(ScalarValue scalar) {
		if (scalar.Value is string text) {
			return text;
		}

		using var writer = new StringWriter(CultureInfo.InvariantCulture);
		scalar.Render(writer, format: null, formatProvider: CultureInfo.InvariantCulture);

		return writer.ToString();
	}

	// Serilog disposes the outermost sink only; the wrapped graph (async workers, file
	// handles) is ours to release.
	public void Dispose() {
		(_wrapped as IDisposable)?.Dispose();
	}
}
