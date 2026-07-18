using Serilog;
using Serilog.Configuration;

namespace PublyApp.Api.Lib.Logging;

public static class SanitizingSinkConfigurationExtensions {
	/// <summary>
	/// Configures the real sinks BEHIND a single <see cref="SanitizingLogEventSink"/>
	/// (design §5.1, R2-8/R3-5/O13).
	/// <para>
	/// The nesting is the guarantee: sinks can only be registered inside
	/// <paramref name="configureWrappedSink"/>, so there is no direct console/file path
	/// around the wrapper for a later edit to reach for by accident. Adding a sink means
	/// adding it inside this callback, which means it is sanitized. Every event bound for
	/// a durable sink passes through exactly one wrapper — a per-sink wrapper would
	/// redact the same event repeatedly and would still let a bare <c>WriteTo.Console</c>
	/// slip in alongside.
	/// </para>
	/// <para>
	/// <c>LoggerSinkGraph.Spec</c> enumerates the built graph and fails if a console or
	/// file sink ever appears outside the wrapper.
	/// </para>
	/// </summary>
	public static LoggerConfiguration Sanitized(
		this LoggerSinkConfiguration loggerSinkConfiguration,
		Action<LoggerSinkConfiguration> configureWrappedSink
	) {
		var sanitizingSink = LoggerSinkConfiguration.Wrap(
			wrapped => new SanitizingLogEventSink(wrapped),
			configureWrappedSink
		);

		return loggerSinkConfiguration.Sink(sanitizingSink);
	}
}
