using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib.Filters;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Data;

internal record SeedUser(string Email, string Password, AccountHierarchyLevel Role);

internal class TenantSeedData {
	public Tenant Tenant { get; set; } = new() { Code = string.Empty, Name = string.Empty };
	public List<SeedUser> Users { get; set; } = [];
}

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
	/// Seeds all initial data into the database (asynchronous version).
	/// </summary>
	public static async Task SeedAllAsync(MainApiDbContext dbContext) {
		await SeedPermissionsAsync(dbContext);
		await SeedStaffTenantAsync(dbContext);
		// await SeedTenantsUsersAndAccountsAsync(dbContext);
	}

	private static async Task SeedPermissionsAsync(MainApiDbContext dbContext) {
		var permissions = GetPermissionsFromEnum();
		var existingKeys = await dbContext.Permission.Select(p => p.Key).ToListAsync();

		var newPermissions = permissions
			.Where(p => !existingKeys.Contains(p.Key))
			.ToList();

		if (newPermissions.Count != 0) {
			await dbContext.Permission.AddRangeAsync(newPermissions);
			await dbContext.SaveChangesAsync();
		}
	}

	private static async Task SeedStaffTenantAsync(MainApiDbContext dbContext) {
		if (!await dbContext.Tenant.AnyAsync(t => t.Code == "staff")) {
			await dbContext.Tenant.AddAsync(new Tenant { Code = "staff", Name = "Staff" });
			await dbContext.SaveChangesAsync();
		}

		// Seed a staff user too
		if (!await dbContext.User.AnyAsync(u => u.Email == "staff@example.com")) {
			var staffUser = new User {
				Email = "staff@example.com",
				Password = GetSeedPassword() // from config, not hardcoded
			};
			await dbContext.User.AddAsync(staffUser);
			await dbContext.SaveChangesAsync();
		}
	}

	// private static async Task SeedTenantsUsersAndAccountsAsync(MainApiDbContext dbContext) {
	// 	// Step 1: Get hashed password for all seeded users
	// 	// This ensures all users have the same secure password that can be verified
	// 	var seedPassword = GetSeedPassword();

	// 	// Step 2: Define the seed data structure
	// 	// Each TenantSeedData contains:
	// 	// - A Tenant entity (company/organization)
	// 	// - A list of SeedUser records with explicit roles (Admin/User)
	// 	// This structure makes it easy to add more tenants and users
	// 	var tenantData = new List<TenantSeedData> {
	// 		new TenantSeedData {
	// 			Tenant = new Tenant { Code = "example-company-a", Name = "Example Company A" },
	// 			Users = {
	// 				new SeedUser("admin-a@example.com", seedPassword, AccountHierarchyLevel.Admin),
	// 				new SeedUser("user-a@example.com", seedPassword, AccountHierarchyLevel.User)
	// 			}
	// 		},
	// 		new TenantSeedData {
	// 			Tenant = new Tenant { Code = "example-company-b", Name = "Example Company B" },
	// 			Users = {
	// 				new SeedUser("admin-b@example.com", seedPassword, AccountHierarchyLevel.Admin),
	// 				new SeedUser("user-b@example.com", seedPassword, AccountHierarchyLevel.User)
	// 			}
	// 		},
	// 		new TenantSeedData {
	// 			Tenant = new Tenant { Code = "example-company-c", Name = "Example Company C" },
	// 			Users = {
	// 				new SeedUser("admin-c@example.com", seedPassword, AccountHierarchyLevel.Admin),
	// 				new SeedUser("user-c@example.com", seedPassword, AccountHierarchyLevel.User)
	// 			}
	// 		}
	// 	};

	// 	// === STEP 3: SEED TENANTS ===
	// 	// Extract all tenant codes we want to create
	// 	var tenantCodes = tenantData.Select(td => td.Tenant.Code).ToList();

	// 	// Check which tenants already exist in the database (single query)
	// 	// This prevents duplicate tenant creation
	// 	var existingTenantCodes = await dbContext.Tenant
	// 		.Where(t => tenantCodes.Contains(t.Code))
	// 		.Select(t => t.Code)
	// 		.ToListAsync();

	// 	// Create new Tenant entities only for tenants that don't exist
	// 	// We create new Tenant objects to avoid EF tracking issues
	// 	var newTenants = tenantData
	// 		.Where(td => !existingTenantCodes.Contains(td.Tenant.Code))
	// 		.Select(td => new Tenant { Code = td.Tenant.Code, Name = td.Tenant.Name })
	// 		.ToList();

	// 	// Bulk insert new tenants if any exist
	// 	if (newTenants.Count != 0) {
	// 		await dbContext.Tenant.AddRangeAsync(newTenants);
	// 		await dbContext.SaveChangesAsync(); // Save to get the generated IDs
	// 	}

	// 	// === STEP 4: SEED USERS ===
	// 	// Extract all user emails from all tenants (flatten the nested structure)
	// 	var userEmails = tenantData.SelectMany(td => td.Users.Select(u => u.Email)).ToList();

	// 	// Check which users already exist in the database (single query)
	// 	// This prevents duplicate user creation
	// 	var existingUserEmails = await dbContext.User
	// 		.Where(u => userEmails.Contains(u.Email))
	// 		.Select(u => u.Email)
	// 		.ToListAsync();

	// 	// Create new User entities only for users that don't exist
	// 	// We flatten the tenant structure and filter out existing users
	// 	var newUsers = tenantData
	// 		.SelectMany(td => td.Users) // Flatten: [tenant1.users, tenant2.users, ...] -> [all users]
	// 		.Where(u => !existingUserEmails.Contains(u.Email)) // Only new users
	// 		.Select(u => new User { Email = u.Email, Password = u.Password }) // Create User entities
	// 		.ToList();

	// 	// Bulk insert new users if any exist
	// 	if (newUsers.Count != 0) {
	// 		await dbContext.User.AddRangeAsync(newUsers);
	// 		await dbContext.SaveChangesAsync(); // Save to get the generated IDs
	// 	}

	// 	// === STEP 5: CREATE USER ACCOUNTS (RELATIONSHIPS) ===
	// 	// Get all tenants (including staff) and convert to dictionary for fast lookup
	// 	// Dictionary key: tenant code, value: tenant ID
	// 	var allTenants = await dbContext.Tenant
	// 		.Where(t => tenantCodes.Contains(t.Code) || t.Code == "staff")
	// 		.ToDictionaryAsync(t => t.Code, t => t.Id);

	// 	// Get all users (including staff) and convert to dictionary for fast lookup
	// 	// Dictionary key: user email, value: user ID
	// 	var allUsers = await dbContext.User
	// 		.Where(u => userEmails.Contains(u.Email) || u.Email == "staff@example.com")
	// 		.ToDictionaryAsync(u => u.Email, u => u.Id);

	// 	// List to collect all UserAccount relationships we want to create
	// 	var desiredAccounts = new List<UserAccount>();

	// 	// Create staff account relationship
	// 	// Links the staff user to the staff tenant with admin privileges
	// 	if (allUsers.TryGetValue("staff@example.com", out var staffUserId) &&
	// 		allTenants.TryGetValue("staff", out var staffTenantId)) {
	// 		desiredAccounts.Add(new UserAccount {
	// 			UserId = staffUserId,
	// 			TenantId = staffTenantId,
	// 			AccountScope = AccountScope.Staff,
	// 			HierarchyLevel = AccountHierarchyLevel.Admin,
	// 			IsSuspended = false
	// 		});
	// 	}

	// 	// Create tenant account relationships
	// 	// For each tenant, create UserAccount records linking users to that tenant
	// 	foreach (var td in tenantData) {
	// 		if (allTenants.TryGetValue(td.Tenant.Code, out var tenantId)) {
	// 			foreach (var u in td.Users) {
	// 				if (allUsers.TryGetValue(u.Email, out var userId)) {
	// 					desiredAccounts.Add(new UserAccount {
	// 						UserId = userId,
	// 						TenantId = tenantId,
	// 						AccountScope = AccountScope.Tenant,
	// 						HierarchyLevel = u.Role, // Use explicit role from SeedUser
	// 						IsSuspended = false
	// 					});
	// 				}
	// 			}
	// 		}
	// 	}

	// 	// === STEP 6: PREVENT DUPLICATE USER ACCOUNTS ===
	// 	// Get all existing UserAccount relationships for our users and tenants
	// 	// We'll check against these to avoid duplicates
	// 	var existingUserAccounts = await dbContext.UserAccount
	// 		.Where(ua => allUsers.Values.Contains(ua.UserId) && allTenants.Values.Contains(ua.TenantId))
	// 		.Select(ua => new { ua.UserId, ua.TenantId })
	// 		.ToListAsync();

	// 	// Convert existing pairs to HashSet for fast O(1) lookup
	// 	var existingSet = new HashSet<(Guid, Guid)>(
	// 		existingUserAccounts.Select(p => (p.UserId, p.TenantId))
	// 	);

	// 	// Filter out UserAccounts that already exist
	// 	// Only keep relationships that don't exist in the database
	// 	var newAccounts = desiredAccounts
	// 		.Where(a => !existingSet.Contains((a.UserId, a.TenantId)))
	// 		.ToList();

	// 	// Bulk insert new UserAccount relationships if any exist
	// 	if (newAccounts.Count != 0) {
	// 		await dbContext.UserAccount.AddRangeAsync(newAccounts);
	// 		await dbContext.SaveChangesAsync();
	// 	}
	// }

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
