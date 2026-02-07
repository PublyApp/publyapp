using System.Data;

using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Modules.Tenants.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Tenants.Seeders;

/// <summary>
/// Seeds Tenant entities in the database.
/// </summary>
public class TenantSeeder : IEntitySeeder {
	private readonly ILogger<TenantSeeder> _logger;

	public TenantSeeder(ILogger<TenantSeeder>? logger = null) {
		_logger = logger ?? CreateDefaultLogger();
	}

	private static ILogger<TenantSeeder> CreateDefaultLogger() {
		using var loggerFactory = LoggerFactory.Create(builder => {
			builder.AddConsole();
		});
		return loggerFactory.CreateLogger<TenantSeeder>();
	}

	public int Order => 20;

	public async Task SeedAsync(
		MainApiDbContext dbContext,
		CancellationToken cancellationToken = default
	) {
		var tenantsData = new List<(string Code, string Name, TenantStatus Status)> {
			(SeedConstants.Tenants.AcmeCode, SeedConstants.Tenants.AcmeName, TenantStatus.Active),
			(SeedConstants.Tenants.TechStartCode, SeedConstants.Tenants.TechStartName, TenantStatus.Active),
			(SeedConstants.Tenants.GlobalCode, SeedConstants.Tenants.GlobalName, TenantStatus.Active)
		};

		var tenantCodes = tenantsData.Select(td => td.Code).ToList();
		var existingTenantCodesQuery =
			from t in dbContext.Tenant
			where tenantCodes.Contains(t.Code)
			select t.Code;
		var existingTenantCodes = await existingTenantCodesQuery.ToListAsync(cancellationToken);

		var newTenants = tenantsData
			.Where(td => !existingTenantCodes.Contains(td.Code))
			.Select(td => new Tenant {
				Code = td.Code,
				Name = td.Name,
				Status = td.Status,
				MaxUsers = AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT
			})
			.ToList();

		if (newTenants.Count == 0) {
			_logger.LogInformation("Tenant seeding skipped; all tenants already exist.");
			return;
		}

		// Check if already in a transaction (e.g., during migrations)
		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Tenant.AddRangeAsync(newTenants, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded {Count} tenants.", newTenants.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				await transaction.RollbackAsync(cancellationToken);
				_logger.LogWarning(ex, "Duplicate tenants detected during seeding; skipping insert.");
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			// Already in transaction (likely migration), just save changes
			try {
				await dbContext.Tenant.AddRangeAsync(newTenants, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded {Count} tenants.", newTenants.Count);
				}
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				_logger.LogWarning(ex, "Duplicate tenants detected during seeding; skipping insert.");
			}
		}
	}
}
