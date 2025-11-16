namespace MainApi.Src.Lib;

/// <summary>
/// Standard cursor-based pagination result.
/// Includes total count for better UX (showing "X of Y" in tables).
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

	/// <summary>
	/// Total count of all items (across all pages).
	/// Used by frontend tables to show "Showing 1-20 of 150".
	/// </summary>
	public int TotalCount { get; set; }

	/// <summary>
	/// Number of items before the current page (offset).
	/// Used to calculate the current page number: CurrentPage = floor(CurrentOffset / Limit) + 1
	/// Example: If CurrentOffset = 40 and Limit = 20, then CurrentPage = 3
	/// </summary>
	public int CurrentOffset { get; set; }
}
