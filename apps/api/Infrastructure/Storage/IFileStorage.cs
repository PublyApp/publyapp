namespace PublyApp.Api.Infrastructure.Storage;

public interface IFileStorage {
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
	/// Opens a readable stream for <paramref name="relativePath"/>, or <c>null</c>
	/// if no file exists at that path. Caller owns disposal of the returned stream.
	/// </summary>
	Task<Stream?> OpenReadAsync(
		string relativePath,
		CancellationToken cancellationToken = default);

	Task<bool> ExistsAsync(
		string relativePath,
		CancellationToken cancellationToken = default);

	Task DeleteAsync(
		string relativePath,
		CancellationToken cancellationToken = default);
}
