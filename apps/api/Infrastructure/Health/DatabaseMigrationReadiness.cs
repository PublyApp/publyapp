using System.Text;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Infrastructure.Health;

public interface IDatabaseMigrationReadiness {
	Task<DatabaseMigrationReadinessResult> IsReadyAsync(CancellationToken cancellationToken);
}

public sealed class DatabaseMigrationReadinessResult {
	public const int MaxPendingMigrationNames = 5;
	public const int MaxPendingMigrationNameLength = 128;

	public int PendingMigrationCount { get; }
	public IReadOnlyList<string> PendingMigrationNames { get; }
	public bool PendingMigrationNamesTruncated { get; }
	public bool IsReady {
		get { return PendingMigrationCount == 0; }
	}

	private DatabaseMigrationReadinessResult(
		int pendingMigrationCount,
		IReadOnlyList<string> pendingMigrationNames
	) {
		PendingMigrationCount = pendingMigrationCount;
		PendingMigrationNames = pendingMigrationNames;
		PendingMigrationNamesTruncated = pendingMigrationCount > pendingMigrationNames.Count;
	}

	public static DatabaseMigrationReadinessResult FromPendingMigrations(
		IEnumerable<string> pendingMigrations
	) {
		if (pendingMigrations is null) {
			throw new ArgumentNullException(nameof(pendingMigrations));
		}

		var pendingMigrationNames = new List<string>(MaxPendingMigrationNames);
		var pendingMigrationCount = 0;
		foreach (var migrationName in pendingMigrations) {
			pendingMigrationCount++;
			if (pendingMigrationNames.Count < MaxPendingMigrationNames) {
				pendingMigrationNames.Add(SanitizeMigrationName(migrationName));
			}
		}

		return new DatabaseMigrationReadinessResult(
			pendingMigrationCount,
			pendingMigrationNames.ToArray()
		);
	}

	private static string SanitizeMigrationName(string migrationName) {
		if (migrationName is null) {
			return "[unnamed migration]";
		}

		var safeName = new StringBuilder(
			Math.Min(migrationName.Length, MaxPendingMigrationNameLength)
		);
		foreach (var character in migrationName) {
			if (safeName.Length == MaxPendingMigrationNameLength) {
				break;
			}

			safeName.Append(char.IsControl(character) ? ' ' : character);
		}

		return safeName.ToString();
	}
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

	public async Task<DatabaseMigrationReadinessResult> IsReadyAsync(
		CancellationToken cancellationToken
	) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync(
			cancellationToken
		);

		return DatabaseMigrationReadinessResult.FromPendingMigrations(pendingMigrations);
	}
}
