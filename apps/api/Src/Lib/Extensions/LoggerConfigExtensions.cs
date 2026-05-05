using Serilog;
using Serilog.Events;
using Serilog.Sinks.SystemConsole.Themes;

namespace MainApi.Src.Lib.Extensions;

public static class LoggerConfigExtensions {
	public static WebApplicationBuilder ConfigureLogger(this WebApplicationBuilder builder) {
		builder.Host.UseSerilog((context, loggerConfig) => {
			var hostEnvironment = context.HostingEnvironment;

			loggerConfig
				.MinimumLevel.Information()
				.MinimumLevel.Override("Microsoft", LogEventLevel.Information)
				.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)
				.Enrich.FromLogContext()
				.Enrich.WithMachineName()
				.Enrich.WithThreadId()
				.WriteTo.Async(writeTo => writeTo.Logger(l => l
					.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Information)
					.WriteTo.File(
						path: "logs/info.log",
						rollingInterval: RollingInterval.Day,
						fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
						retainedFileCountLimit: 7
					)))
				.WriteTo.Async(writeTo => writeTo.Logger(l => l
					.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Warning)
					.WriteTo.File(
						path: "logs/warning.log",
						rollingInterval: RollingInterval.Day,
						fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
						retainedFileCountLimit: 7
					)))
				.WriteTo.Async(writeTo => writeTo.Logger(l => l
					.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Error)
					.WriteTo.File(
						path: "logs/error.log",
						rollingInterval: RollingInterval.Day,
						fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
						retainedFileCountLimit: 7
					)));

			// Development: Show everything in console + debug file
			if (hostEnvironment.IsDevelopment()) {
				loggerConfig
					.MinimumLevel.Debug()
					.WriteTo.Console(
						theme: AnsiConsoleTheme.Code,
						// outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}",
						applyThemeToRedirectedOutput: true
						)
					.WriteTo.Async(writeTo => writeTo.Logger(l => l
						.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Debug)
						.WriteTo.File(
							path: "logs/debug.log",
							rollingInterval: RollingInterval.Day,
							fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
							retainedFileCountLimit: 7
						)));
			}
			// Testing: Keep console output concise. Surface only warnings/errors.
			else if (hostEnvironment.IsEnvironment(EnvironmentNames.Testing)) {
				if (AppEnvironment.IsTestVerboseLoggingEnabled) {
					loggerConfig
						.MinimumLevel.Information()
						.MinimumLevel.Override("Microsoft", LogEventLevel.Information)
						.WriteTo.Console(
							theme: AnsiConsoleTheme.Code,
							restrictedToMinimumLevel: LogEventLevel.Information,
							applyThemeToRedirectedOutput: false
						);
				} else {
					loggerConfig
						.MinimumLevel.Warning()
						.MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
						.MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Warning)
						.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Query", LogEventLevel.Error)
						.WriteTo.Console(
							theme: AnsiConsoleTheme.Literate,
							restrictedToMinimumLevel: LogEventLevel.Warning,
							applyThemeToRedirectedOutput: false
						);
				}
			}
			// Production: Show only startup info in console
			else {
				loggerConfig
					.WriteTo.Logger(l => l
						.Filter.ByIncludingOnly(e =>
							e.Level == LogEventLevel.Information &&
							e.Properties.ContainsKey("SourceContext") &&
							e.Properties["SourceContext"].ToString().Contains("Microsoft.Hosting"))
						.WriteTo.Console(
							theme: AnsiConsoleTheme.Literate,
							applyThemeToRedirectedOutput: true));
			}
		});

		return builder;
	}
}
