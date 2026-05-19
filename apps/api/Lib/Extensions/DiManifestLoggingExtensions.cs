using MainApi.Lib.DI;

namespace MainApi.Lib.Extensions;

public static class DiManifestLoggingExtensions {
	public static WebApplication LogDiManifestIfPresent(this WebApplication app) {
		if (!app.Logger.IsEnabled(LogLevel.Information)) {
			return app;
		}

		var manifest = app.Services.GetService<DiManifest>();
		if (manifest is null) {
			return app;
		}

		app.Logger.LogInformation("{Manifest}", manifest.Text);
		return app;
	}
}
