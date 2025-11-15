using System.Data;
using System.Reflection;
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Permission;

/// <summary>
/// Seeds Permission entities in the database.
/// </summary>
public class PermissionSeeder : IEntitySeeder {
	private readonly ILogger<PermissionSeeder> _logger;

	public PermissionSeeder(ILogger<PermissionSeeder>? logger = null) {
		_logger = logger ?? CreateDefaultLogger();
	}

	private static ILogger<PermissionSeeder> CreateDefaultLogger() {
		using var loggerFactory = LoggerFactory.Create(builder => {
			builder.AddConsole();
		});
		return loggerFactory.CreateLogger<PermissionSeeder>();
	}

	public int Order => 10;

	public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		List<Permission> permissions = GetPermissionsPool();

		var existingKeysQuery =
			from p in dbContext.Permission
			select p.Key;

		var existingKeys = await existingKeysQuery.ToListAsync(cancellationToken);
		var newPermissions = permissions
			.Where(p => !existingKeys.Contains(p.Key))
			.ToList();

		if (newPermissions.Count == 0) {
			_logger.LogInformation("Permission seeding skipped; all permissions already exist.");
			return;
		}

		// Check if already in a transaction (e.g., during migrations)
		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Permission.AddRangeAsync(newPermissions, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				_logger.LogInformation("Seeded {Count} permissions.", newPermissions.Count);
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogWarning(ex, "Duplicate permissions detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			// Already in transaction (likely migration), just save changes
			try {
				await dbContext.Permission.AddRangeAsync(newPermissions, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				_logger.LogInformation("Seeded {Count} permissions.", newPermissions.Count);
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				_logger.LogWarning(ex, "Duplicate permissions detected during seeding; skipping insert.");
			}
		}
	}

	/// <summary>
	/// Extracts permission definitions from AppPermissions by reflecting over its scope and slice permissions.
	/// </summary>
	private static List<Permission> GetPermissionsPool() {
		var permissions = new List<Permission>();
		var appPermissionsType = typeof(AppPermissions);

		// Get all static properties of AppPermissions (Staff, Tenant, etc.)
		var scopeProperties = appPermissionsType.GetProperties(BindingFlags.Public | BindingFlags.Static);

		foreach (var scopeProperty in scopeProperties) {
			var scopeInstance = scopeProperty.GetValue(null);

			// Check if the instance implements IScopePermissions
			if (scopeInstance is not IScopePermissions) {
				continue;
			}

			var scopeType = scopeInstance.GetType();

			// Get all instance properties of the scope
			var sliceProperties = scopeType.GetProperties(BindingFlags.Public | BindingFlags.Instance);

			foreach (var sliceProperty in sliceProperties) {
				// Skip the KeyPrefix property
				if (sliceProperty.Name == nameof(IScopePermissions.KeyPrefix)) {
					continue;
				}

				var sliceInstance = sliceProperty.GetValue(scopeInstance);

				// Check if the instance implements ISlicePermissions
				if (sliceInstance is not ISlicePermissions) {
					continue;
				}

				var sliceType = sliceInstance.GetType();

				// Get all instance properties of the slice
				var permissionProperties = sliceType.GetProperties(BindingFlags.Public | BindingFlags.Instance);

				foreach (var permissionProperty in permissionProperties) {
					// Skip the KeyPrefix property
					if (permissionProperty.Name == nameof(ISlicePermissions.KeyPrefix)) {
						continue;
					}

					var permissionInstance = permissionProperty.GetValue(sliceInstance);

					// Check if the instance is a Permission
					if (permissionInstance is Permission permission) {
						permissions.Add(permission);
					}
				}
			}
		}

		return permissions;
	}
}

