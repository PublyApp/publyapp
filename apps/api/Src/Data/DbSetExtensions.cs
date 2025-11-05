using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;

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
		return source.ExecuteUpdate(setters => setters
			.SetProperty(e => e.IsDeleted, true)
			.SetProperty(e => e.DeletedAt, now)
			.SetProperty(e => e.UpdatedAt, now));
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
		return dbSet.ExecuteUpdate(setters => setters
			.SetProperty(e => e.IsDeleted, true)
			.SetProperty(e => e.DeletedAt, now)
			.SetProperty(e => e.UpdatedAt, now));
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
		return await source.ExecuteUpdateAsync(setters => setters
			.SetProperty(e => e.IsDeleted, true)
			.SetProperty(e => e.DeletedAt, now)
			.SetProperty(e => e.UpdatedAt, now), cancellationToken);
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
		return await dbSet.ExecuteUpdateAsync(setters => setters
			.SetProperty(e => e.IsDeleted, true)
			.SetProperty(e => e.DeletedAt, now)
			.SetProperty(e => e.UpdatedAt, now), cancellationToken);
	}

	// ==================== ExecuteUpdateWithAudit (Sync) ====================

	/// <summary>
	/// Bulk update with automatic UpdatedAt tracking.
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="source">The queryable to operate on</param>
	/// <param name="setPropertyCalls">Function specifying which properties to update</param>
	/// <returns>Number of rows affected</returns>
	public static int ExecuteUpdateWithAudit<TEntity>(
			this IQueryable<TEntity> source,
			Func<SetPropertyCalls<TEntity>, SetPropertyCalls<TEntity>> setPropertyCalls)
			where TEntity : BaseAttributesNoKey {
		return source.ExecuteUpdate(setters =>
			setPropertyCalls(setters).SetProperty(e => e.UpdatedAt, DateTime.UtcNow));
	}

	/// <summary>
	/// Bulk update with automatic UpdatedAt tracking.
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="dbSet">The DbSet to operate on</param>
	/// <param name="setPropertyCalls">Function specifying which properties to update</param>
	/// <returns>Number of rows affected</returns>
	/// <example>
	/// <code>var updatedCount = context.User.ExecuteUpdateWithAudit(setters => setters.SetProperty(u => u.IsSuspended, true));</code>
	/// </example>
	public static int ExecuteUpdateWithAudit<TEntity>(
			this DbSet<TEntity> dbSet,
			Func<SetPropertyCalls<TEntity>, SetPropertyCalls<TEntity>> setPropertyCalls)
			where TEntity : BaseAttributesNoKey {
		return dbSet.ExecuteUpdate(setters =>
				setPropertyCalls(setters).SetProperty(e => e.UpdatedAt, DateTime.UtcNow));
	}

	// ==================== ExecuteUpdateWithAuditAsync (Async) ====================

	/// <summary>
	/// Bulk update with automatic UpdatedAt tracking.
	/// NOTE: This method only works when ALL properties to update are known at compile time.
	/// For conditional/partial updates (PATCH-style), manually add .SetProperty(e => e.UpdatedAt, DateTime.UtcNow)
	/// to your ExecuteUpdateAsync call with ternary operators (e.g., document.Field ?? entity.Field).
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="source">The queryable to operate on</param>
	/// <param name="setPropertyCalls">Function specifying which properties to update</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>Number of rows affected</returns>
	/// <example>
	/// <code>
	/// // Good: All properties known at compile time
	/// await query.ExecuteUpdateWithAuditAsync(setters => setters
	///     .SetProperty(u => u.Name, "John")
	///     .SetProperty(u => u.Email, "john@example.com"), cancellationToken);
	///
	/// // Bad: Conditional updates - use ExecuteUpdateAsync directly instead
	/// // await query.ExecuteUpdateAsync(setters => setters
	/// //     .SetProperty(u => u.Email, u => document.Email ?? u.Email)
	/// //     .SetProperty(u => u.UpdatedAt, DateTime.UtcNow), cancellationToken);
	/// </code>
	/// </example>
	public static async Task<int> ExecuteUpdateWithAuditAsync<TEntity>(
			this IQueryable<TEntity> source,
			Func<SetPropertyCalls<TEntity>, SetPropertyCalls<TEntity>> setPropertyCalls,
			CancellationToken cancellationToken = default)
			where TEntity : BaseAttributesNoKey {
		return await source.ExecuteUpdateAsync(
				setters => setPropertyCalls(setters).SetProperty(e => e.UpdatedAt, DateTime.UtcNow),
				cancellationToken
		);
	}

	/// <summary>
	/// Bulk update with automatic UpdatedAt tracking (DbSet overload).
	/// NOTE: This method only works when ALL properties to update are known at compile time.
	/// For conditional/partial updates (PATCH-style), manually add .SetProperty(e => e.UpdatedAt, DateTime.UtcNow)
	/// to your ExecuteUpdateAsync call with ternary operators.
	/// </summary>
	/// <typeparam name="TEntity">Entity type that inherits from BaseAttributesNoKey</typeparam>
	/// <param name="dbSet">The DbSet to operate on</param>
	/// <param name="setPropertyCalls">Function specifying which properties to update</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>Number of rows affected</returns>
	public static async Task<int> ExecuteUpdateWithAuditAsync<TEntity>(
			this DbSet<TEntity> dbSet,
			Func<SetPropertyCalls<TEntity>, SetPropertyCalls<TEntity>> setPropertyCalls,
			CancellationToken cancellationToken = default)
			where TEntity : BaseAttributesNoKey {
		return await dbSet.ExecuteUpdateAsync(
				setters => setPropertyCalls(setters).SetProperty(e => e.UpdatedAt, DateTime.UtcNow),
				cancellationToken
		);
	}
}
