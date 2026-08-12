using System.Text.RegularExpressions;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Local-disk implementation of <see cref="IFileStorage"/>, rooted at the
/// path passed to its constructor (the configured <c>FILE_STORAGE_ROOT</c> in
/// production; an isolated temp directory in tests). Registered via an
/// explicit factory in ServiceRegistration since DI cannot resolve the
/// primitive <c>rootPath</c> constructor parameter on its own. Saved paths
/// are always server-generated (UUID v7 file names under a year/month
/// folder) and the extension is validated against a strict allowlist
/// pattern, so callers never influence the on-disk layout;
/// <see cref="ResolveFullPath"/> also rejects any path that would resolve
/// outside the storage root, guarding the read/exists/delete paths against
/// traversal even if ever called with unexpected input.
/// </summary>
public sealed partial class LocalDiskFileStorage : IFileStorage {
	// Lowercase letters/digits only, 1-8 chars after the leading dot — rejects path
	// separators, traversal segments, and embedded NUL bytes in a caller-supplied extension.
	[GeneratedRegex(@"^\.[a-z0-9]{1,8}$")]
	private static partial Regex ExtensionPattern();

	private readonly string _rootPath;

	public string RootPath {
		get {
			return _rootPath;
		}
	}

	public LocalDiskFileStorage(string rootPath) {
		_rootPath = Path.GetFullPath(rootPath);
		Directory.CreateDirectory(_rootPath);
	}

	public async Task<string> SaveAsync(
		Stream content,
		string extension,
		CancellationToken cancellationToken = default
	) {
		if (string.IsNullOrWhiteSpace(extension) || !ExtensionPattern().IsMatch(extension)) {
			throw new ArgumentException(
				"Extension must match ^\\.[a-z0-9]{1,8}$",
				nameof(extension)
			);
		}

		var now = DateTime.UtcNow;
		var fileName = $"{Guid.CreateVersion7()}{extension}";
		var relativePath = string.Join(
			'/',
			"uploads",
			now.ToString("yyyy", System.Globalization.CultureInfo.InvariantCulture),
			now.ToString("MM", System.Globalization.CultureInfo.InvariantCulture),
			fileName
		);

		var fullPath = ResolveFullPath(relativePath);
		var directory = Path.GetDirectoryName(fullPath);
		if (directory is null) {
			throw new InvalidOperationException(
				$"Could not determine directory for resolved storage path '{fullPath}'."
			);
		}
		Directory.CreateDirectory(directory);

		try {
			await using var fileStream = new FileStream(
				fullPath,
				FileMode.CreateNew,
				FileAccess.Write,
				FileShare.None
			);
			await content.CopyToAsync(fileStream, cancellationToken);
		} catch (Exception exception) {
			var cleanupConfirmed = false;
			// The stream may be partially written (cancellation, a throwing source
			// stream, or a full disk) — never leave a partial, anonymously-served
			// blob behind. Best-effort: deletion failure must not mask the original.
			try {
				if (File.Exists(fullPath)) {
					File.Delete(fullPath);
				}
				cleanupConfirmed = !File.Exists(fullPath);
			} catch {
				// Best-effort cleanup only; the original exception is what matters.
			}
			throw new StorageWriteException(relativePath, cleanupConfirmed, exception);
		}

		return relativePath;
	}

	public Task<bool> DeleteAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	) {
		var fullPath = ResolveFullPath(relativePath);
		if (File.Exists(fullPath)) {
			File.Delete(fullPath);
		}
		return Task.FromResult(!File.Exists(fullPath));
	}

	private string ResolveFullPath(string relativePath) {
		var fullPath = Path.GetFullPath(Path.Combine(_rootPath, relativePath));
		var rootWithSeparator = _rootPath.EndsWith(Path.DirectorySeparatorChar)
			? _rootPath
			: _rootPath + Path.DirectorySeparatorChar;

		var isWithinRoot = fullPath.StartsWith(rootWithSeparator, StringComparison.Ordinal)
			|| string.Equals(fullPath, _rootPath, StringComparison.Ordinal);
		if (!isWithinRoot) {
			throw new InvalidOperationException(
				$"Resolved storage path '{fullPath}' escapes the storage root '{_rootPath}'."
			);
		}

		return fullPath;
	}
}
