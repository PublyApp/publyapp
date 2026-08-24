using System.Text.Json;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Jobs;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Profiles.Entities;

namespace PublyApp.Api.Lib.Diagnostics;

/// <summary>
/// Out-of-process seeding gate probe for the production security checks (design
/// seeding split §4). Runs in its own process so <see cref="AppEnvironment"/> can
/// be initialized as Production without mutating the parent test process.
/// </summary>
public static class SeederGateProbeCli {
	public const string VerifyArg = "--assert-production-seeds";

	public const string LinePrefix = "SEED_GATE_RESULT:";
	public const string EndMarker = "SEED_GATE_END";
	public const int SuccessExitCode = 0;

	/// <summary>
	/// Returns true iff args request the probe (command handled). On handling, writes a JSON
	/// payload with invariant assertions and exits with non-zero when the gate fails.
	/// </summary>
	public static bool TryRun(string[] args) {
		if (args.Length == 0
			|| !args[0].Equals(VerifyArg, StringComparison.Ordinal)) {
			return false;
		}

		return Run().GetAwaiter().GetResult();
	}

	private static async Task<bool> Run() {
		if (!AppEnvironment.IsProduction) {
			Console.Error.WriteLine("Seed gate probe is only valid when ASPNETCORE_ENVIRONMENT=Production.");
			Environment.ExitCode = 1;
			return true;
		}

		using var dbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(AppEnvironment.Instance.POSTGRES_CONNECTION_STRING)
				.Options
		);

		try {
			await dbContext.Database.MigrateAsync();
			await dbContext.Database.EnsureCreatedAsync();

			var expectedOwnerEmail = AppEnvironment.Instance.STAFF_OWNER_EMAIL
				.Trim()
				.ToLowerInvariant();

			var knownPasswordFixtureEmails = new[] {
				SeedConstants.Staff.AdminEmail,
				SeedConstants.Staff.UserEmail,
				SeedConstants.Tenants.AcmeAdminEmail,
				SeedConstants.Tenants.AcmeUserEmail,
				SeedConstants.Tenants.TechStartAdminEmail,
				SeedConstants.Tenants.TechStartUserEmail,
				SeedConstants.Tenants.GlobalAdminEmail,
				SeedConstants.Tenants.GlobalUserEmail,
				SeedConstants.CrossTenant.AliceEmail,
				SeedConstants.CrossTenant.BobEmail,
				SeedConstants.CrossTenant.CharlieEmail,
			};

			var seededPermissionCount = await dbContext
				.Permission
				.IgnoreQueryFilters()
				.CountAsync();

			var seededStaffOwnerProfileCount = await dbContext
				.Profile
				.IgnoreQueryFilters()
				.Where(profile =>
					profile.Scope == ProfileScope.Staff
					&& profile.Name == "Staff Owner"
				)
				.CountAsync();

			var seededJobKeys = await dbContext
				.SystemJobDefinition
				.IgnoreQueryFilters()
				.Where(definition =>
					!definition.IsDeleted
					&& definition.JobKey != null
				)
				.Select(definition => definition.JobKey)
				.ToListAsync();

			var hasOwnerUser = await dbContext
				.User
				.IgnoreQueryFilters()
				.AnyAsync(user => user.Email == expectedOwnerEmail);

			var hasOwnerAccount = await dbContext
				.UserAccount
				.IgnoreQueryFilters()
				.AnyAsync(ua => ua.User != null && ua.User.Email == expectedOwnerEmail);

			var ownerPasswordHash = await dbContext
				.User
				.IgnoreQueryFilters()
				.Where(user => user.Email == expectedOwnerEmail)
				.Select(user => user.Password)
				.SingleOrDefaultAsync(cancellationToken: default);

			var ownerPasswordMatchesCommittedSeed = ownerPasswordHash is not null
				&& PasswordUtils.VerifyPassword(SeedConstants.SeedPassword, ownerPasswordHash);

			var hasDemoTenants = await dbContext
				.Tenant
				.IgnoreQueryFilters()
				.AnyAsync(tenant =>
					tenant.Code == SeedConstants.Tenants.AcmeCode
					|| tenant.Code == SeedConstants.Tenants.TechStartCode
					|| tenant.Code == SeedConstants.Tenants.GlobalCode
				);

			var hasDemoUsers = await dbContext
				.User
				.IgnoreQueryFilters()
				.AnyAsync(user => knownPasswordFixtureEmails.Contains(user.Email));

			var missingJobKeys = new[] {
				CleanupExpiredSessionsHandler.JobKey,
				EmailLogRetentionHandler.JobKey,
				DeadLetterRetentionHandler.JobKey,
				EmailPreparedSendsRetentionHandler.JobKey,
				PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler.JobKey,
			}
			.Except(seededJobKeys)
			.ToList();

			var result = new {
				DemoSeedersExcluded = !hasDemoTenants && !hasDemoUsers,
				HasSeededPermissions = seededPermissionCount > 0,
				HasStaffOwnerProfile = seededStaffOwnerProfileCount > 0,
				HasSystemJobDefinitions = missingJobKeys.Count == 0,
				HasOwnerUser = hasOwnerUser,
				HasOwnerAccount = hasOwnerAccount,
				OwnerPasswordIsNotSeedPassword = !ownerPasswordMatchesCommittedSeed,
			};

			Console.Out.WriteLine($"{LinePrefix}{JsonSerializer.Serialize(result)}");
			Console.Out.WriteLine(EndMarker);

			Environment.ExitCode = result.DemoSeedersExcluded
				&& result.HasSeededPermissions
				&& result.HasStaffOwnerProfile
				&& result.HasSystemJobDefinitions
				&& result.HasOwnerUser
				&& result.HasOwnerAccount
				&& result.OwnerPasswordIsNotSeedPassword
				? SuccessExitCode
				: 1;

			return true;
		} catch (Exception ex) {
			Console.Error.WriteLine(ex.Message);
			Environment.ExitCode = 1;
			return true;
		}
	}
}
