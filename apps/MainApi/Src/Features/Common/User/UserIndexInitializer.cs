using MongoDB.Driver;

namespace MainApi.Src.Features.Common.User;

public static class UserIndexInitializer
{
	public static Task<string> CreateEmailIndex(IMongoCollection<User> users)
	{
		var emailIndexKeys = Builders<User>.IndexKeys.Ascending(u => u.Email);
		var emailIndexOptions = new CreateIndexOptions { Unique = true };
		var emailIndexModel = new CreateIndexModel<User>(emailIndexKeys, emailIndexOptions);
		return users.Indexes.CreateOneAsync(emailIndexModel);
	}

	public static async Task EnsureIndexesAsync(IMongoDatabase database, ILogger logger)
	{
		var users = database.GetCollection<User>(User.CollectionName);
		await CreateEmailIndex(users);
		logger.LogInformation("Created unique email index on User collection");
	}
}
