using Serilog;
using Serilog.Events;

namespace MainApi.Src.Lib;

public static class SerilogConfigExtensions
{
	public static WebApplicationBuilder ConfigureSerilog(this WebApplicationBuilder builder)
	{
		builder.Host.UseSerilog((context, loggerConfig) =>
		{
			var environment = context.HostingEnvironment.EnvironmentName;

			loggerConfig
				.MinimumLevel.Information()
				.MinimumLevel.Override("Microsoft", LogEventLevel.Information)
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
			if (environment == "Development")
			{
				loggerConfig
					.MinimumLevel.Debug()
					.WriteTo.Console()
					.WriteTo.Async(writeTo => writeTo.Logger(l => l
						.Filter.ByIncludingOnly(e => e.Level == LogEventLevel.Debug)
						.WriteTo.File(
							path: "logs/debug.log",
							rollingInterval: RollingInterval.Day,
							fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
							retainedFileCountLimit: 7
						)));
			}
			// Production: Show only startup info in console
			else
			{
				loggerConfig
					.WriteTo.Logger(l => l
						.Filter.ByIncludingOnly(e =>
							e.Level == LogEventLevel.Information &&
							e.Properties.ContainsKey("SourceContext") &&
							e.Properties["SourceContext"].ToString().Contains("Microsoft.Hosting"))
						.WriteTo.Console());
			}
		});

		return builder;
	}
}
