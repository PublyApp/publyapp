namespace MainApi.Src.Lib;

public sealed class CursorSortFieldHandler<TEntity>(
	Func<Guid, Task<object?>> getCursorValue,
	Func<IQueryable<TEntity>, object?, bool, IQueryable<TEntity>> applyFilter,
	Func<IQueryable<TEntity>, bool, IQueryable<TEntity>> applyOrdering
) {
	public Func<Guid, Task<object?>> GetCursorValue { get; } = getCursorValue;

	public Func<IQueryable<TEntity>, object?, bool, IQueryable<TEntity>>
		ApplyFilter { get; } = applyFilter;

	public Func<IQueryable<TEntity>, bool, IQueryable<TEntity>>
		ApplyOrdering { get; } = applyOrdering;
}
