namespace MainApi.Src.Lib;

public class CursorPaginatedResult<T> {
	public List<T> Data { get; set; } = [];
	public string? NextCursor { get; set; } = null;
}
