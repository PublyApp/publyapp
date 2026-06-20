
using System.Text.Json;

namespace PublyApp.Api.Lib.Testing.Helpers;

internal static class OpenApiDocumentHelper {
	public static async Task<JsonDocument> ReadAsync() {
		var openApiPath = FindOpenApiPath();

		await using var stream = File.OpenRead(openApiPath);
		return await JsonDocument.ParseAsync(stream);
	}

	public static async Task<string> ReadTextAsync() {
		var openApiPath = FindOpenApiPath();

		return await File.ReadAllTextAsync(openApiPath);
	}

	private static string FindOpenApiPath() {
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
