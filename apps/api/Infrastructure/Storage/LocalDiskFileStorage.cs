using PublyApp.Api.Lib;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Local-disk implementation of <see cref="IFileStorage"/>, rooted at
/// <see cref="AppEnvironment.FILE_STORAGE_ROOT"/>. Saved paths are always
/// server-generated (UUID v7 file names under a year/month folder) so callers
/// never influence the on-disk layout; <see cref="ResolveFullPath"/> also
/// rejects any path that would resolve outside the storage root, guarding
/// the read/exists/delete paths against traversal even if ever called with
/// unexpected input.
/// </summary>
public class LocalDiskFileStorage : IFileStorage {
	private readonly string _rootPath;

	public LocalDiskFileStorage() : this(AppEnvironment.Instance.FILE_STORAGE_ROOT) {
	}

	/// <summary>
	/// Explicit-root constructor, used by DI for the configured
	/// <see cref="AppEnvironment.FILE_STORAGE_ROOT"/> and by tests that need
	/// an isolated root without mutating the process-wide AppEnvironment singleton.
	/// </summary>
	public LocalDiskFileStorage(string rootPath) {
		_rootPath = Path.GetFullPath(rootPath);
		Directory.CreateDirectory(_rootPath);
	}

	public async Task<string> SaveAsync(
		Stream content,
		string extension,
		CancellationToken cancellationToken = default
	) {
		if (string.IsNullOrWhiteSpace(extension) || extension[0] != '.') {
			throw new ArgumentException(
				"Extension must be non-empty and start with '.'",
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

		await using var fileStream = new FileStream(
			fullPath,
			FileMode.CreateNew,
			FileAccess.Write,
			FileShare.None
		);
		await content.CopyToAsync(fileStream, cancellationToken);

		return relativePath;
	}

	public Task<Stream?> OpenReadAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	) {
		var fullPath = ResolveFullPath(relativePath);
		if (!File.Exists(fullPath)) {
			return Task.FromResult<Stream?>(null);
		}

		Stream stream = new FileStream(
			fullPath,
			FileMode.Open,
			FileAccess.Read,
			FileShare.Read
		);
		return Task.FromResult<Stream?>(stream);
	}

	public Task<bool> ExistsAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	) {
		return Task.FromResult(File.Exists(ResolveFullPath(relativePath)));
	}

	public Task DeleteAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	) {
		var fullPath = ResolveFullPath(relativePath);
		if (File.Exists(fullPath)) {
			File.Delete(fullPath);
		}
		return Task.CompletedTask;
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
