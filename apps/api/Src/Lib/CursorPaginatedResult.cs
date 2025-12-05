namespace MainApi.Src.Lib;

/// <summary>
/// Standard cursor-based pagination result.
/// Does not include total count - cursor pagination is designed for infinite scroll
/// and Previous/Next navigation where total count is not needed.
/// </summary>
public class CursorPaginatedResult<T> {
	/// <summary>
	/// The data items for the current page.
	/// </summary>
	public List<T> Data { get; set; } = [];

	/// <summary>
	/// Cursor to fetch the next page. Null if this is the last page.
	/// </summary>
	public string? NextCursor { get; set; } = null;
}
