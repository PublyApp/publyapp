using System.Data;
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Filters;
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
		var permissions = GetPermissionsFromEnum();

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
	/// Extracts permission definitions from the associated enums.
	/// </summary>
	private static List<Permission> GetPermissionsFromEnum() {
		var staffEnumType = typeof(PermissionEnum.Staff);
		var tenantEnumType = typeof(PermissionEnum.Tenant);
		var staffFields = staffEnumType.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
		var tenantFields = tenantEnumType.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);

		return staffFields
			.Concat(tenantFields)
			.Where(f => f.FieldType == typeof(Permission))
			.Select(f => (Permission)f.GetValue(null)!)
			.ToList();
	}
}

