using System.Globalization;

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
		}

		loggerConfig.WriteTo.Sanitized(writeTo => {
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
			// Production: Show only startup info in console
			else {
				writeTo.Logger(l => l
					.Filter.ByIncludingOnly(e =>
						e.Level == LogEventLevel.Information &&
						e.Properties.ContainsKey("SourceContext") &&
						e.Properties["SourceContext"].ToString().Contains("Microsoft.Hosting"))
					.WriteTo.Console(
						theme: AnsiConsoleTheme.Literate,
						formatProvider: CultureInfo.InvariantCulture,
						applyThemeToRedirectedOutput: true));
			}
		});
	}
}
