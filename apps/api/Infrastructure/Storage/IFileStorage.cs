namespace PublyApp.Api.Infrastructure.Storage;

public interface IFileStorage {
	/// <summary>
	/// The absolute filesystem path this storage is rooted at. Used by the
	/// composition root to point the static-file serving middleware at the
	/// same directory this storage writes to, without recomputing it.
	/// </summary>
	string RootPath { get; }

	/// <summary>
	/// Saves <paramref name="content"/> under a server-generated, collision-free
	/// path and returns that path relative to the storage root
	/// (e.g. <c>uploads/2026/07/&lt;uuid-v7&gt;.png</c>).
	/// </summary>
	Task<string> SaveAsync(
		Stream content,
		string extension,
		CancellationToken cancellationToken = default);

	/// <summary>
	/// Reads the whole file at <paramref name="relativePath"/>, or returns null
	/// when it does not exist. Used by publishing to resolve stored image bytes.
	/// </summary>
	Task<byte[]?> ReadAsync(
		string relativePath,
		CancellationToken cancellationToken = default);

	/// <summary>
	/// Deletes the file at <paramref name="relativePath"/> if it exists; a no-op
	/// otherwise. Used to remove a previously-served upload blob when it is
	/// replaced or its owning entity is deleted.
	/// </summary>
	Task<bool> DeleteAsync(
		string relativePath,
		CancellationToken cancellationToken = default);
}

public sealed class StorageWriteException : InvalidOperationException {
	public StorageWriteException(
		string relativePath,
		bool cleanupConfirmed,
		Exception innerException
	) : base("The upload could not be written safely.", innerException) {
		this.RelativePath = relativePath;
		this.CleanupConfirmed = cleanupConfirmed;
	}

	public string RelativePath { get; }

	public bool CleanupConfirmed { get; }
}
