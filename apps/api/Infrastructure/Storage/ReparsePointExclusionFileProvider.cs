using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Wraps a <see cref="PhysicalFileProvider"/> and hides any file system entry
/// whose attributes contain <see cref="FileAttributes.ReparsePoint"/>
/// (i.e. symbolic links, mount points, and junction points).
///
/// Why wrap rather than use a custom IFileProvider: PhysicalFileProvider already
/// implements correct path canonicalisation, traversal rejection (".."), and
/// subpath enumeration. Re-implementing that from scratch would risk subtle
/// regressions; instead we delegate transparently and only override the single
/// concern — entry existence — to mask reparse points. The static-file middleware
/// calls <see cref="IFileProvider.GetFileInfo"/> for each request; when that
/// returns a non-existent <see cref="IFileInfo"/> the middleware yields 404, so
/// a symlink is rendered indistinguishable from a missing path.
///
/// Security context (issue #1654): PhysicalFileProvider follows symbolic links
/// by default. A symlink placed inside the served `uploads/` tree and pointing
/// outside it is resolved to its target and served as-is, bypassing the
/// #1602 scope restriction. Filtering on ReparsePoint at the provider boundary
/// is the minimal change that closes that path without altering the behaviour
/// for genuine files.
///
/// Scope: the check walks every directory component of the requested subpath
/// from the root downward, not just the final leaf. This catches the case where
/// an intermediate directory (e.g. `uploads/symlinked-dir/file.txt`) is itself
/// a symlink pointing outside the served tree — a file-level check on the leaf
/// alone would miss that, because the leaf file itself is not a reparse point.
/// </summary>
public sealed class ReparsePointExclusionFileProvider : IFileProvider {
	private readonly PhysicalFileProvider _inner;

	public ReparsePointExclusionFileProvider(PhysicalFileProvider inner) {
		_inner = inner;
	}

	/// <summary>
	/// Returns a synthetic <see cref="IFileInfo"/> with Exists == false for any
	/// entry that is — or has — a reparse point in its path. For regular files
	/// the delegate call passes through unchanged.
	/// </summary>
	public IFileInfo GetFileInfo(string subpath) {
		var info = _inner.GetFileInfo(subpath);
		if (info is null || !info.Exists) {
			return new NotFoundFileInfo(subpath);
		}

		var physicalPath = info.PhysicalPath;
		if (string.IsNullOrEmpty(physicalPath)) {
			return new NotFoundFileInfo(info.Name);
		}

		// Walk every directory component of the subpath from the served root
		// downward. If ANY component is a reparse point (symlink, mount,
		// junction), reject the entry. This covers both leaf symlinks (the
		// final path component is a reparse point) and intermediate-directory
		// symlinks (an ancestor directory in the path is a reparse point).
		if (HasReparsePointInPath(physicalPath, subpath)) {
			return new NotFoundFileInfo(info.Name);
		}

		return info;
	}

	public IDirectoryContents GetDirectoryContents(string subpath) {
		var contents = _inner.GetDirectoryContents(subpath);
		if (contents is null) {
			return NotFoundDirectoryContents.Instance;
		}

		if (!contents.Exists) {
			return NotFoundDirectoryContents.Instance;
		}

		// Filter out reparse-point entries from directory listings so that a
		// symlinked directory inside uploads/ does not surface its (possibly
		// external) contents in an enumeration. The static-file middleware does
		// not enumerate directories for serving, but DirectoryBrowser — if
		// ever enabled — and any custom caller should see the same masking.
		var filtered = new List<IFileInfo>();
		foreach (var entry in contents) {
			var entryPath = entry.PhysicalPath;
			if (string.IsNullOrEmpty(entryPath) || !IsReparsePoint(entryPath)) {
				filtered.Add(entry);
			}
		}

		return new FilterableDirectoryContents(filtered);
	}

	public IChangeToken Watch(string filter) {
		return _inner.Watch(filter);
	}

	/// <summary>
	/// Walks each component of <paramref name="subpath"/> from the root
	/// (derived from <paramref name="physicalPath"/>) downward and returns
	/// true if any directory component is a reparse point.
	/// </summary>
	private static bool HasReparsePointInPath(
		string physicalPath,
		string subpath
	) {
		if (string.IsNullOrEmpty(physicalPath) || string.IsNullOrEmpty(subpath)) {
			return false;
		}

		// The root path is everything in physicalPath before the subpath.
		var rootPath = physicalPath.Substring(
			0,
			physicalPath.Length - subpath.Length
		).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

		var parts = subpath.Split(
			['/', '\\'],
			StringSplitOptions.RemoveEmptyEntries
		);

		// Walk each prefix of the path, checking the directory at that level.
		// We check all components, including the final one.
		for (var i = 0; i < parts.Length; i++) {
			var partial = string.Join(
				Path.DirectorySeparatorChar.ToString(),
				parts.Take(i + 1)
			);
			var currentPath = string.IsNullOrEmpty(rootPath)
				? partial
				: Path.Combine(rootPath, partial);

			if (IsReparsePoint(currentPath)) {
				return true;
			}
		}

		return false;
	}

	private static bool IsReparsePoint(string physicalPath) {
		try {
			var attributes = File.GetAttributes(physicalPath);
			return (attributes & FileAttributes.ReparsePoint) != 0;
		} catch {
			// If we cannot stat the path (race with deletion, permission loss),
			// treat it as non-reparse so the inner provider's own existence
			// check decides. This avoids masking a genuine file due to a
			// transient error while never widening the served surface.
			return false;
		}
	}
}
