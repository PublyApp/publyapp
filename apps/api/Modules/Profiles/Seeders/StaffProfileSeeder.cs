using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Profiles.Entities;

namespace PublyApp.Api.Modules.Profiles.Seeders;

/// <summary>
/// Seeds foundational staff profiles for runtime assignment.
/// </summary>
public class StaffProfileSeeder : IEntitySeeder {
	private readonly ILogger<StaffProfileSeeder> _Logger;

	public StaffProfileSeeder(ILogger<StaffProfileSeeder>? logger = null) {
		this._Logger = logger
			?? SeederLoggerUtils.CreateDefault<StaffProfileSeeder>();
	}

	public int Order {
		get {
			return 35;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		var profileStyleColumnsExist = await dbContext.Database
			.SqlQueryRaw<bool>(
				"""
				SELECT COUNT(*) = 2 AS "Value"
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'profiles'
					AND column_name IN ('icon', 'tone')
				"""
			)
			.SingleAsync(cancellationToken);
		if (!profileStyleColumnsExist) {
			this._Logger.LogInformation(
				"Staff profile seeding skipped; profile style columns do not exist yet."
			);
			return;
		}

		var staffProfiles = new List<(string Name, string Description, bool IsFullAccess)> {
			(SystemProfileNames.StaffFullAccess, "Platform owner with full system access", true),
			("Staff Admin", "Platform administrator with management access", false),
			("Staff Support", "Support team with limited access", false)
		};

		var profileNames = staffProfiles.Select(p => p.Name).ToList();
		var existingProfilesQuery =
			from p in dbContext.Profile
			where profileNames.Contains(p.Name) && p.Scope == ProfileScope.Staff
			select p;
		var existingProfiles = await existingProfilesQuery.ToListAsync(cancellationToken);
		var existingProfileNames = existingProfiles.Select(p => p.Name).ToList();

		// Repair: an already-seeded "Staff Owner" may predate the is_full_access flag,
		// or have been created by an earlier seeder without it.
		var fullAccessRepaired = false;
		foreach (var existing in existingProfiles) {
			if (staffProfiles.Any(sp => sp.Name == existing.Name && sp.IsFullAccess)
				&& !existing.IsFullAccess) {
				existing.IsFullAccess = true;
				fullAccessRepaired = true;
			}
		}

		var newProfiles = staffProfiles
			.Where(sp => !existingProfileNames.Contains(sp.Name))
			.Select(sp => Profile.CreateStaffProfile(sp.Name, sp.Description, sp.IsFullAccess))
			.ToList();
		foreach (var profile in newProfiles) {
			profile.ValidateProfileType();
		}

		if (newProfiles.Count == 0 && !fullAccessRepaired) {
			this._Logger.LogInformation("Staff profile seeding skipped; profiles already exist.");
			return;
		}

		var existingTransaction = dbContext.Database.CurrentTransaction;
		var shouldManageTransaction = existingTransaction is null;

		if (shouldManageTransaction) {
			await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
			try {
				await dbContext.Profile.AddRangeAsync(newProfiles, cancellationToken);
				await dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				if (this._Logger.IsEnabled(LogLevel.Information)) {
					this._Logger.LogInformation("Seeded {Count} staff profiles.", newProfiles.Count);
				}
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			await dbContext.Profile.AddRangeAsync(newProfiles, cancellationToken);
			await dbContext.SaveChangesAsync(cancellationToken);
			if (this._Logger.IsEnabled(LogLevel.Information)) {
				this._Logger.LogInformation("Seeded {Count} staff profiles.", newProfiles.Count);
			}
		}
	}
}
