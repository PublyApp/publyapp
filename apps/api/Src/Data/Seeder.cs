using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib.Filters;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Data;

/// <summary>
/// Handles database seeding operations for the application.
/// </summary>
public static class Seeder {
	/// <summary>
	/// Seeds all initial data into the database (synchronous version).
	/// </summary>
	public static void SeedAll(MainApiDbContext dbContext) {
		SeedAllAsync(dbContext).GetAwaiter().GetResult();
	}

	/// <summary>
	/// Seeds only base entities that don't require relations.
	/// Base entities: Permission, User, Tenant
	/// </summary>
	public static async Task SeedAllAsync(MainApiDbContext dbContext) {
		await SeedPermissionsAsync(dbContext);
		await SeedUsersAsync(dbContext);
		await SeedTenantsAsync(dbContext);
	}

	private static async Task SeedPermissionsAsync(MainApiDbContext dbContext) {
		var permissions = GetPermissionsFromEnum();
		var existingKeysQuery =
			from p in dbContext.Permission
			select p.Key;
		var existingKeys = await existingKeysQuery.ToListAsync();

		var newPermissions = permissions
			.Where(p => !existingKeys.Contains(p.Key))
			.ToList();

		if (newPermissions.Count != 0) {
			try {
				await dbContext.Permission.AddRangeAsync(newPermissions);
				await dbContext.SaveChangesAsync();
			} catch (Microsoft.EntityFrameworkCore.DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				Console.WriteLine($"Skipping duplicate permissions: {ex.Message}");
			}
		}
	}

	private static async Task SeedUsersAsync(MainApiDbContext dbContext) {
		var seedPassword = GetSeedPassword();

		// Seed all users (staff and tenant users)
		var allUsers = new List<(string Email, UserStatus Status, string? FirstName, string? LastName)> {
			// Staff users
			("staff-admin@example.com", UserStatus.Active, "Staff", "Admin"),
			("staff-user@example.com", UserStatus.Active, "Staff", "User"),
			// Tenant users
			("admin-acme@example.com", UserStatus.Active, "Admin", "Acme"),
			("user-acme@example.com", UserStatus.Active, "User", "Acme"),
			("admin-techstart@example.com", UserStatus.Active, "Admin", "TechStart"),
			("user-techstart@example.com", UserStatus.Active, "User", "TechStart"),
			("admin-global@example.com", UserStatus.Active, "Admin", "Global"),
			("user-global@example.com", UserStatus.Active, "User", "Global"),
			// Cross-tenant users
			("alice@example.com", UserStatus.Active, "Alice", "Example"),
			("bob@example.com", UserStatus.Active, "Bob", "Example"),
			("charlie@example.com", UserStatus.Active, "Charlie", "Example")
		};

		var existingUserEmailsQuery =
			from u in dbContext.User
			where allUsers.Select(au => au.Email).Contains(u.Email)
			select u.Email;
		var existingUserEmails = await existingUserEmailsQuery.ToListAsync();

		var newUsers = allUsers
			.Where(au => !existingUserEmails.Contains(au.Email))
			.Select(au => new User {
				Email = au.Email,
				Password = seedPassword,
				Status = au.Status,
				FirstName = au.FirstName,
				LastName = au.LastName,
				IsVerified = true
			})
			.ToList();

		if (newUsers.Count != 0) {
			try {
				await dbContext.User.AddRangeAsync(newUsers);
				await dbContext.SaveChangesAsync();
			} catch (Microsoft.EntityFrameworkCore.DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				Console.WriteLine($"Skipping duplicate users: {ex.Message}");
			}
		}
	}

	private static async Task SeedTenantsAsync(MainApiDbContext dbContext) {
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
		var existingTenantCodes = await existingTenantCodesQuery.ToListAsync();

		var newTenants = tenantsData
			.Where(td => !existingTenantCodes.Contains(td.Code))
			.Select(td => new Tenant {
				Code = td.Code,
				Name = td.Name,
				Status = td.Status
			})
			.ToList();

		if (newTenants.Count != 0) {
			try {
				await dbContext.Tenant.AddRangeAsync(newTenants);
				await dbContext.SaveChangesAsync();
			} catch (Microsoft.EntityFrameworkCore.DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505") {
				Console.WriteLine($"Skipping duplicate tenants: {ex.Message}");
			}
		}
	}

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

	private static string GetSeedPassword() {
		var passwordService = new PasswordService();
		return passwordService.HashPassword("ChangeMe123!@3#lol");
	}
}
