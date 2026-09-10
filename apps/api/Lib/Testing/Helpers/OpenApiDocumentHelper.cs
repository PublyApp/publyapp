
using System.Text.Json;

namespace PublyApp.Api.Lib.Testing.Helpers;

internal static class OpenApiDocumentHelper {
	public static async Task<JsonDocument> ReadAsync() {
		var openApiPath = _FindOpenApiPath();

		await using var stream = File.OpenRead(openApiPath);
		return await JsonDocument.ParseAsync(stream);
	}

	public static async Task<string> ReadTextAsync() {
		var openApiPath = _FindOpenApiPath();

		return await File.ReadAllTextAsync(openApiPath);
	}

	private static string _FindOpenApiPath() {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);

		while (directory is not null) {
			var candidate = Path.Combine(directory.FullName, "openapi.json");
			if (File.Exists(candidate)) {
				return candidate;
			}

			directory = directory.Parent;
		}

		throw new FileNotFoundException(
			"Could not find apps/api/openapi.json from the test output directory.",
			"openapi.json"
		);
	}
}
