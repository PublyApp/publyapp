namespace MainApi.Src.Data.Repository;

using System.Linq.Expressions;

public interface IRepository<T> where T : class, IEntity
{
	Task<List<T>> FindAsync(Expression<Func<T, bool>>? filter = null);
	Task<T?> FindByIdAsync(Guid id);
	Task<T> InsertAsync(T entity);
	Task<T> UpdateAsync(T entity);
	Task DeleteAsync(Guid id);
	Task<bool> ExistsAsync(Expression<Func<T, bool>> filter);
}
