using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Data;

/// <summary>
/// Extension methods for DbSet to provide audit tracking for bulk operations.
/// </summary>
public static class DbSetExtensions {
	// ==================== ExecuteSoftDelete (Sync) ====================

	/// <summary>
	/// Bulk soft delete with audit tracking (sets IsDeleted, DeletedAt, UpdatedAt).
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="source">The queryable to operate on</param>
	/// <returns>Number of rows affected</returns>
	public static int ExecuteSoftDelete<TEntity>(this IQueryable<TEntity> source)
			where TEntity : BaseAttributesNoKey {
		var now = DateTime.UtcNow;
		return source.ExecuteUpdate(setters => {
			setters.SetProperty(e => e.IsDeleted, true);
			setters.SetProperty(e => e.DeletedAt, now);
			setters.SetProperty(e => e.UpdatedAt, now);
		});
	}

	/// <summary>
	/// Bulk soft delete with audit tracking (sets IsDeleted, DeletedAt, UpdatedAt).
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="dbSet">The DbSet to operate on</param>
	/// <returns>Number of rows affected</returns>
	/// <example>
	/// <code>var deletedCount = context.User.ExecuteSoftDelete();</code>
	/// </example>
	public static int ExecuteSoftDelete<TEntity>(this DbSet<TEntity> dbSet)
			where TEntity : BaseAttributesNoKey {
		var now = DateTime.UtcNow;
		return dbSet.ExecuteUpdate(setters => {
			setters.SetProperty(e => e.IsDeleted, true);
			setters.SetProperty(e => e.DeletedAt, now);
			setters.SetProperty(e => e.UpdatedAt, now);
		});
	}

	// ==================== ExecuteSoftDeleteAsync (Async) ====================

	/// <summary>
	/// Bulk soft delete with audit tracking (sets IsDeleted, DeletedAt, UpdatedAt).
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="source">The queryable to operate on</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>Number of rows affected</returns>
	public static async Task<int> ExecuteSoftDeleteAsync<TEntity>(
			this IQueryable<TEntity> source,
			CancellationToken cancellationToken = default)
			where TEntity : BaseAttributesNoKey {
		var now = DateTime.UtcNow;
		return await source.ExecuteUpdateAsync(setters => {
			setters.SetProperty(e => e.IsDeleted, true);
			setters.SetProperty(e => e.DeletedAt, now);
			setters.SetProperty(e => e.UpdatedAt, now);
		}, cancellationToken);
	}

	/// <summary>
	/// Bulk soft delete with audit tracking (sets IsDeleted, DeletedAt, UpdatedAt).
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="dbSet">The DbSet to operate on</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>Number of rows affected</returns>
	/// <example>
	/// <code>var deletedCount = await context.User.ExecuteSoftDeleteAsync();</code>
	/// </example>
	public static async Task<int> ExecuteSoftDeleteAsync<TEntity>(
			this DbSet<TEntity> dbSet,
			CancellationToken cancellationToken = default)
			where TEntity : BaseAttributesNoKey {
		var now = DateTime.UtcNow;
		return await dbSet.ExecuteUpdateAsync(setters => {
			setters.SetProperty(e => e.IsDeleted, true);
			setters.SetProperty(e => e.DeletedAt, now);
			setters.SetProperty(e => e.UpdatedAt, now);
		}, cancellationToken);
	}
}
