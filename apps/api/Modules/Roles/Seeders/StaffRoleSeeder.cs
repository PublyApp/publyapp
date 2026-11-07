using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Roles.Entities;

namespace PublyApp.Api.Modules.Roles.Seeders;

/// <summary>
/// Seeds foundational staff roles for runtime assignment.
/// </summary>
public class StaffRoleSeeder : IEntitySeeder {
	private readonly ILogger<StaffRoleSeeder> _Logger;

	public StaffRoleSeeder(ILogger<StaffRoleSeeder>? logger = null) {
		this._Logger = logger
			?? SeederLoggerUtils.CreateDefault<StaffRoleSeeder>();
	}

	public int Order {
		get {
			return 35;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		var roleStyleColumnsExist = await dbContext.Database
			.SqlQueryRaw<bool>(
				"""
				SELECT COUNT(*) = 2 AS "Value"
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'roles'
					AND column_name IN ('icon', 'tone')
				"""
			)
			.SingleAsync(cancellationToken);
		if (!roleStyleColumnsExist) {
			this._Logger.LogInformation(
				"Staff role seeding skipped; role style columns do not exist yet."
			);
			return;
		}

		var staffRoles = new List<(string Name, string Description, bool IsFullAccess)> {
			(SystemRoleNames.StaffFullAccess, "Platform owner with full system access", true),
			("Staff Admin", "Platform administrator with management access", false),
			("Staff Support", "Support team with limited access", false)
		};

		var roleNames = staffRoles.Select(p => p.Name).ToList();
		var existingRolesQuery =
			from p in dbContext.Role
			where roleNames.Contains(p.Name) && p.Scope == RoleScope.Staff
			select p;
		var existingRoles = await existingRolesQuery.ToListAsync(cancellationToken);
		var existingRoleNames = existingRoles.Select(p => p.Name).ToList();

		// Repair: an already-seeded "Staff Owner" may predate the is_full_access flag,
		// or have been created by an earlier seeder without it.
		var fullAccessRepaired = false;
		foreach (var existing in existingRoles) {
			if (staffRoles.Any(sp => sp.Name == existing.Name && sp.IsFullAccess)
				&& !existing.IsFullAccess) {
				existing.IsFullAccess = true;
				fullAccessRepaired = true;
			}
		}

		var newRoles = staffRoles
			.Where(sp => !existingRoleNames.Contains(sp.Name))
			.Select(sp => Role.CreateStaffRole(sp.Name, sp.Description, sp.IsFullAccess))
			.ToList();
		foreach (var role in newRoles) {
			role.ValidateRoleType();
		}

		if (newRoles.Count == 0 && !fullAccessRepaired) {
			this._Logger.LogInformation("Staff role seeding skipped; roles already exist.");
			return;
		}

		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Role.AddRangeAsync(newRoles, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded {Count} staff roles.", newRoles.Count);
				}
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			await dbContext.Role.AddRangeAsync(newRoles, cancellationToken);
			await dbContext.SaveChangesAsync(cancellationToken);
			if (this._Logger.IsEnabled(LogLevel.Information)) {
				this._Logger.LogInformation("Seeded {Count} staff roles.", newRoles.Count);
			}
		}
	}
}
