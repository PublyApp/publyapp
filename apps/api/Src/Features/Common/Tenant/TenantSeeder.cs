using System.Data;
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Tenant;

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

	public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
		var tenantsData = new List<(string Code, string Name, TenantStatus Status)> {
			("acme-corp", "Acme Corporation", TenantStatus.Active),
			("techstart-inc", "TechStart Inc", TenantStatus.Active),
			("global-solutions", "Global Solutions", TenantStatus.Active)
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
				Status = td.Status
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
				_logger.LogInformation("Seeded {Count} tenants.", newTenants.Count);
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
				_logger.LogInformation("Seeded {Count} tenants.", newTenants.Count);
			} catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				_logger.LogWarning(ex, "Duplicate tenants detected during seeding; skipping insert.");
			}
		}
	}
}

