namespace MainApi.Src.Lib;

public class OffsetPaginatedResult<T> {
	public List<T> Data { get; set; } = [];
	public int Count { get; set; } = 0;
}
