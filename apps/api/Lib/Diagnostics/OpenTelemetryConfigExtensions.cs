using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace PublyApp.Api.Lib.Diagnostics;

/// <summary>
/// Wires the OpenTelemetry SDK for <strong>traces and metrics only</strong> (issue #255
/// spike). Export goes to the OTLP endpoint injected by the local Aspire AppHost and is
/// visible in its dashboard; without that endpoint the whole registration is skipped, so
/// tests, bare `dotnet run`, doc-gen and production behave exactly as before.
/// </summary>
/// <remarks>
/// <para>
/// STRUCTURAL RED LINE (issue #255, acceptance criterion): this composition must NEVER
/// register a LOGGING export path. Every durable log line flows through the single Serilog
/// <c>WriteTo.Sanitized(...)</c> wrapper (see LoggerConfigExtensions, invariant R2-8/R3-5/O13);
/// the default OpenTelemetry logger provider would be a SECOND export path outside that
/// sanitizer. Concretely: no <c>WithLogging</c>, no second <c>AddOpenTelemetry</c> chain,
/// no <c>Serilog.Sinks.OpenTelemetry</c>. The guard spec
/// (<c>OpenTelemetryLogPathGuard.Spec</c>) reads this file and fails the build if any of
/// those appear — extend THAT spec first if the sanitized-log-export question is ever
/// deliberately reopened.
/// </para>
/// <para>
/// Activation gate: the SDK is only attached when the process carries
/// <c>OTEL_EXPORTER_OTLP_ENDPOINT</c> — the variable the Aspire AppHost injects into the
/// resources it orchestrates. Nothing else in the repo sets it, which makes the local
/// dashboard the single activation switch and keeps every other boot path byte-stable.
/// </para>
/// </remarks>
public static class OpenTelemetryConfigExtensions {
	// The environment variable the Aspire AppHost injects (OTel semantic convention).
	// A non-empty, non-whitespace value is the activation gate (IsNullOrWhiteSpace check).
	private const string OtlpEndpointVariableName = "OTEL_EXPORTER_OTLP_ENDPOINT";

	// Future-proofing: custom sources should follow the PublyApp.* namespace so this
	// filter keeps picking them up without editing the composition.
	private const string CustomActivitySourcePattern = "PublyApp.*";

	/// <summary>
	/// Attaches traces + metrics export when (and only when) an OTLP endpoint is present.
	/// Safe to call on BOTH hosts — the web host and the worker Generic Host — so each
	/// orchestrated process reports telemetry under its own service name.
	/// </summary>
	public static IHostApplicationBuilder ConfigureOpenTelemetry(
		this IHostApplicationBuilder builder
	) {
		var otlpEndpoint = Environment.GetEnvironmentVariable(OtlpEndpointVariableName);
		if (string.IsNullOrWhiteSpace(otlpEndpoint)) {
			// No orchestrator asked for telemetry: attach nothing at all. This is what
			// keeps Testing/doc-gen/production boots identical to pre-#255 behavior.
			return builder;
		}

		// Single sanctioned AddOpenTelemetry chain (see the remarks red line above):
		// traces + metrics builders ONLY. The logging builder must not appear here.
		builder.Services.AddOpenTelemetry()
			.ConfigureResource(resource => resource.AddService(
				serviceName: ResolveServiceName(),
				serviceInstanceId: Environment.MachineName
			))
			.WithTracing(tracing => tracing
				.AddSource(CustomActivitySourcePattern)
				.AddAspNetCoreInstrumentation()
				.AddHttpClientInstrumentation()
				.AddOtlpExporter()
			)
			.WithMetrics(metrics => metrics
				.AddRuntimeInstrumentation()
				.AddAspNetCoreInstrumentation()
				.AddHttpClientInstrumentation()
				.AddOtlpExporter()
			);

		return builder;
	}

	// Names the telemetry stream after the APP_ROLE so the dashboard distinguishes the
	// two orchestrated processes of the same binary (api vs worker). Both call sites run
	// after AppEnvironment.Initialize(), so Instance is available; failing loudly on an
	// uninitialized caller is the repo's normal fail-fast posture.
	private static string ResolveServiceName() {
		// Every AppRole member must stay listed (IDE0072): adding a role then fails
		// compilation here instead of silently reporting telemetry as "publyapp-all".
		// Every AppRole member must stay listed (IDE0072): adding a role then fails
		// compilation here instead of silently reporting telemetry as "publyapp-all".
		// The trailing discard keeps the switch expression exhaustive (CS8524) for the
		// in-range-but-unnamed underlying values an enum can hold at runtime.
		return AppEnvironment.Instance.Role switch {
			AppRole.Api => "publyapp-api",
			AppRole.Worker => "publyapp-worker",
			AppRole.All => "publyapp-all",
			_ => "publyapp-all",
		};
	}
}
