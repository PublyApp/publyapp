using System.Security.Cryptography;
using System.Text;

namespace PublyApp.Api.Lib.Testing.Fixtures;
/// <summary>
/// Stable fingerprint of everything that shapes the test template database:
/// EF migrations and the model snapshot, the seeders, the test seed code, and
/// the package/build files that pin the EF Core and Npgsql versions.
///
/// The template database name embeds the fingerprint, so a warm reused
/// container serves the template for the code state that built it, and any
/// change (a new migration, a seeder edit, a package bump) selects a new name
/// and rebuilds from scratch. A spec or an unrelated source edit does not.
/// </summary>
internal static class TestDatabaseCacheKey {
	private const string _TemplateDbBaseName = "publyapp_api_template";
	private static readonly Lazy<string> _Key = new(TestDatabaseCacheKey._Compute);

	public static string Key {
		get { return TestDatabaseCacheKey._Key.Value; }
	}

	public static string TemplateDbName {
		get {
			return $"{TestDatabaseCacheKey._TemplateDbBaseName}_"
				+ TestDatabaseCacheKey._Key.Value[..12];
		}
	}

	private static string _Compute() {
		var repoRoot = TestDatabaseReuse.RepoRoot;
		using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
		foreach (var file in TestDatabaseCacheKey._SourceFiles(repoRoot)) {
			var relativePath = Path.GetRelativePath(repoRoot, file)
				.Replace('\\', '/');
			hash.AppendData(Encoding.UTF8.GetBytes(relativePath));
			hash.AppendData("\n"u8);
			hash.AppendData(File.ReadAllBytes(file));
		}

		return Convert
			.ToHexString(hash.GetHashAndReset())
			.ToLowerInvariant();
	}

	private static IEnumerable<string> _SourceFiles(string repoRoot) {
		var apiRoot = Path.Combine(repoRoot, "apps", "api");
		var sourceRoots = new[] {
			Path.Combine(apiRoot, "Migrations"),
			Path.Combine(apiRoot, "Data"),
			Path.Combine(apiRoot, "Lib", "Testing"),
			Path.Combine(apiRoot, "Lib", "Seeding"),
		};
		var versionFiles = new[] {
			Path.Combine(repoRoot, "Directory.Packages.props"),
			Path.Combine(repoRoot, "Directory.Build.props"),
			Path.Combine(apiRoot, "Directory.Build.props"),
			Path.Combine(apiRoot, "PublyApp.Api.csproj"),
			Path.Combine(apiRoot, "Tests", "PublyApp.Api.Tests.csproj"),
		};

		return sourceRoots
			.Where(Directory.Exists)
			.SelectMany(root => Directory.EnumerateFiles(
				root,
				"*",
				SearchOption.AllDirectories
			))
			.Concat(TestDatabaseCacheKey._SeederFiles(apiRoot))
			.Concat(versionFiles.Where(File.Exists))
			.Where(file =>
				!TestDatabaseCacheKey._IsGenerated(file)
				&& !file.EndsWith(".Spec.cs", StringComparison.Ordinal)
			)
			.Distinct(StringComparer.Ordinal)
			.OrderBy(file => file, StringComparer.Ordinal);
	}

	private static IEnumerable<string> _SeederFiles(string apiRoot) {
		var modulesRoot = Path.Combine(apiRoot, "Modules");
		if (!Directory.Exists(modulesRoot)) {
			return [];
		}

		return Directory
			.EnumerateDirectories(
				modulesRoot,
				"Seeders",
				SearchOption.AllDirectories
			)
			.SelectMany(directory => Directory.EnumerateFiles(
				directory,
				"*.cs",
				SearchOption.AllDirectories
			));
	}

	private static bool _IsGenerated(string path) {
		var normalized = path.Replace('\\', '/');
		return normalized.Contains("/bin/", StringComparison.Ordinal)
			|| normalized.Contains("/obj/", StringComparison.Ordinal)
			|| normalized.Contains("/.artifacts/", StringComparison.Ordinal);
	}
}
