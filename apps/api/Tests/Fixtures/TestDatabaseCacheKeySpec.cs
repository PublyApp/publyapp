using FluentAssertions;

using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Tests.Fixtures;

public sealed class TestDatabaseCacheKeySpec {
	[Fact]
	public void ItShouldChangeTheKeyWhenASeederInputChanges() {
		var root = TestDatabaseCacheKeySpec._CreateTree();
		try {
			var initial = TestDatabaseCacheKey.ComputeKey(root);

			TestDatabaseCacheKeySpec._Append(
				root,
				"apps/api/Lib/AppPermissions.cs",
				"// new permission"
			);
			var afterPermissions =
				TestDatabaseCacheKey.ComputeKey(root);
			afterPermissions.Should().NotBe(initial);

			TestDatabaseCacheKeySpec._Append(
				root,
				"apps/api/Modules/Roles/Entities/SystemRoleNames.cs",
				"// renamed role"
			);
			var afterRoleNames = TestDatabaseCacheKey.ComputeKey(root);
			afterRoleNames.Should().NotBe(afterPermissions);

			TestDatabaseCacheKeySpec._Append(
				root,
				"apps/api/Modules/Posts/Permissions/PostPermissions.cs",
				"// new module permission"
			);
			TestDatabaseCacheKey.ComputeKey(root)
				.Should().NotBe(afterRoleNames);
		} finally {
			Directory.Delete(root, recursive: true);
		}
	}

	[Fact]
	public void ItShouldIgnoreEditsOutsideTheSeededTemplateInputs() {
		var root = TestDatabaseCacheKeySpec._CreateTree();
		try {
			var initial = TestDatabaseCacheKey.ComputeKey(root);

			TestDatabaseCacheKeySpec._Append(
				root,
				"apps/api/Modules/Posts/Handlers/CreatePost.cs",
				"//"
			);
			TestDatabaseCacheKeySpec._Append(
				root,
				"apps/api/Modules/Posts/Permissions/PostPermissions.Spec.cs",
				"//"
			);

			TestDatabaseCacheKey.ComputeKey(root).Should().Be(initial);
		} finally {
			Directory.Delete(root, recursive: true);
		}
	}

	private static string _CreateTree() {
		var root = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-cache-key-{Guid.NewGuid():N}"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Migrations/20260101000000_Init.cs",
			"//"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Data/SeedData.cs",
			"//"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Lib/Testing/Helper.cs",
			"//"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Lib/Seeding/Seeder.cs",
			"//"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Modules/Posts/Seeders/PostSeeder.cs",
			"//"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Modules/Posts/Permissions/PostPermissions.cs",
			"//"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Modules/Roles/Entities/SystemRoleNames.cs",
			"//"
		);
		TestDatabaseCacheKeySpec._Write(
			root,
			"apps/api/Lib/AppPermissions.cs",
			"//"
		);
		return root;
	}

	private static void _Write(
		string root,
		string relativePath,
		string content
	) {
		var path = Path.Combine(
			root,
			relativePath.Replace('/', Path.DirectorySeparatorChar)
		);
		var directory = Path.GetDirectoryName(path);
		if (directory is not null) {
			Directory.CreateDirectory(directory);
		}

		File.WriteAllText(path, content);
	}

	private static void _Append(
		string root,
		string relativePath,
		string content
	) {
		var path = Path.Combine(
			root,
			relativePath.Replace('/', Path.DirectorySeparatorChar)
		);
		var directory = Path.GetDirectoryName(path);
		if (directory is not null) {
			Directory.CreateDirectory(directory);
		}

		File.AppendAllText(path, content);
	}
}
