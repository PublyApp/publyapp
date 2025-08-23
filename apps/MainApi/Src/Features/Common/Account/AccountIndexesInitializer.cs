using MongoDB.Driver;

namespace MainApi.Src.Features.Common.Account;

public static class UserAccountStaffIndexesInitializer
{
	public static Task<string> CreateUserIdIndex(IMongoCollection<UserAccountStaff> userAccountStaffs)
	{
		var userIdIndexKeys = Builders<UserAccountStaff>.IndexKeys.Ascending(u => u.UserId);
		var userIdIndexOptions = new CreateIndexOptions { Unique = true };
		var userIdIndexModel = new CreateIndexModel<UserAccountStaff>(userIdIndexKeys, userIdIndexOptions);
		return userAccountStaffs.Indexes.CreateOneAsync(userIdIndexModel);
	}

	public static async Task EnsureIndexesAsync(IMongoDatabase database, ILogger logger)
	{
		var userAccountStaffs = database.GetCollection<UserAccountStaff>(UserAccountStaff.CollectionName);
		await CreateUserIdIndex(userAccountStaffs);
		logger.LogInformation("Created unique userId index on UserAccountStaff collection");
	}
}

public static class UserAccountTenantIndexesInitializer
{
	public static Task<string> CreateUserIdTenantIdCompoundIndex(IMongoCollection<UserAccountTenant> userAccountTenants)
	{
		var compoundIndexKeys = Builders<UserAccountTenant>.IndexKeys
			.Ascending(u => u.UserId)
			.Ascending(u => u.TenantId);
		var compoundIndexOptions = new CreateIndexOptions { Unique = true };
		var compoundIndexModel = new CreateIndexModel<UserAccountTenant>(compoundIndexKeys, compoundIndexOptions);
		return userAccountTenants.Indexes.CreateOneAsync(compoundIndexModel);
	}

	public static async Task EnsureIndexesAsync(IMongoDatabase database, ILogger logger)
	{
		var userAccountTenants = database.GetCollection<UserAccountTenant>(UserAccountTenant.CollectionName);
		await CreateUserIdTenantIdCompoundIndex(userAccountTenants);
		logger.LogInformation("Created unique compound index on UserAccountTenant collection (userId, tenantId)");
	}
}
