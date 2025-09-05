using MainApi.Src.Lib;
using MongoDB.Driver;

namespace MainApi.Src.Data.MongoDb;

public interface IAppCollection<T>
{
	Task<List<T>> FindAsync(FilterDefinition<T>? filter = null);
	Task InsertOneAsync(T document);
	Task<ReplaceOneResult> ReplaceOneAsync(FilterDefinition<T> filter, T replacement);
	Task<UpdateResult> UpdateOneAsync(FilterDefinition<T> filter, UpdateDefinition<T> update);
	Task<DeleteResult> DeleteOneAsync(FilterDefinition<T> filter);
}

public class AppCollection<T> : IAppCollection<T> where T : IEntity
{
	private readonly IMongoCollection<T> _inner;
	private readonly string? _tenantId;

	public AppCollection(IMongoDatabase db, TenantContext? tenantContext = null)
	{
		if (
				!typeof(T).IsAssignableTo(typeof(ITenantEntity))
				|| !typeof(T).IsAssignableTo(typeof(INoTenantEntity))
		)
		{
			throw new Exception($"Entity must implement {nameof(ITenantEntity)} or {nameof(INoTenantEntity)}");
		}

		var collectionName = typeof(T)
			.GetField(
					"CollectionName",
					System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static
				)?.GetValue(null) as string
				?? typeof(T).Name;
		_inner = db.GetCollection<T>(collectionName);
		_tenantId = tenantContext?.TenantId;
	}

	private FilterDefinition<T> WithTenant(FilterDefinition<T>? filter = null)
	{
		if (typeof(T).IsAssignableTo(typeof(ITenantEntity)) && _tenantId != null)
		{
			var tenantFilter = Builders<T>.Filter.Eq("tenantId", _tenantId);
			return filter == null ? tenantFilter : Builders<T>.Filter.And(tenantFilter, filter);
		}

		return filter ?? Builders<T>.Filter.Empty;
	}

	private UpdateDefinition<T> WithTenant(UpdateDefinition<T>? update = null)
	{
		if (typeof(T).IsAssignableTo(typeof(ITenantEntity)) && _tenantId != null)
		{
			var tenantEnforcement = Builders<T>.Update.Set("tenantId", _tenantId);
			return update == null ? tenantEnforcement : Builders<T>.Update.Combine(update, tenantEnforcement);
		}
		return update ?? Builders<T>.Update.Set("_id", "_id"); // Empty update that does nothing
	}

	public async Task<List<T>> FindAsync(FilterDefinition<T>? filter = null)
	{
		return await _inner.Find(WithTenant(filter)).ToListAsync();
	}

	public async Task InsertOneAsync(T document)
	{
		if (document is ITenantEntity tenantEntity && _tenantId != null)
		{
			tenantEntity.TenantId = _tenantId; // enforce tenant before insert
		}
		await _inner.InsertOneAsync(document);
	}

	public async Task<ReplaceOneResult> ReplaceOneAsync(FilterDefinition<T> filter, T replacement)
	{
		if (replacement is ITenantEntity tenantEntity && _tenantId != null)
		{
			tenantEntity.TenantId = _tenantId; // enforce on replacement too
		}
		return await _inner.ReplaceOneAsync(WithTenant(filter), replacement);
	}

	public async Task<UpdateResult> UpdateOneAsync(FilterDefinition<T> filter, UpdateDefinition<T> update)
	{
		return await _inner.UpdateOneAsync(WithTenant(filter), WithTenant(update));
	}

	public async Task<DeleteResult> DeleteOneAsync(FilterDefinition<T> filter)
	{
		return await _inner.DeleteOneAsync(WithTenant(filter));
	}
}
