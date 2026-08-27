
using System.Net;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Uploads;

/// <summary>
/// Issue #1654: a symlink placed inside `uploads/` and pointing outside the
/// storage root is followed by PhysicalFileProvider + StaticFileMiddleware, and
/// its target is served anonymously with a 200 and its full content. This
/// neutralises the #1602 scope restriction because the symlink is a reparse
/// point that resolves outside the served tree.
/// </summary>
/// The fix introduces a wrapper IFileProvider that rejects entries whose
/// attributes contain <see cref="FileAttributes.ReparsePoint"/> before the
/// static-file middleware ever reads them, returning 404 for the symlink while
/// still serving genuine files with 200.
/// </summary>
public sealed class SymlinkEscapeSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly ApiFixture _fixture;

	public SymlinkEscapeSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_fixture = fixture;
	}

	private string GetUploadsDir() {
		var fileStorage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var uploadsDir = Path.Combine(fileStorage.RootPath, "uploads");
		Directory.CreateDirectory(uploadsDir);
		return uploadsDir;
	}

	/// <summary>
	/// A symlink inside `uploads/` pointing to a real file outside the storage
	/// root must NOT be served: it must return 404. Against the current
	/// (unpatched) PhysicalFileProvider this returns 200 with the file's content
	/// — that RED run is the proof the defect exists. After the fix (a wrapper
	/// IFileProvider that rejects <see cref="FileAttributes.ReparsePoint"/>)
	/// this returns 404.
	/// </summary>
	[Fact]
	public async Task ItShouldNotFollowSymlinksPointingOutsideTheStorageRoot() {
		var uploadsDir = GetUploadsDir();

		// A real file placed OUTSIDE the storage root — the symlink target.
		var sentinelContent = $"sentinel-{Guid.NewGuid():N}";
		var sentinelPath = Path.Combine(
			Path.GetDirectoryName(uploadsDir)!,
			$"sentinel-{Guid.NewGuid():N}.txt"
		);
		await File.WriteAllTextAsync(sentinelPath, sentinelContent);
		try {
			// The symlink sits INSIDE the served tree (uploads/), but resolves
			// OUTSIDE it (to <storage-root>/..). A naive PhysicalFileProvider
			// follows it; the patched provider must not.
			var linkName = $"escape-link-{Guid.NewGuid():N}.txt";
			var linkPath = Path.Combine(uploadsDir, linkName);
			File.CreateSymbolicLink(linkPath, sentinelPath);
			try {
				using var response = await _http.GetAsync(
					$"/files/uploads/{linkName}"
				);

				response.StatusCode.Should().Be(HttpStatusCode.NotFound);
			} finally {
				// Clean up the symlink (not the target). File.Delete works on
				// symlinks regardless of whether the link target exists.
				if (File.Exists(linkPath)) {
					File.Delete(linkPath);
				}
			}
		} finally {
			if (File.Exists(sentinelPath)) {
				File.Delete(sentinelPath);
			}
		}
	}

	/// <summary>
	/// A genuine file inside `uploads/` must still be served with 200 after the
	/// symlink patch. The fix must not break normal static-file serving by
	/// rejecting regular files (reparse-point filtering is exact, not broad).
	/// </summary>
	[Fact]
	public async Task ItShouldStillServeGenuineFilesInsideUploadsAfterSymlinkPatch() {
		var uploadsDir = GetUploadsDir();

		var existingFileName = $"genuine-file-{Guid.NewGuid():N}.txt";
		var existingContent = $"genuine-{Guid.NewGuid():N}";
		await File.WriteAllTextAsync(
			Path.Combine(uploadsDir, existingFileName), existingContent
		);

		using var response = await _http.GetAsync(
			$"/files/uploads/{existingFileName}"
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		(await response.Content.ReadAsStringAsync()).Should().Be(existingContent);
	}
}
