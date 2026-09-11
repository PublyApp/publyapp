using System.Collections;

using Microsoft.Extensions.FileProviders;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Wraps a filtered list of <see cref="IFileInfo"/> entries for directory
/// enumeration, excluding reparse points. Used by
/// <see cref="ReparsePointExclusionFileProvider"/>.
/// </summary>
internal sealed class FilterableDirectoryContents : IDirectoryContents {
	private readonly IReadOnlyList<IFileInfo> _Entries;

	public FilterableDirectoryContents(IReadOnlyList<IFileInfo> entries) {
		_Entries = entries;
	}

	public bool Exists {
		get { return true; }
	}

	public IEnumerator<IFileInfo> GetEnumerator() {
		return _Entries.GetEnumerator();
	}

	IEnumerator IEnumerable.GetEnumerator() {
		return GetEnumerator();
	}
}
