
using System.Net;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Uploads;

/// <summary>
/// Issue #1602: the anonymous static-file mount in Program.cs must be scoped to
/// the `uploads/` sub-tree of the storage root, not the storage root as a whole.
/// Today the only writer always lands files under `uploads/`, so the wide mount is
/// harmless — but as soon as anything is written elsewhere under the root (e.g.
/// user-data exports, #286) it becomes anonymously downloadable by anyone who knows
/// the path. These two specs pin both halves of the fix:
///
/// (a) an EXISTING image URL (`/files/uploads/...`) keeps answering 200 — the
///     rescope must not break the URLs CreateStaffUpload already returns
///     (`/files/{path}` where `{path}` starts with `uploads/`);
/// (b) a file placed OUTSIDE `uploads/` under the root must answer 404 via
///     `/files/...` — the mount must no longer expose the whole root.
///
/// (b) is RED against the current root-wide mount and flips GREEN once the mount is
/// scoped. The named trap (counting `uploads/` twice) is exactly what (a) would have
/// caught had it broken the existing URLs — so the pair is the proof, not the prose.
/// </summary>
public sealed class StaticFilesScopeSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly ApiFixture _fixture;

	public StaticFilesScopeSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_fixture = fixture;
	}

	// (a) Non-regression: a URL already minted by CreateStaffUpload
	// (`/files/uploads/...`) must keep resolving to 200 after the mount is
	// scoped. This is the URL shape the product ships today, so a rescope that
	// double-counts `uploads/` (and silently 404s every live image URL) would
	// make this go RED — that is the named trap, caught here by the test.
	[Fact]
	public async Task ItShouldStillServeExistingUploadsUrlsAfterScopeRestriction() {
		var fileStorage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var uploadsDir = Path.Combine(fileStorage.RootPath, "uploads");
		Directory.CreateDirectory(uploadsDir);

		var existingFileName = $"regression-existing-{Guid.NewGuid():N}.txt";
		var existingContent = $"existing-{Guid.NewGuid():N}";
		await File.WriteAllTextAsync(
			Path.Combine(uploadsDir, existingFileName), existingContent
		);

		// Mirror of the contract CreateStaffUpload returns: `/files/{path}` with
		// `{path}` starting at `uploads/`.
		using var response = await _http.GetAsync($"/files/uploads/{existingFileName}");

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		(await response.Content.ReadAsStringAsync()).Should().Be(existingContent);
	}

	// (b) Regression: a file written directly under the storage root (NOT in
	// `uploads/`) must NOT be anonymously reachable through `/files/...`. Against
	// the current root-wide mount this returns 200 (RED); once the mount is
	// scoped to `uploads/`, the request no longer matches the static-file prefix
	// and falls through to the not-found route (404, GREEN).
	[Fact]
	public async Task ItShouldNotServeFilesPlacedOutsideUploadsViaFilesPath() {
		var fileStorage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var outsideFileName = $"outside-uploads-{Guid.NewGuid():N}.txt";
		var outsideContent = $"outside-{Guid.NewGuid():N}";
		await File.WriteAllTextAsync(
			Path.Combine(fileStorage.RootPath, outsideFileName), outsideContent
		);

		using var response = await _http.GetAsync($"/files/{outsideFileName}");

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}
}
