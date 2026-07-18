using System.Collections;
using System.Globalization;
using System.Reflection;

using FluentAssertions;

using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Lib.Extensions;

using Serilog;
using Serilog.Core;

using Xunit;

namespace PublyApp.Api.Lib.Logging;

// Configuration guard for the logging redaction boundary (design §5.1, R2-8/R3-5/O13).
//
// The rule it enforces: EVERY console/file sink in the composed logger sits behind the
// single SanitizingLogEventSink, because Serilog renders LogEvent.Exception — message and
// all — straight into those sinks, and destructuring policies cannot touch it. A sink
// attached outside the wrapper is therefore a silent redaction hole, not a style issue.
//
// This spec builds the SAME graph the app runs (LoggerConfigExtensions.BuildLoggerConfiguration)
// for each host environment, walks the built sink tree by reflection, and enumerates it. It
// fails if a sink is ever added outside the wrapper — which is exactly the edit a future
// reader is most likely to make, since `WriteTo.Console(...)` at the top level looks
// perfectly normal.
//
// Reflection over Serilog internals is deliberate: the sink graph is not otherwise
// observable, and the alternative — trusting that nobody adds a top-level sink — is the
// assumption R2-8 rejects.
public sealed class LoggerSinkGraphSpec {
	// Sink types that write durable output and therefore MUST be sanitized first.
	private static readonly string[] OutputSinkMarkers = [
		"Serilog.Sinks.SystemConsole",
		"Serilog.Sinks.File",
	];

	[Theory]
	[InlineData(EnvironmentNames.Development)]
	[InlineData(EnvironmentNames.Testing)]
	[InlineData(EnvironmentNames.Production)]
	public void ItShouldPlaceEveryOutputSinkBehindTheSanitizingWrapperForEachEnvironment(
		string environmentName
	) {
		using var logger = BuildLogger(environmentName);

		var nodes = WalkSinkGraph(logger);

		nodes.Should().NotBeEmpty("the composed logger must actually have sinks");

		var unsanitized = nodes
			.Where(node => IsOutputSink(node.SinkType) && !node.HasSanitizingAncestor)
			.Select(node => node.Path)
			.ToList();

		unsanitized.Should().BeEmpty(
			$"in '{environmentName}' every console/file sink must sit behind "
			+ nameof(SanitizingLogEventSink)
			+ " — Serilog renders LogEvent.Exception verbatim to these sinks, so one attached "
			+ "outside the wrapper leaks raw exception messages (tokens, provider bodies, "
			+ "recipient addresses) into durable output. Configure it inside WriteTo.Sanitized(...)"
		);
	}

	[Theory]
	[InlineData(EnvironmentNames.Development)]
	[InlineData(EnvironmentNames.Testing)]
	[InlineData(EnvironmentNames.Production)]
	public void ItShouldComposeExactlyOneSanitizingWrapperForEachEnvironment(string environmentName) {
		using var logger = BuildLogger(environmentName);

		var wrapperCount = WalkSinkGraph(logger)
			.Count(node => node.SinkType == typeof(SanitizingLogEventSink));

		wrapperCount.Should().Be(
			1,
			$"'{environmentName}' must wrap its whole sink graph in ONE {nameof(SanitizingLogEventSink)} "
			+ "(design §5.1): several wrappers would re-redact the same event and would mean the "
			+ "graph is no longer funnelled through a single boundary"
		);
	}

	// Non-vacuity control: the walker must be able to SEE an unsanitized output sink.
	// Without this, a walker that silently returned nothing would pass every assertion
	// above and the guard would be worthless.
	[Fact]
	public void ItShouldDetectAnOutputSinkAddedOutsideTheWrapper() {
		var loggerConfig = new LoggerConfiguration();
		BuildLoggerConfiguration(loggerConfig, EnvironmentNames.Production);

		// The exact regression this guard exists to catch: a plain top-level console sink
		// added alongside the sanitized graph.
		loggerConfig.WriteTo.Console(formatProvider: CultureInfo.InvariantCulture);

		using var logger = loggerConfig.CreateLogger();

		var unsanitized = WalkSinkGraph(logger)
			.Where(node => IsOutputSink(node.SinkType) && !node.HasSanitizingAncestor)
			.ToList();

		unsanitized.Should().NotBeEmpty(
			"the walker must detect a console sink attached outside the wrapper — otherwise "
			+ "the assertions above would pass vacuously"
		);
	}

	// --- helpers ------------------------------------------------------------------

	private static Logger BuildLogger(string environmentName) {
		var loggerConfig = new LoggerConfiguration();
		BuildLoggerConfiguration(loggerConfig, environmentName);

		return loggerConfig.CreateLogger();
	}

	private static void BuildLoggerConfiguration(
		LoggerConfiguration loggerConfig,
		string environmentName
	) {
		LoggerConfigExtensions.BuildLoggerConfiguration(
			loggerConfig,
			new FakeHostEnvironment { EnvironmentName = environmentName }
		);
	}

	// Only EnvironmentName steers BuildLoggerConfiguration; the rest satisfies the
	// interface. A fake keeps the spec off Serilog/Hosting internals for the one input
	// that matters.
	private sealed class FakeHostEnvironment : IHostEnvironment {
		public string EnvironmentName { get; set; } = EnvironmentNames.Production;
		public string ApplicationName { get; set; } = nameof(LoggerSinkGraphSpec);
		public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
		public IFileProvider ContentRootFileProvider { get; set; } =
			new NullFileProvider();
	}

	private static bool IsOutputSink(Type sinkType) {
		var typeName = sinkType.FullName ?? sinkType.Name;

		return OutputSinkMarkers.Any(marker => typeName.StartsWith(marker, StringComparison.Ordinal));
	}

	private sealed record SinkNode(Type SinkType, string Path, bool HasSanitizingAncestor);

	// Serilog exposes no public sink graph, so walk the object graph by reflection:
	// from the Logger's root sink, descend through every field that holds an
	// ILogEventSink or a collection of them. This is agnostic to Serilog's internal
	// wrapper types (aggregate, filtering, restricted, async, secondary-logger), which is
	// what keeps the guard from breaking on a Serilog upgrade.
	private static List<SinkNode> WalkSinkGraph(Logger logger) {
		var nodes = new List<SinkNode>();
		var visited = new HashSet<object>(ReferenceEqualityComparer.Instance);

		foreach (var rootSink in FindChildSinks(logger)) {
			Visit(rootSink, path: rootSink.GetType().Name, sanitizedAncestor: false, nodes, visited);
		}

		return nodes;
	}

	private static void Visit(
		ILogEventSink sink,
		string path,
		bool sanitizedAncestor,
		List<SinkNode> nodes,
		HashSet<object> visited
	) {
		if (!visited.Add(sink)) {
			return;
		}

		var sinkType = sink.GetType();
		nodes.Add(new SinkNode(sinkType, path, sanitizedAncestor));

		var sanitizedBelow = sanitizedAncestor || sinkType == typeof(SanitizingLogEventSink);

		foreach (var child in FindChildSinks(sink)) {
			Visit(child, $"{path} -> {child.GetType().Name}", sanitizedBelow, nodes, visited);
		}
	}

	private static IEnumerable<ILogEventSink> FindChildSinks(object owner) {
		var fields = owner.GetType().GetFields(
			BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic
		);

		foreach (var field in fields) {
			var value = field.GetValue(owner);
			if (value is null) {
				continue;
			}

			if (value is ILogEventSink childSink) {
				yield return childSink;

				continue;
			}

			// Aggregate sinks hold their children in an array/list.
			if (value is IEnumerable enumerable and not string) {
				foreach (var item in enumerable) {
					if (item is ILogEventSink enumeratedSink) {
						yield return enumeratedSink;
					}
				}
			}
		}
	}
}
