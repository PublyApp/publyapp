namespace MainApi.Src.Data.Repository;

using System.Linq.Expressions;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

public class Repository<T> : IRepository<T> where T : class, IEntity
{
	private readonly MainApiDbContext _context;
	private readonly DbSet<T> _dbSet;

	public Repository(MainApiDbContext context)
	{
		_context = context;
		_dbSet = context.Set<T>();
	}

	public async Task<List<T>> FindAsync(Expression<Func<T, bool>>? filter = null)
	{
		var query = _dbSet.AsQueryable();

		if (filter != null)
		{
			query = query.Where(filter);
		}

		return await query.ToListAsync();
	}

	public async Task<T?> FindByIdAsync(Guid id)
	{
		return await _dbSet.FindAsync(id);
	}

	public async Task<T> InsertAsync(T entity)
	{
		_dbSet.Add(entity);
		await _context.SaveChangesAsync();
		return entity;
	}

	public async Task<T> UpdateAsync(T entity)
	{
		_dbSet.Update(entity);
		await _context.SaveChangesAsync();
		return entity;
	}

	public async Task DeleteAsync(Guid id)
	{
		var entity = await FindByIdAsync(id);
		if (entity != null)
		{
			_dbSet.Remove(entity);
			await _context.SaveChangesAsync();
		}
	}

	public async Task<bool> ExistsAsync(Expression<Func<T, bool>> filter)
	{
		return await _dbSet.AnyAsync(filter);
	}
}
