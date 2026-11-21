namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>Locates the apps/api source root for specs that scan the source tree.</summary>
public static class ApiSourceRoot {
	// The test assembly runs from apps/api/.artifacts/bin/...; walk up until the
	// directory containing PublyApp.Api.csproj (the apps/api root).
	public static string Find() {
		var current = new DirectoryInfo(AppContext.BaseDirectory);

		while (current is not null) {
			if (File.Exists(Path.Combine(current.FullName, "PublyApp.Api.csproj"))) {
				return current.FullName;
			}

			current = current.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the apps/api root (PublyApp.Api.csproj) above "
			+ AppContext.BaseDirectory
		);
	}
}
