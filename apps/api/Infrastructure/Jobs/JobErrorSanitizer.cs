using System.Diagnostics;
using System.Text.RegularExpressions;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The ONE boundary where handler-supplied strings and exception messages are made
/// safe for durable storage (job_queue.last_error, job_dead_letter.last_error) AND for
/// log sinks (design §5.1, F20/R2-8). Redacts email addresses and long token-like
/// blobs, collapses control characters, and bounds length at 2 KB.
///
/// The raw <see cref="Exception"/> is NOT a safe thing to hand a logger: a sink
/// renders its <c>.Message</c> verbatim, so a provider 4xx body, an API key, or a
/// recipient address inside it reaches the sink untouched — "the logger is protected"
/// is not a substitute for redaction. The engine therefore never passes an exception
/// object to <c>ILogger</c>; it logs <see cref="Describe"/> (the stable type name plus
/// a redacted, bounded message) together with <see cref="DescribeStack"/> (frame
/// metadata, which is compile-time code identity and cannot carry payload values).
/// The Serilog <c>SanitizingLogEventSink</c> (2B) applies the same two projections as
/// a process-wide backstop for naive call sites elsewhere.
/// </summary>
public static partial class JobErrorSanitizer {
	public const int MaxLength = 2048;

	/// <summary>
	/// Stack metadata is bounded like everything else that reaches a sink: the frames
	/// nearest the throw carry the diagnostic value, and an unbounded chain is a log
	/// volume problem, not extra insight.
	/// </summary>
	public const int MaxStackFrames = 16;

	// Bound on how many exceptions deep an InnerException chain is walked for the
	// structured (frame-list) projection below — enough to locate a fault without a
	// pathological chain flooding a sink.
	private const int MaxExceptionChainDepth = 5;

	[GeneratedRegex(@"[\w.+-]+@[\w-]+(\.[\w-]+)+")]
	private static partial Regex EmailPattern();

	// Long unbroken base64/hex/url-safe runs are token-shaped (reset tokens, API
	// keys, signed payload fragments) — redact wholesale.
	[GeneratedRegex(@"[A-Za-z0-9_\-+/=]{24,}")]
	private static partial Regex TokenPattern();

	[GeneratedRegex(@"[\x00-\x1F]+")]
	private static partial Regex ControlCharacters();

	public static string? Sanitize(string? raw) {
		if (raw is null) {
			return null;
		}

		var safe = ControlCharacters().Replace(raw, " ");
		safe = EmailPattern().Replace(safe, "[redacted-email]");
		safe = TokenPattern().Replace(safe, "[redacted-token]");

		return safe.Length <= MaxLength ? safe : safe[..MaxLength];
	}

	/// <summary>
	/// A safe description of an exception: the stable exception type name (the safe
	/// "code") plus its sanitized message. Never includes a stack trace — stack
	/// metadata is a separate, separately-bounded projection
	/// (<see cref="DescribeStack"/>), because a rendered trace concatenates the
	/// messages of the whole exception chain and would smuggle unredacted text past
	/// this boundary.
	/// </summary>
	public static string Describe(Exception exception) {
		var described = $"{exception.GetType().Name}: {Sanitize(exception.Message)}";

		return described.Length <= MaxLength ? described : described[..MaxLength];
	}

	/// <summary>
	/// Safe stack metadata for a log sink (§5.1, R2-8): each frame's declaring type,
	/// method, and — when the build carries symbols — file and line, innermost first.
	/// Frame metadata is compile-time code identity: unlike an exception MESSAGE it
	/// can never contain a payload value, a token, or a recipient, which is exactly
	/// why it is the part of an exception allowed through. Empty for an exception
	/// that was never thrown.
	/// </summary>
	public static string DescribeStack(Exception exception) {
		var frames = new StackTrace(exception, fNeedFileInfo: true).GetFrames();
		var described = new List<string>(Math.Min(frames.Length, MaxStackFrames));

		foreach (var frame in frames) {
			if (described.Count == MaxStackFrames) {
				break;
			}

			var method = frame.GetMethod();
			if (method is null) {
				continue;
			}

			var declaringType = method.DeclaringType?.FullName ?? "<unknown>";
			var fileName = frame.GetFileName();

			described.Add(
				fileName is null
					? $"{declaringType}.{method.Name}"
					: $"{declaringType}.{method.Name} ({fileName}:{frame.GetFileLineNumber()})"
			);
		}

		var joined = string.Join(" <- ", described);

		return joined.Length <= MaxLength ? joined : joined[..MaxLength];
	}

	/// <summary>
	/// The two safe projections an engine log call passes INSTEAD of the exception
	/// object, for a failure that may not exist — a handler that RETURNED
	/// <see cref="JobOutcome.Retry"/> rather than throwing has no exception, and its
	/// log line carries empty metadata rather than a fabricated one.
	/// </summary>
	public static (string Description, string Stack) DescribeForLog(Exception? exception) {
		if (exception is null) {
			return (string.Empty, string.Empty);
		}

		return (Describe(exception), DescribeStack(exception));
	}

	/// <summary>
	/// Safe stack metadata as a structured frame list (design §5.1, R2-8) for
	/// consumers that need discrete entries rather than <see cref="DescribeStack"/>'s
	/// joined string — currently <c>SanitizingLogEventSink</c> (2B), which projects
	/// each frame into its own Serilog sequence element rather than one flattened
	/// property. Walks the InnerException chain (bounded by
	/// <see cref="MaxExceptionChainDepth"/>) so a wrapped exception's own frames are
	/// not lost, prefixing each inner exception's frames with a marker naming its
	/// type. Frames describe code locations only — never a payload value — which is
	/// exactly why they survive the boundary that drops the message.
	/// </summary>
	public static IReadOnlyList<string> DescribeStackFrames(Exception? exception) {
		var described = new List<string>();
		var current = exception;
		var depth = 0;

		while (current is not null
			&& depth < MaxExceptionChainDepth
			&& described.Count < MaxStackFrames) {
			if (depth > 0) {
				described.Add($"--- inner {current.GetType().FullName} ---");
			}

			foreach (var frame in new StackTrace(current, fNeedFileInfo: true).GetFrames()) {
				if (described.Count >= MaxStackFrames) {
					break;
				}

				var describedFrame = DescribeFrame(frame);
				if (describedFrame is not null) {
					described.Add(describedFrame);
				}
			}

			current = current.InnerException;
			depth++;
		}

		return described;
	}

	private static string? DescribeFrame(StackFrame frame) {
		var method = frame.GetMethod();
		if (method is null) {
			return null;
		}

		var typeName = method.DeclaringType?.FullName ?? "(unknown type)";
		var fileName = frame.GetFileName();

		if (string.IsNullOrEmpty(fileName)) {
			return $"{typeName}.{method.Name}";
		}

		return $"{typeName}.{method.Name} at {fileName}:{frame.GetFileLineNumber()}";
	}
}
