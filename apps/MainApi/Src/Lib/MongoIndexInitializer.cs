using Microsoft.Extensions.Hosting;
using MongoDB.Driver;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Tenant.Product;

namespace MainApi.Src.Lib;

public class MongoIndexesInitializer : IHostedService
{
    private readonly IMongoDatabase _database;
    private readonly ILogger<MongoIndexesInitializer> _logger;

    public MongoIndexesInitializer(IMongoDatabase database, ILogger<MongoIndexesInitializer> logger)
    {
        _database = database;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Starting MongoDB indexes initialization...");
            await EnsureIndexesAsync();
            _logger.LogInformation("MongoDB indexes initialization completed successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during MongoDB indexes initialization");
            throw;
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task EnsureIndexesAsync()
    {
        // Run all index creation operations in parallel
        await Task.WhenAll(
            UserIndexInitializer.EnsureIndexesAsync(_database, _logger),
            SessionIndexInitializer.EnsureIndexesAsync(_database, _logger),
            ProductIndexInitializer.EnsureIndexesAsync(_database, _logger)
        );
    }
}
