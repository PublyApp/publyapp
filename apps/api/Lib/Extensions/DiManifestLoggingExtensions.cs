using PublyApp.Api.Lib.DI;

namespace PublyApp.Api.Lib.Extensions;

public static class DiManifestLoggingExtensions {
	// Targets IHost (which WebApplication implements) so the api/all web app AND the
	// worker Generic Host (design §3.2, F17) share the same manifest logging.
	public static IHost LogDiManifestIfPresent(this IHost host) {
		var logger = host.Services
			.GetRequiredService<ILoggerFactory>()
			.CreateLogger(nameof(Program));

		if (!logger.IsEnabled(LogLevel.Information)) {
			return host;
		}

		var manifest = host.Services.GetService<DiManifest>();
		if (manifest is null) {
			return host;
		}

		logger.LogInformation("{Manifest}", manifest.Text);
		return host;
	}
}
