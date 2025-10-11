using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Common.Project;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Lib.Filters;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Data;

internal record SeedUser(string Email, string Password, AccountLevel Level);

internal class TenantSeedData {
	public Tenant Tenant { get; set; } = new() { Code = string.Empty, Name = string.Empty };
	public List<Project> Projects { get; set; } = [];
	public List<SeedUser> Users { get; set; } = [];
}

internal record CrossTenantUser(string Email, List<string> TenantCodes);

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
		await SeedStaffUsersAsync(dbContext);
		await SeedTenantsProjectsAndUsersAsync(dbContext);
		await SeedProfilesAndPermissionsAsync(dbContext);
		await SeedUserAccountProfilesAsync(dbContext);
	}

	private static async Task SeedPermissionsAsync(MainApiDbContext dbContext) {
		var permissions = GetPermissionsFromEnum();
		var existingKeysQuery = from p in dbContext.Permission
														select p.Key;
		var existingKeys = await existingKeysQuery.ToListAsync();

		var newPermissions = permissions
			.Where(p => !existingKeys.Contains(p.Key))
			.ToList();

		if (newPermissions.Count != 0) {
			await dbContext.Permission.AddRangeAsync(newPermissions);
			await dbContext.SaveChangesAsync();
		}
	}

	private static async Task SeedStaffUsersAsync(MainApiDbContext dbContext) {
		var seedPassword = GetSeedPassword();

		// No longer creating a special 'staff' tenant; staff accounts are global (TenantId = null)

		// Seed staff users
		var staffUsers = new List<(string Email, AccountLevel Level)> {
			("staff-admin@example.com", AccountLevel.Admin),
			("staff-user@example.com", AccountLevel.User)
		};

		var existingStaffEmailsQuery = from u in dbContext.User
																	 where staffUsers.Select(su => su.Email).Contains(u.Email)
																	 select u.Email;
		var existingStaffEmails = await existingStaffEmailsQuery.ToListAsync();

		var newStaffUsers = staffUsers
			.Where(su => !existingStaffEmails.Contains(su.Email))
			.Select(su => new User {
				Email = su.Email,
				Password = seedPassword,
				Status = UserStatus.Active,
				IsVerified = true
			})
			.ToList();

		if (newStaffUsers.Count != 0) {
			await dbContext.User.AddRangeAsync(newStaffUsers);
			await dbContext.SaveChangesAsync();
		}

		// Create staff user accounts
		var allStaffUsersQuery = from u in dbContext.User
														 where staffUsers.Select(su => su.Email).Contains(u.Email)
														 select u;
		var allStaffUsers = await allStaffUsersQuery.ToDictionaryAsync(u => u.Email, u => u.GetRequiredId());

		var desiredStaffAccounts = new List<UserAccount>();
		foreach (var (email, level) in staffUsers) {
			if (allStaffUsers.TryGetValue(email, out var userId)) {
				var staffAccount = UserAccount.CreateStaffAccount(userId);
				staffAccount.Level = level;
				staffAccount.IsSuspended = false;
				desiredStaffAccounts.Add(staffAccount);
			}
		}

		var existingStaffAccountsQuery = from ua in dbContext.UserAccount
																		 where ua.TenantId == null && ua.AccountScope == AccountScope.Staff
																		 select new { ua.UserId };
		var existingStaffAccounts = await existingStaffAccountsQuery.ToListAsync();

		var existingStaffUserIds = new HashSet<Guid>(
			existingStaffAccounts.Select(p => p.UserId)
		);

		var newStaffAccounts = desiredStaffAccounts
			.Where(a => !existingStaffUserIds.Contains(a.UserId))
			.ToList();

		if (newStaffAccounts.Count != 0) {
			await dbContext.UserAccount.AddRangeAsync(newStaffAccounts);
			await dbContext.SaveChangesAsync();
		}
	}

	private static async Task SeedTenantsProjectsAndUsersAsync(MainApiDbContext dbContext) {
		var seedPassword = GetSeedPassword();

		var tenantData = new List<TenantSeedData> {
			new TenantSeedData {
				Tenant = new Tenant { Code = "acme-corp", Name = "Acme Corporation" },
								Projects = [
										new Project { Name = "Marketing Campaign 2024", TenantId = Guid.Empty, IsActive = true },
										new Project { Name = "Product Launch", TenantId = Guid.Empty, IsActive = true }
								],
				Users = [
					new SeedUser("admin-acme@example.com", seedPassword, AccountLevel.Admin),
					new SeedUser("user-acme@example.com", seedPassword, AccountLevel.User)
				]
			},
			new TenantSeedData {
				Tenant = new Tenant { Code = "techstart-inc", Name = "TechStart Inc" },
								Projects = [
										new Project { Name = "Mobile App", TenantId = Guid.Empty, IsActive = true },
										new Project { Name = "Web Platform", TenantId = Guid.Empty, IsActive = true }
								],
				Users = [
					new SeedUser("admin-techstart@example.com", seedPassword, AccountLevel.Admin),
					new SeedUser("user-techstart@example.com", seedPassword, AccountLevel.User)
				]
			},
			new TenantSeedData {
				Tenant = new Tenant { Code = "global-solutions", Name = "Global Solutions" },
								Projects = [
										new Project { Name = "Enterprise Suite", TenantId = Guid.Empty, IsActive = true },
										new Project { Name = "Customer Portal", TenantId = Guid.Empty, IsActive = true }
								],
				Users = [
					new SeedUser("admin-global@example.com", seedPassword, AccountLevel.Admin),
					new SeedUser("user-global@example.com", seedPassword, AccountLevel.User)
				]
			}
		};

		var crossTenantUsers = new List<CrossTenantUser> {
			new CrossTenantUser("alice@example.com", ["acme-corp"]),
			new CrossTenantUser("bob@example.com", ["acme-corp", "techstart-inc"]),
			new CrossTenantUser("charlie@example.com", ["acme-corp", "techstart-inc", "global-solutions"])
		};

		var tenantCodes = tenantData.Select(td => td.Tenant.Code).ToList();
		var existingTenantCodesQuery = from t in dbContext.Tenant
																	 where tenantCodes.Contains(t.Code)
																	 select t.Code;
		var existingTenantCodes = await existingTenantCodesQuery.ToListAsync();

		var newTenants = tenantData
			.Where(td => !existingTenantCodes.Contains(td.Tenant.Code))
			.Select(td => new Tenant { Code = td.Tenant.Code, Name = td.Tenant.Name })
			.ToList();

		if (newTenants.Count != 0) {
			await dbContext.Tenant.AddRangeAsync(newTenants);
			await dbContext.SaveChangesAsync();
		}

		var allTenantsQuery = from t in dbContext.Tenant
													where tenantCodes.Contains(t.Code)
													select t;
		var allTenants = await allTenantsQuery.ToDictionaryAsync(t => t.Code, t => t.GetRequiredId());

		var projectsToAdd = new List<Project>();
		foreach (var td in tenantData) {
			if (allTenants.TryGetValue(td.Tenant.Code, out var tenantId)) {
				var projectNames = td.Projects.Select(p => p.Name).ToList();

				var existingProjectsQuery = from p in dbContext.Project
																		where p.TenantId == tenantId && projectNames.Contains(p.Name)
																		select p.Name;
				var existingProjects = await existingProjectsQuery.ToListAsync();

				var newProjects = td.Projects
					.Where(p => !existingProjects.Contains(p.Name))
					.Select(p => new Project {
						TenantId = tenantId,
						Name = p.Name,
						Description = p.Description,
						IsActive = p.IsActive
					})
					.ToList();

				projectsToAdd.AddRange(newProjects);
			}
		}

		if (projectsToAdd.Count != 0) {
			await dbContext.Project.AddRangeAsync(projectsToAdd);
			await dbContext.SaveChangesAsync();
		}

		var tenantUserEmails = tenantData.SelectMany(td => td.Users.Select(u => u.Email)).ToList();
		var crossTenantUserEmails = crossTenantUsers.Select(ctu => ctu.Email).ToList();
		var allUserEmails = tenantUserEmails.Concat(crossTenantUserEmails).Distinct().ToList();

		var existingUserEmailsQuery = from u in dbContext.User
																	where allUserEmails.Contains(u.Email)
																	select u.Email;
		var existingUserEmails = await existingUserEmailsQuery.ToListAsync();

		var newUsers = allUserEmails
			.Where(email => !existingUserEmails.Contains(email))
			.Select(email => new User {
				Email = email,
				Password = seedPassword,
				Status = UserStatus.Active,
				IsVerified = true
			})
			.ToList();

		if (newUsers.Count != 0) {
			await dbContext.User.AddRangeAsync(newUsers);
			await dbContext.SaveChangesAsync();
		}

		var allUsersQuery = from u in dbContext.User
												where allUserEmails.Contains(u.Email)
												select u;
		var allUsers = await allUsersQuery.ToDictionaryAsync(u => u.Email, u => u.GetRequiredId());

		var desiredAccounts = new List<UserAccount>();

		foreach (var td in tenantData) {
			if (allTenants.TryGetValue(td.Tenant.Code, out var tenantId)) {
				foreach (var u in td.Users) {
					if (allUsers.TryGetValue(u.Email, out var userId)) {
						desiredAccounts.Add(new UserAccount {
							UserId = userId,
							TenantId = tenantId,
							AccountScope = AccountScope.Tenant,
							Level = u.Level,
							IsSuspended = false
						});
					}
				}
			}
		}

		foreach (var ctu in crossTenantUsers) {
			if (allUsers.TryGetValue(ctu.Email, out var userId)) {
				foreach (var tenantCode in ctu.TenantCodes) {
					if (allTenants.TryGetValue(tenantCode, out var tenantId)) {
						desiredAccounts.Add(new UserAccount {
							UserId = userId,
							TenantId = tenantId,
							AccountScope = AccountScope.Tenant,
							Level = AccountLevel.User,
							IsSuspended = false
						});
					}
				}
			}
		}

		var tenantIds = allTenants.Values.ToList();
		var existingUserAccountsQuery = from ua in dbContext.UserAccount
																		where ua.AccountScope == AccountScope.Tenant
																					&& ua.TenantId.HasValue
																					&& tenantIds.Contains(ua.TenantId.Value)
																		select new { ua.UserId, TenantId = ua.TenantId!.Value };
		var existingUserAccounts = await existingUserAccountsQuery.ToListAsync();

		var existingSet = new HashSet<(Guid, Guid)>(existingUserAccounts.Select(p => (p.UserId, p.TenantId)));

		var newAccounts = desiredAccounts
			.Where(a => !existingSet.Contains((a.UserId, a.TenantId!.Value)))
			.ToList();

		if (newAccounts.Count != 0) {
			await dbContext.UserAccount.AddRangeAsync(newAccounts);
			await dbContext.SaveChangesAsync();
		}
	}

	private static async Task SeedProfilesAndPermissionsAsync(MainApiDbContext dbContext) {
		// Staff profiles do not depend on a special 'staff' tenant

		var profilesData = new List<(string Name, ProfileScope Scope, Guid? TenantId, string[] PermissionKeys)> {
			("Staff Admin", ProfileScope.Staff, null, [
				PermissionEnum.Staff.CAN_LIST_TENANTS.Key,
				PermissionEnum.Staff.CAN_CREATE_TENANT.Key,
				PermissionEnum.Staff.CAN_GET_TENANT.Key,
				PermissionEnum.Staff.CAN_LIST_USERS.Key,
				PermissionEnum.Staff.CAN_GET_PROFILE.Key,
				PermissionEnum.Staff.CAN_LIST_PROFILES.Key,
				PermissionEnum.Staff.CAN_CREATE_PROFILE.Key
			]),
			("Staff User", ProfileScope.Staff, null, [
				PermissionEnum.Staff.CAN_LIST_TENANTS.Key,
				PermissionEnum.Staff.CAN_LIST_USERS.Key
			])
		};

		var tenantsQuery = from t in dbContext.Tenant
											 select t;
		var tenants = await tenantsQuery.ToListAsync();

		foreach (var tenant in tenants) {
			profilesData.Add(($"{tenant.Name} Admin", ProfileScope.Tenant, tenant.Id, []));
			profilesData.Add(($"{tenant.Name} User", ProfileScope.Tenant, tenant.Id, []));
		}

		var existingProfilesQuery = from p in dbContext.Profile
																where profilesData.Select(pd => pd.Name).Contains(p.Name)
																select p.Name;
		var existingProfiles = await existingProfilesQuery.ToListAsync();

		var newProfiles = profilesData
			.Where(pd => !existingProfiles.Contains(pd.Name))
			.Select(pd => new Profile {
				Name = pd.Name,
				ProfileScope = pd.Scope,
				TenantId = pd.TenantId
			})
			.ToList();

		if (newProfiles.Count != 0) {
			await dbContext.Profile.AddRangeAsync(newProfiles);
			await dbContext.SaveChangesAsync();
		}

		var allProfilesQuery = from p in dbContext.Profile
													 where profilesData.Select(pd => pd.Name).Contains(p.Name)
													 select p;
		var allProfiles = await allProfilesQuery.ToDictionaryAsync(p => p.Name, p => p.GetRequiredId());

		var profilePermissionsToAdd = new List<ProfilePermission>();
		foreach (var pd in profilesData.Where(pd => pd.PermissionKeys.Length > 0)) {
			if (allProfiles.TryGetValue(pd.Name, out var profileId)) {
				var existingPermissionsQuery = from pp in dbContext.ProfilePermission
																			 where pp.ProfileId == profileId
																			 select pp.PermissionKey;
				var existingPermissions = await existingPermissionsQuery.ToListAsync();

				var newPermissions = pd.PermissionKeys
					.Where(key => !existingPermissions.Contains(key))
					.Select(key => new ProfilePermission {
						ProfileId = profileId,
						PermissionKey = key
					})
					.ToList();

				profilePermissionsToAdd.AddRange(newPermissions);
			}
		}

		if (profilePermissionsToAdd.Count != 0) {
			await dbContext.ProfilePermission.AddRangeAsync(profilePermissionsToAdd);
			await dbContext.SaveChangesAsync();
		}
	}

	private static async Task SeedUserAccountProfilesAsync(MainApiDbContext dbContext) {
		var staffAdminProfileQuery = from p in dbContext.Profile
																 where p.Name == "Staff Admin"
																 select p;
		var staffAdminProfile = await staffAdminProfileQuery.FirstOrDefaultAsync();
		var staffUserProfileQuery = from p in dbContext.Profile
																where p.Name == "Staff User"
																select p;
		var staffUserProfile = await staffUserProfileQuery.FirstOrDefaultAsync();

		if (staffAdminProfile == null || staffUserProfile == null) return;

		var staffAdminAccountQuery = from ua in dbContext.UserAccount.Include(ua => ua.User)
																 where ua.User.Email == "staff-admin@example.com" && ua.AccountScope == AccountScope.Staff
																 select ua;
		var staffAdminAccount = await staffAdminAccountQuery.FirstOrDefaultAsync();

		var staffUserAccountQuery = from ua in dbContext.UserAccount.Include(ua => ua.User)
																where ua.User.Email == "staff-user@example.com" && ua.AccountScope == AccountScope.Staff
																select ua;
		var staffUserAccount = await staffUserAccountQuery.FirstOrDefaultAsync();

		var userAccountProfilesToAdd = new List<UserAccountProfile>();

		if (staffAdminAccount != null && staffAdminProfile != null) {
			var staffAdminUapExistsQuery = from uap in dbContext.UserAccountProfile
																		 where uap.UserAccountId == staffAdminAccount.Id && uap.ProfileId == staffAdminProfile.Id
																		 select uap;
			if (!await staffAdminUapExistsQuery.AnyAsync()) {
				userAccountProfilesToAdd.Add(new UserAccountProfile {
					UserAccountId = staffAdminAccount.GetRequiredId(),
					ProfileId = staffAdminProfile.GetRequiredId()
				});
			}
		}

		if (staffUserAccount != null && staffUserProfile != null) {
			var staffUserUapExistsQuery = from uap in dbContext.UserAccountProfile
																		where uap.UserAccountId == staffUserAccount.Id && uap.ProfileId == staffUserProfile.Id
																		select uap;
			if (!await staffUserUapExistsQuery.AnyAsync()) {
				userAccountProfilesToAdd.Add(new UserAccountProfile {
					UserAccountId = staffUserAccount.GetRequiredId(),
					ProfileId = staffUserProfile.GetRequiredId()
				});
			}
		}

		var tenantWithUsersQuery = dbContext.Tenant
				.Include(t => t.UserAccounts)
				.ThenInclude(ua => ua.User);
		var tenantsWithUsersQuery = from t in tenantWithUsersQuery
																where t.Code != "staff"
																select t;
		var tenants = await tenantsWithUsersQuery.ToListAsync();

		foreach (var tenant in tenants) {
			var tenantAdminProfileQuery = from p in dbContext.Profile
																		where p.Name == $"{tenant.Name} Admin" && p.TenantId == tenant.Id
																		select p;
			var tenantAdminProfile = await tenantAdminProfileQuery.FirstOrDefaultAsync();
			var tenantUserProfileQuery = from p in dbContext.Profile
																	 where p.Name == $"{tenant.Name} User" && p.TenantId == tenant.Id
																	 select p;
			var tenantUserProfile = await tenantUserProfileQuery.FirstOrDefaultAsync();

			if (tenantAdminProfile == null || tenantUserProfile == null) continue;

			foreach (var userAccount in tenant.UserAccounts.Where(ua => ua.AccountScope == AccountScope.Tenant)) {
				var targetProfile = userAccount.Level == AccountLevel.Admin ? tenantAdminProfile : tenantUserProfile;

				var userAccountProfileExistsQuery = from uap in dbContext.UserAccountProfile
																						where uap.UserAccountId == userAccount.Id && uap.ProfileId == targetProfile.Id
																						select uap;
				if (!await userAccountProfileExistsQuery.AnyAsync()) {
					userAccountProfilesToAdd.Add(new UserAccountProfile {
						UserAccountId = userAccount.GetRequiredId(),
						ProfileId = targetProfile.GetRequiredId()
					});
				}
			}
		}

		if (userAccountProfilesToAdd.Count != 0) {
			await dbContext.UserAccountProfile.AddRangeAsync(userAccountProfilesToAdd);
			await dbContext.SaveChangesAsync();
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
