using System.Net;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Uploads;

/// <summary>
/// Issue #1654: tests the intermediate-directory symlink case — when a
/// directory inside `uploads/` is itself a symlink pointing outside the
/// storage root, files "beneath" it should not be served.
/// </summary>
public sealed class IntermediateSymlinkSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly ApiFixture _fixture;

	public IntermediateSymlinkSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldNotFollowSymlinkedDirectoriesInsideUploads() {
		var fileStorage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var uploadsDir = Path.Combine(fileStorage.RootPath, "uploads");
		Directory.CreateDirectory(uploadsDir);

		// Create a real file OUTSIDE the storage root.
		var sentinelContent = $"sentinel-{Guid.NewGuid():N}";
		var sentinelPath = Path.Combine(
			Path.GetDirectoryName(uploadsDir)!,
			$"sentinel-{Guid.NewGuid():N}.txt"
		);
		await File.WriteAllTextAsync(sentinelPath, sentinelContent);
		try {
			// Create a symlinked directory inside uploads/ pointing to the
			// parent of the storage root (outside uploads/).
			var linkDirName = $"escape-dir-{Guid.NewGuid():N}";
			var linkDirPath = Path.Combine(uploadsDir, linkDirName);
			var parentDir = Path.GetDirectoryName(uploadsDir)!;
			File.CreateSymbolicLink(linkDirPath, parentDir);
			try {
				// The symlinked directory "contains" the sentinel file when
				// traversed — but the sentinel lives OUTSIDE uploads/.
				var sentinelFile = Path.GetFileName(sentinelPath);
				var requestUrl = $"/files/uploads/{linkDirName}/{sentinelFile}";

				using var response = await _http.GetAsync(requestUrl);

				response.StatusCode.Should().Be(HttpStatusCode.NotFound);
			} finally {
				if (File.Exists(linkDirPath) || Directory.Exists(linkDirPath)) {
					File.Delete(linkDirPath);
				}
			}
		} finally {
			if (File.Exists(sentinelPath)) {
				File.Delete(sentinelPath);
			}
		}
	}
}
