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
/// neutralises the #1602 scope restriction because the symlink carries
/// <see cref="FileAttributes.ReparsePoint"/> and resolves outside the served tree.
/// </summary>
/// <remarks>
/// The fix introduces a wrapper IFileProvider that rejects entries whose
/// attributes contain <see cref="FileAttributes.ReparsePoint"/> before the
/// static-file middleware ever reads them, returning 404 for the symlink while
/// still serving genuine files with 200.
///
/// Note: on Linux, <see cref="FileAttributes.ReparsePoint"/> is set ONLY for
/// symbolic links, NOT for bind mounts. The guard detects symlinks but does NOT
/// detect bind mounts. See <see cref="ReparsePointExclusionFileProvider"/> type
/// docs for the platform-scope caveat.
/// </remarks>
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
	/// Paired proof for #1654 (both assertions in the same test): a symlink
	/// inside `uploads/` pointing to a real file outside the storage root must
	/// return 404, while a genuine file inside `uploads/` must still return 200
	/// with its content.
	///
	/// Against the unpatched PhysicalFileProvider the symlink assertion fails
	/// first (200 + body) — that RED run is the proof the defect exists. After
	/// the fix (a wrapper IFileProvider that rejects
	/// <see cref="FileAttributes.ReparsePoint"/>) the symlink returns 404 and the
	/// genuine file still returns 200.
	/// </summary>
	[Fact]
	public async Task ItShouldNotFollowSymlinksPointingOutsideTheStorageRootAndStillServeGenuineFiles() {
		var uploadsDir = GetUploadsDir();

		// --- Symlink escape case: must be 404 after the fix ---

		// A real file placed OUTSIDE the storage root — the symlink target.
		var sentinelContent = $"sentinel-{Guid.NewGuid():N}";
		var sentinelPath = Path.Combine(
			Path.GetDirectoryName(uploadsDir)!,
			$"sentinel-{Guid.NewGuid():N}.txt"
		);
		await File.WriteAllTextAsync(sentinelPath, sentinelContent);

		var linkName = $"escape-link-{Guid.NewGuid():N}.txt";
		var linkPath = Path.Combine(uploadsDir, linkName);

		try {
			// The symlink sits INSIDE the served tree (uploads/), but resolves
			// OUTSIDE it (to <storage-root>/..). A naive PhysicalFileProvider
			// follows it; the patched provider must not.
			File.CreateSymbolicLink(linkPath, sentinelPath);

			using var symlinkResponse = await _http.GetAsync($"/files/uploads/{linkName}");
			symlinkResponse.StatusCode.Should().Be(HttpStatusCode.NotFound,
				"the symlink must be masked as 404, not followed to its out-of-tree target");
		} finally {
			if (File.Exists(linkPath)) {
				File.Delete(linkPath); // deletes the symlink, not the target
			}
			if (File.Exists(sentinelPath)) {
				File.Delete(sentinelPath);
			}
		}

		// --- Genuine file case: must still be 200 (no regression) ---

		var genuineFileName = $"genuine-file-{Guid.NewGuid():N}.txt";
		var genuineContent = $"genuine-{Guid.NewGuid():N}";
		await File.WriteAllTextAsync(
			Path.Combine(uploadsDir, genuineFileName), genuineContent
		);

		using var genuineResponse = await _http.GetAsync($"/files/uploads/{genuineFileName}");
		genuineResponse.StatusCode.Should().Be(HttpStatusCode.OK,
			"a real file inside uploads/ must still be served after the symlink patch");
		(await genuineResponse.Content.ReadAsStringAsync()).Should().Be(genuineContent);
	}

	/// <summary>
	/// #1671 — a masked symlink and a genuinely missing file must produce
	/// indistinguishable 404 responses: the same status code, the same body,
	/// and the same headers. The entire purpose of the guard is to not reveal
	/// that a target exists, so any difference in the 404 surface leaks that
	/// information.
	/// </summary>
	[Fact]
	public async Task ItShouldReturnIndistinguishable404ForMaskedEntryAndMissingFile() {
		var uploadsDir = GetUploadsDir();

		// --- Masked symlink case: a symlink inside uploads/ pointing outside ---
		var sentinelContent = $"sentinel-{Guid.NewGuid():N}";
		var sentinelPath = Path.Combine(
			Path.GetDirectoryName(uploadsDir)!,
			$"sentinel-{Guid.NewGuid():N}.txt"
		);
		await File.WriteAllTextAsync(sentinelPath, sentinelContent);

		var linkName = $"escape-link-{Guid.NewGuid():N}.txt";
		var linkPath = Path.Combine(uploadsDir, linkName);

		// --- Genuinely missing file case: a name that never existed ---
		var missingName = $"missing-{Guid.NewGuid():N}.txt";

		try {
			File.CreateSymbolicLink(linkPath, sentinelPath);

			using var maskedResponse = await _http.GetAsync($"/files/uploads/{linkName}");
			using var missingResponse = await _http.GetAsync($"/files/uploads/{missingName}");

			// Both must be 404.
			maskedResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
			missingResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

			// Bodies must be identical.
			var maskedBody = await maskedResponse.Content.ReadAsStringAsync();
			var missingBody = await missingResponse.Content.ReadAsStringAsync();
			maskedBody.Should().Be(missingBody,
				"the body of a masked-symlink 404 must be identical to a genuinely missing-file 404");

			// Headers must be identical (excluding any timing/request-scoped headers).
			var maskedHeaders = NormalizeHeaders(maskedResponse.Headers);
			var missingHeaders = NormalizeHeaders(missingResponse.Headers);
			maskedHeaders.Should().BeEquivalentTo(missingHeaders,
				"the headers of a masked-symlink 404 must be identical to a genuinely missing-file 404");
		} finally {
			if (File.Exists(linkPath)) {
				File.Delete(linkPath);
			}
			if (File.Exists(sentinelPath)) {
				File.Delete(sentinelPath);
			}
		}
	}

	/// <summary>
	/// Normalizes headers by removing any that vary per-request (Date, etc.)
	/// so the comparison focuses on the structural headers that could leak
	/// information about why the 404 occurred.
	/// </summary>
	private static Dictionary<string, string> NormalizeHeaders(System.Net.Http.Headers.HttpResponseHeaders headers) {
		var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
		foreach (var header in headers) {
			// Skip per-request headers that vary by timing.
			if (header.Key.Equals("Date", StringComparison.OrdinalIgnoreCase) ||
				header.Key.Equals("Set-Cookie", StringComparison.OrdinalIgnoreCase)) {
				continue;
			}
			dict[header.Key] = string.Join(", ", header.Value);
		}
		return dict;
	}
}
