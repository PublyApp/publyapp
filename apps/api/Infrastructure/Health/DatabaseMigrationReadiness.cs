using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Infrastructure.Health;

public interface IDatabaseMigrationReadiness {
	Task<bool> IsReadyAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Checks the database migration state through the application's configured DbContext.
/// A fresh scope ensures every probe uses the same provider and connection configuration
/// as normal application work.
/// </summary>
public sealed class DatabaseMigrationReadiness : IDatabaseMigrationReadiness {
	private readonly IServiceScopeFactory _scopeFactory;

	public DatabaseMigrationReadiness(IServiceScopeFactory scopeFactory) {
		_scopeFactory = scopeFactory;
	}

	public async Task<bool> IsReadyAsync(CancellationToken cancellationToken) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync(
			cancellationToken
		);

		return !pendingMigrations.Any();
	}
}
