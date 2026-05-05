namespace MainApi.Src.Lib;

// Note: XML comments removed to work around .NET 10 OpenAPI source generator bug
// that causes duplicate key errors for generic types.
// See: https://github.com/dotnet/aspnetcore/issues/63233
#pragma warning disable CS1591 // Missing XML comment for publicly visible type or member
public class CursorPaginatedResult<T> {
	public List<T> Data { get; set; } = [];

	public string? NextCursor { get; set; } = null;
}
#pragma warning restore CS1591
