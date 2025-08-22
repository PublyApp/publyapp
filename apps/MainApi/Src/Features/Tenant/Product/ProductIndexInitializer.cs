using MongoDB.Driver;

namespace MainApi.Src.Features.Tenant.Product;

public static class ProductIndexInitializer
{
	public static Task<string> CreateNameIndex(IMongoCollection<Product> products)
	{
		var nameIndexKeys = Builders<Product>.IndexKeys.Ascending(p => p.Name);
		var nameIndexModel = new CreateIndexModel<Product>(nameIndexKeys);
		return products.Indexes.CreateOneAsync(nameIndexModel);
	}

	public static Task<string> CreateTenantIdIndex(IMongoCollection<Product> products)
	{
		var tenantIdIndexKeys = Builders<Product>.IndexKeys.Ascending(p => p.TenantId);
		var tenantIdIndexModel = new CreateIndexModel<Product>(tenantIdIndexKeys);
		return products.Indexes.CreateOneAsync(tenantIdIndexModel);
	}

	public static Task<string> CreateCompoundIndex(IMongoCollection<Product> products)
	{
		var compoundIndexKeys = Builders<Product>.IndexKeys.Combine(
				Builders<Product>.IndexKeys.Ascending(p => p.TenantId),
				Builders<Product>.IndexKeys.Ascending(p => p.Name)
		);
		var compoundIndexModel = new CreateIndexModel<Product>(compoundIndexKeys);
		return products.Indexes.CreateOneAsync(compoundIndexModel);
	}

	public static async Task EnsureIndexesAsync(IMongoDatabase database, ILogger logger)
	{
		var products = database.GetCollection<Product>("Product");

		// Execute all index creation tasks in parallel
		await Task.WhenAll(
				CreateNameIndex(products),
				CreateTenantIdIndex(products),
				CreateCompoundIndex(products)
		);

		logger.LogInformation("Created indexes on Product collection (name, tenantId, compound)");
	}
}
