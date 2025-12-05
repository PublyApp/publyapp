namespace MainApi.Src.Lib;

public class PaginatedResult<T> {
	public List<T> Data { get; set; } = [];
	public int Count { get; set; } = 0;
}
