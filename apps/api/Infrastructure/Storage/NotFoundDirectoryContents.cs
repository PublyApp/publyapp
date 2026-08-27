using System.Collections;

using Microsoft.Extensions.FileProviders;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// A directory-contents implementation that reports no files, used to mask
/// reparse points from directory enumerations.
/// </summary>
internal sealed class NotFoundDirectoryContents : IDirectoryContents {
	public static readonly NotFoundDirectoryContents Instance = new();

	public bool Exists {
		get { return false; }
	}

	public IEnumerator<IFileInfo> GetEnumerator() {
		return Enumerable.Empty<IFileInfo>().GetEnumerator();
	}

	IEnumerator IEnumerable.GetEnumerator() {
		return GetEnumerator();
	}
}
