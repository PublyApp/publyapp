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
	private readonly ILogger<StaffProfileSeeder> _logger;

	public StaffProfileSeeder(ILogger<StaffProfileSeeder>? logger = null) {
		_logger = logger
			?? SeederLoggerUtils.CreateDefault<StaffProfileSeeder>();
	}

	public int Order {
		get {
			return 35;
		}
	}

	public async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) {
		var staffProfiles = new List<(string Name, string Description)> {
			("Staff Owner", "Platform owner with full system access"),
			("Staff Admin", "Platform administrator with management access"),
			("Staff Support", "Support team with limited access")
		};

		var profileNames = staffProfiles.Select(p => p.Name).ToList();
		var existingProfilesQuery =
			from p in dbContext.Profile
			where profileNames.Contains(p.Name) && p.Scope == ProfileScope.Staff
			select p.Name;
		var existingProfileNames = await existingProfilesQuery.ToListAsync(cancellationToken);

		var newProfiles = staffProfiles
			.Where(sp => !existingProfileNames.Contains(sp.Name))
			.Select(sp => Profile.CreateStaffProfile(sp.Name, sp.Description))
			.ToList();
		foreach (var profile in newProfiles) {
			profile.ValidateProfileType();
		}

		if (newProfiles.Count == 0) {
			_logger.LogInformation("Staff profile seeding skipped; profiles already exist.");
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
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation("Seeded {Count} staff profiles.", newProfiles.Count);
				}
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			await dbContext.Profile.AddRangeAsync(newProfiles, cancellationToken);
			await dbContext.SaveChangesAsync(cancellationToken);
			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation("Seeded {Count} staff profiles.", newProfiles.Count);
			}
		}
	}
}
