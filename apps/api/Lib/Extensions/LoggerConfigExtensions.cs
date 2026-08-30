using System.Globalization;

using PublyApp.Api.Lib.Diagnostics;
using PublyApp.Api.Lib.Logging;

using Serilog;
using Serilog.Events;
using Serilog.Sinks.SystemConsole.Themes;

namespace PublyApp.Api.Lib.Extensions;

public static class LoggerConfigExtensions {
	// Targets IHostApplicationBuilder (design §3.2, F17) so BOTH hosts — the api/all
	// WebApplication and the worker Generic Host — share one Serilog composition.
	// AddSerilog is the builder-agnostic equivalent of Host.UseSerilog.
	public static IHostApplicationBuilder ConfigureLogger(this IHostApplicationBuilder builder) {
		builder.Services.AddSerilog((serviceProvider, loggerConfig) => {
			var hostEnvironment = serviceProvider.GetRequiredService<IHostEnvironment>();

			BuildLoggerConfiguration(loggerConfig, hostEnvironment);
		});

		// #1708: drain the Serilog async queue on host shutdown. AddSerilog
		// alone does not register a Log.CloseAndFlush hook, so LogEvents still
		// queued at SIGTERM/StopAsync are dropped — the very events that
		// explain why the process exited. Registered here (not inside the
		// AddSerilog callback) so the type name + namespace are discoverable
		// by the structural SerilogAsyncSinkDrain spec.
		builder.Services.AddHostedService<SerilogFlushOnShutdown>();

		return builder;
	}

	/// <summary>
	/// The whole logger composition, split out from the DI callback so LoggerSinkGraph.Spec
	/// can build and enumerate the exact graph the app runs, per environment.
	/// <para>
	/// STRUCTURAL INVARIANT (design §5.1, R2-8/R3-5/O13): every console and file sink is
	/// configured INSIDE the single <c>WriteTo.Sanitized(...)</c> wrapper below. There is
	/// deliberately NO direct sink path around it — Serilog renders
	/// <c>LogEvent.Exception</c> verbatim to console/file, so a sink attached outside the
	/// wrapper would leak raw exception messages (tokens, provider bodies, recipient
	/// addresses) into durable output. Level configuration stays outside the wrapper (it
	/// selects events, it does not write them); sinks never do.
	/// </para>
	/// <para>
	/// Public (not private to the DI callback) purely so the spec can compose the exact
	/// graph the app runs, the same way Program's role builders are public for
	/// AppRoleComposition.Spec.
	/// </para>
	/// </summary>
	public static void BuildLoggerConfiguration(
		LoggerConfiguration loggerConfig,
		IHostEnvironment hostEnvironment
	) {
		loggerConfig
			.MinimumLevel.Information()
			.MinimumLevel.Override("Microsoft", LogEventLevel.Information)
			.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)
			.Enrich.FromLogContext()
			.Enrich.WithMachineName()
			.Enrich.WithThreadId();

		// Level selection per environment (no sinks here — see the invariant above).
		if (hostEnvironment.IsDevelopment()) {
			loggerConfig.MinimumLevel.Debug();
		} else if (hostEnvironment.IsEnvironment(EnvironmentNames.Testing)) {
			if (AppEnvironment.IsTestVerboseLoggingEnabled) {
				loggerConfig
					.MinimumLevel.Information()
					.MinimumLevel.Override("Microsoft", LogEventLevel.Information);
			} else {
				loggerConfig
					.MinimumLevel.Warning()
					.MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
					.MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Warning)
					.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Query", LogEventLevel.Error);
			}
		} else {
			// Production. ASP.NET emits a "Request starting"/"Request finished" pair at
			// Information for EVERY request. The console sink below now carries
			// Information-and-above, and Serilog's console sink writes SYNCHRONOUSLY to
			// Console.Out (a lock-synchronized writer), so leaving Microsoft.AspNetCore at
			// Information would put per-request I/O and lock contention on request threads —
			// stdout volume would scale with traffic. Warnings and errors from ASP.NET still
			// reach stdout; only the routine per-request pair is suppressed, which keeps the
			// deployed log signal-dense and the synchronous writes cheap.
			//
			// If per-request visibility is wanted later, add it deliberately as ONE summary
			// line per request (UseSerilogRequestLogging) rather than re-admitting this pair,
			// and revisit wrapping the console in .Async(...) at that point.
			loggerConfig.MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning);
		}

		loggerConfig.WriteTo.Sanitized(writeTo => {
			// #1309 boot-log probe (test-only): the canary-pass line must be observable as
			// the REAL artifact emits it. The probe attaches its in-memory capture sink
			// HERE, inside the sanitized wrapper — the structural invariant above leaves no
			// direct path around it, and a no-op for every normal boot keeps production
			// behavior byte-identical.
			CanaryBootLogProbe.AttachSinkIfRequested(writeTo);

			writeTo
				.Async(w => w.Logger(l => l
					.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Information)
					.WriteTo.File(
						path: ".artifacts/logs/info.log",
						formatProvider: CultureInfo.InvariantCulture,
						rollingInterval: RollingInterval.Day,
						fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
						retainedFileCountLimit: 7
					)));
			writeTo
				.Async(w => w.Logger(l => l
					.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Warning)
					.WriteTo.File(
						path: ".artifacts/logs/warning.log",
						formatProvider: CultureInfo.InvariantCulture,
						rollingInterval: RollingInterval.Day,
						fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
						retainedFileCountLimit: 7
					)));
			writeTo
				.Async(w => w.Logger(l => l
					.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Error)
					.WriteTo.File(
						path: ".artifacts/logs/error.log",
						formatProvider: CultureInfo.InvariantCulture,
						rollingInterval: RollingInterval.Day,
						fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
						retainedFileCountLimit: 7
					)));

			// Development: Show everything in console + debug file
			if (hostEnvironment.IsDevelopment()) {
				writeTo.Console(
					theme: AnsiConsoleTheme.Code,
					formatProvider: CultureInfo.InvariantCulture,
					applyThemeToRedirectedOutput: true
				);
				writeTo.Async(w => w.Logger(l => l
					.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Debug)
					.WriteTo.File(
						path: ".artifacts/logs/debug.log",
						formatProvider: CultureInfo.InvariantCulture,
						rollingInterval: RollingInterval.Day,
						fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
						retainedFileCountLimit: 7
					)));
			}
			// Testing: Keep console output concise. Surface only warnings/errors.
			else if (hostEnvironment.IsEnvironment(EnvironmentNames.Testing)) {
				if (AppEnvironment.IsTestVerboseLoggingEnabled) {
					writeTo.Console(
						theme: AnsiConsoleTheme.Code,
						formatProvider: CultureInfo.InvariantCulture,
						restrictedToMinimumLevel: LogEventLevel.Information,
						applyThemeToRedirectedOutput: false
					);
				} else {
					writeTo.Console(
						theme: AnsiConsoleTheme.Literate,
						formatProvider: CultureInfo.InvariantCulture,
						restrictedToMinimumLevel: LogEventLevel.Warning,
						applyThemeToRedirectedOutput: false
					);
				}
			}
			// Production: stream Information-and-above to stdout so the container runtime
			// captures it (see the rationale inside).
			else {
				// Everything Information-and-above goes to STDOUT, because that is the only
				// log surface a container runtime captures: `docker logs` and the hosting
				// platform's log panel read stdout/stderr, never files inside the container.
				// The previous filter admitted ONLY Information events from Microsoft.Hosting,
				// so a production process emitted its four startup lines and then went silent
				// forever — warnings and unhandled-exception errors (CustomExceptionHandler's
				// LogError) reached the file sinks above and nothing else, leaving a live
				// 500 undiagnosable from outside the container. Those files also sit on the
				// container's ephemeral layer, so they are destroyed on every redeploy.
				//
				// Debug/Verbose stay out deliberately: the global minimum is already
				// Information outside Development, and restricting the sink keeps production
				// stdout free of debug noise even if that minimum is ever loosened.
				writeTo.Console(
					theme: AnsiConsoleTheme.Literate,
					formatProvider: CultureInfo.InvariantCulture,
					restrictedToMinimumLevel: LogEventLevel.Information,
					applyThemeToRedirectedOutput: true
				);
			}
		});
	}
}
