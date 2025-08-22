using MongoDB.Driver;

namespace MainApi.Src.Features.Common.Session;

public static class SessionIndexInitializer
{
	public static async Task EnsureIndexesAsync(IMongoDatabase database, ILogger logger)
    {
        var sessions = database.GetCollection<Session>(Session.CollectionName);

        // Execute all index creation tasks in parallel
        await Task.WhenAll(
            CreateUserIdIndex(sessions),
            CreateTokenIndex(sessions),
            CreateExpiresAtIndex(sessions)
        );

        logger.LogInformation("Created indexes on Session collection (userId, token, expiresAt)");
    }
    public static Task<string> CreateUserIdIndex(IMongoCollection<Session> sessions)
    {
        var userIdIndexKeys = Builders<Session>.IndexKeys.Ascending(s => s.UserId);
        var userIdIndexModel = new CreateIndexModel<Session>(userIdIndexKeys);
        return sessions.Indexes.CreateOneAsync(userIdIndexModel);
    }

    public static Task<string> CreateTokenIndex(IMongoCollection<Session> sessions)
    {
        var tokenIndexKeys = Builders<Session>.IndexKeys.Ascending(s => s.Token);
        var tokenIndexOptions = new CreateIndexOptions { Unique = true };
        var tokenIndexModel = new CreateIndexModel<Session>(tokenIndexKeys, tokenIndexOptions);
        return sessions.Indexes.CreateOneAsync(tokenIndexModel);
    }

    public static Task<string> CreateExpiresAtIndex(IMongoCollection<Session> sessions)
    {
        var expiresAtIndexKeys = Builders<Session>.IndexKeys.Ascending(s => s.ExpiresAt);
        var expiresAtIndexModel = new CreateIndexModel<Session>(expiresAtIndexKeys);
        return sessions.Indexes.CreateOneAsync(expiresAtIndexModel);
    }
}
