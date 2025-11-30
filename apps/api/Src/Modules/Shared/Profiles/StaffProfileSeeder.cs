using System.Data;
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Shared.Profiles;

/// <summary>
/// Seeds foundational staff profiles for runtime assignment.
/// </summary>
public class StaffProfileSeeder : IEntitySeeder {
	private readonly ILogger<StaffProfileSeeder> _logger;

	public StaffProfileSeeder(ILogger<StaffProfileSeeder>? logger = null) {
		_logger = logger ?? CreateDefaultLogger();
	}

	private static ILogger<StaffProfileSeeder> CreateDefaultLogger() {
		using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
		return loggerFactory.CreateLogger<StaffProfileSeeder>();
	}

	public int Order => 35;

	public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
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
				_logger.LogInformation("Seeded {Count} staff profiles.", newProfiles.Count);
			} catch (Exception) {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		} else {
			await dbContext.Profile.AddRangeAsync(newProfiles, cancellationToken);
			await dbContext.SaveChangesAsync(cancellationToken);
			_logger.LogInformation("Seeded {Count} staff profiles.", newProfiles.Count);
		}
	}
}
