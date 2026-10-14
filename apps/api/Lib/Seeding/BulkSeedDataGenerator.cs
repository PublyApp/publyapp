using Bogus;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Seeding;

/// <summary>
/// Generates bulk seed data using Bogus.
/// </summary>
public class BulkSeedDataGenerator {
	private static readonly Lazy<string> _CachedSeedPassword = new(
		() => PasswordUtils.HashPassword(SeedConstants.SeedPassword),
		LazyThreadSafetyMode.ExecutionAndPublication
	);

	private readonly int _TenantCount;
	private readonly int _StaffUserCount;
	private readonly int _PowerUserCount;
	private readonly int _CrossTenantUserCount;
	private readonly int _SingleTenantUserCount;
	private readonly int _ProjectsPerTenant;

	private readonly Faker _Faker;
	private readonly Random _Random;

	private List<Tenant> _Tenants = [];
	private List<User> _TenantUsers = [];
	private List<UserAccount> _TenantUserAccounts = [];
	private List<User> _StaffUsers = [];
	private List<UserAccount> _StaffUserAccounts = [];
	private List<User> _AllUsers = [];
	private List<UserAccount> _AllUserAccounts = [];
	private List<Project> _Projects = [];
	private List<Invitation> _Invitations = [];

	public BulkSeedDataGenerator(
		int? tenantCount = null,
		int? staffUserCount = null,
		int? powerUserCount = null,
		int? crossTenantUserCount = null,
		int? singleTenantUserCount = null,
		int? projectsPerTenant = null
	) {
		this._TenantCount = tenantCount ?? BulkSeedConstants.DefaultTenantCount;
		this._StaffUserCount = staffUserCount ?? BulkSeedConstants.DefaultStaffUserCount;
		this._PowerUserCount = powerUserCount ?? BulkSeedConstants.DefaultPowerUserCount;
		this._CrossTenantUserCount = crossTenantUserCount ?? BulkSeedConstants.DefaultCrossTenantUserCount;
		this._SingleTenantUserCount = singleTenantUserCount ?? BulkSeedConstants.DefaultSingleTenantUserCount;
		this._ProjectsPerTenant = projectsPerTenant ?? BulkSeedConstants.DefaultProjectsPerTenant;

		this._Random = new Random(12345); // Fixed seed for reproducibility
		this._Faker = new Faker { Random = new Randomizer(this._Random.Next()) };
	}

	public IReadOnlyList<Tenant> Tenants {
		get {
			return this._Tenants;
		}
	}

	public IReadOnlyList<User> Users {
		get {
			return this._AllUsers;
		}
	}

	public IReadOnlyList<UserAccount> UserAccounts {
		get {
			return this._AllUserAccounts;
		}
	}

	public IReadOnlyList<Project> Projects {
		get {
			return this._Projects;
		}
	}

	public IReadOnlyList<Invitation> Invitations {
		get {
			return this._Invitations;
		}
	}

	public IReadOnlyList<User> TenantUsers {
		get {
			return this._TenantUsers;
		}
	}

	public IReadOnlyList<UserAccount> TenantUserAccounts {
		get {
			return this._TenantUserAccounts;
		}
	}

	public IReadOnlyList<User> StaffUsers {
		get {
			return this._StaffUsers;
		}
	}

	public IReadOnlyList<UserAccount> StaffUserAccounts {
		get {
			return this._StaffUserAccounts;
		}
	}

	/// <summary>
	/// Generates all bulk seed data in the correct order (dependencies first).
	/// </summary>
	public void GenerateAll() {
		this._GenerateTenants();
		this._GenerateTenantUsers();
		this._GenerateStaffUsers();
		this._GenerateTenantUserAccounts();
		this._GenerateStaffUserAccounts();
		this._FinalizeCombinedLists();
		this._GenerateProjects();
		this._GenerateInvitations();
	}

	private void _FinalizeCombinedLists() {
		// BulkSeeder expects a single Users/UserAccounts list to insert. We keep tenant and staff
		// generation separate to avoid accidental cross-scope accounts (staff users must never
		// have tenant memberships).
		this._AllUsers = [.. this._TenantUsers, .. this._StaffUsers];
		this._AllUserAccounts = [.. this._TenantUserAccounts, .. this._StaffUserAccounts];
	}

	/// <summary>
	/// Generates bulk tenants.
	/// </summary>
	private void _GenerateTenants() {
		this._Tenants = new List<Tenant>(this._TenantCount);

		for (int i = 1; i <= this._TenantCount; i++) {
			var roll = this._Faker.Random.Double();
			var isDeleted = roll < BulkSeedConstants.DeletedTenantRatio;
			var isActive = !isDeleted && roll < (BulkSeedConstants.DeletedTenantRatio + BulkSeedConstants.ActiveTenantRatio);

			// Deleted tenants are always suspended (consistent state)
			var isSuspended = !isActive;

			var tenant = new Tenant {
				// Use UUIDv7 for time-ordered IDs (realistic cursor pagination behavior)
				Id = Guid.CreateVersion7(),
				Code = $"{BulkSeedConstants.TenantCodePrefix}{i:D3}",
				Name = this._Faker.Company.CompanyName(),
				Status = !isSuspended ? TenantStatus.Active : TenantStatus.Suspended,
				MaxUsers = 100
			};

			if (isDeleted) {
				tenant.IsDeleted = true;
				tenant.DeletedAt = this._Faker.Date.Past();
			}

			this._Tenants.Add(tenant);
		}
	}

	/// <summary>
	/// Generates bulk tenant users.
	/// </summary>
	private void _GenerateTenantUsers() {
		var totalUsers = this._PowerUserCount + this._CrossTenantUserCount + this._SingleTenantUserCount;
		this._TenantUsers = new List<User>(totalUsers);

		// Generate power users (will have many tenant memberships)
		for (int i = 1; i <= this._PowerUserCount; i++) {
			this._TenantUsers.Add(this._GenerateUser(emailPrefix: "bulk.user", index: i));
		}

		// Generate cross-tenant users
		for (int i = 1; i <= this._CrossTenantUserCount; i++) {
			this._TenantUsers.Add(this._GenerateUser(emailPrefix: "bulk.user", index: i + this._PowerUserCount));
		}

		// Generate single-tenant users
		for (int i = 1; i <= this._SingleTenantUserCount; i++) {
			this._TenantUsers.Add(this._GenerateUser(emailPrefix: "bulk.user", index: i + this._PowerUserCount + this._CrossTenantUserCount));
		}
	}

	private void _GenerateStaffUsers() {
		this._StaffUsers = new List<User>(this._StaffUserCount);

		// For staff UI testing, it's useful to have a decent population for pagination and search.
		for (int i = 1; i <= this._StaffUserCount; i++) {
			this._StaffUsers.Add(this._GenerateUser(emailPrefix: BulkSeedConstants.StaffUserEmailPrefix, index: i));
		}
	}

	private User _GenerateUser(string emailPrefix, int index) {
		var roll = this._Faker.Random.Double();
		var isDeleted = roll < BulkSeedConstants.DeletedUserRatio;
		var isActive = !isDeleted && roll < (BulkSeedConstants.DeletedUserRatio + BulkSeedConstants.ActiveUserRatio);

		var user = new User {
			// Use UUIDv7 for time-ordered IDs (realistic cursor pagination behavior)
			Id = Guid.CreateVersion7(),
			Email = $"{emailPrefix}{index:D5}@{BulkSeedConstants.UserEmailDomain}",
			Password = BulkSeedDataGenerator._CachedSeedPassword.Value,
			Status = isActive ? UserStatus.Active : UserStatus.Suspended,
			IsVerified = true,
			FirstName = this._Faker.Name.FirstName(),
			LastName = this._Faker.Name.LastName()
		};

		if (isDeleted) {
			user.IsDeleted = true;
			user.DeletedAt = this._Faker.Date.Past();
		}

		return user;
	}

	/// <summary>
	/// Generates user accounts linking users to tenants.
	/// </summary>
	private void _GenerateTenantUserAccounts() {
		this._TenantUserAccounts = [];

		var activeTenants = this._Tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();
		var tenantIds = activeTenants.Select(t => t.GetRequiredId()).ToList();

		// Power users: 10-50 tenant memberships each
		var powerUsers = this._TenantUsers.Take(this._PowerUserCount).ToList();
		var powerUserTenantAssignments = this._GenerateTenantMemberships(powerUsers.Count, tenantIds,
			BulkSeedConstants.MinTenantMembershipsForPowerUser,
			BulkSeedConstants.MaxTenantMembershipsForPowerUser);

		for (int i = 0; i < powerUsers.Count; i++) {
			var user = powerUsers[i];
			var assignedTenants = powerUserTenantAssignments[i];

			foreach (var tenantIndex in assignedTenants) {
				var tenantId = tenantIds[tenantIndex];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				this._TenantUserAccounts.Add(account);
			}
		}

		// Cross-tenant users: 2-5 tenant memberships each
		// Note: Cross-tenant users can share tenants with power users - that's realistic
		var crossTenantUsers = this._TenantUsers.Skip(this._PowerUserCount).Take(this._CrossTenantUserCount).ToList();
		var crossTenantAssignments = this._GenerateTenantMemberships(crossTenantUsers.Count, tenantIds,
			BulkSeedConstants.MinTenantMembershipsForCrossTenant,
			BulkSeedConstants.MaxTenantMembershipsForCrossTenant);

		for (int i = 0; i < crossTenantUsers.Count; i++) {
			var user = crossTenantUsers[i];
			var assignedTenants = crossTenantAssignments[i];

			foreach (var tenantIdx in assignedTenants) {
				var tenantId = tenantIds[tenantIdx];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				this._TenantUserAccounts.Add(account);
			}
		}

		// Single-tenant users: 1 tenant each
		var singleTenantUsers = this._TenantUsers.Skip(this._PowerUserCount + this._CrossTenantUserCount).ToList();

		// Just use all active tenants for single-tenant users (no need to avoid overlaps)
		for (int i = 0; i < singleTenantUsers.Count; i++) {
			var user = singleTenantUsers[i];
			var tenantId = tenantIds[this._Random.Next(tenantIds.Count)];
			var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
			account.ValidateAccountType();
			this._TenantUserAccounts.Add(account);
		}
	}

	private void _GenerateStaffUserAccounts() {
		this._StaffUserAccounts = new List<UserAccount>(this._StaffUsers.Count);

		foreach (var user in this._StaffUsers) {
			var roll = this._Faker.Random.Double();
			var level = roll < BulkSeedConstants.StaffAdminRatio ? AccountLevel.Admin : AccountLevel.User;

			var account = UserAccount.CreateStaffAccount(userId: user.GetRequiredId(), accountLevel: level);
			account.ValidateAccountType();
			this._StaffUserAccounts.Add(account);
		}
	}

	/// <summary>
	/// Generates random tenant membership assignments.
	/// </summary>
	private List<List<int>> _GenerateTenantMemberships(int userCount, List<Guid> tenantIds, int minTenants, int maxTenants) {
		var assignments = new List<List<int>>();

		for (int i = 0; i < userCount; i++) {
			var tenantCount = this._Faker.Random.Int(minTenants, maxTenants);
			tenantCount = Math.Min(tenantCount, tenantIds.Count);

			var indices = Enumerable.Range(0, tenantIds.Count)
				.OrderBy(_ => this._Random.Next())
				.Take(tenantCount)
				.ToList();

			assignments.Add(indices);
		}

		return assignments;
	}

	/// <summary>
	/// Generates projects for each tenant.
	/// </summary>
	private void _GenerateProjects() {
		this._Projects = new List<Project>();

		var activeTenants = this._Tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();

		foreach (var tenant in activeTenants) {
			var projectCount = this._Faker.Random.Int(3, this._ProjectsPerTenant);

			for (int i = 1; i <= projectCount; i++) {
				var isDeleted = this._Faker.Random.Double() < BulkSeedConstants.DeletedProjectRatio;

				var project = new Project {
					TenantId = tenant.GetRequiredId(),
					Name = $"{BulkSeedConstants.ProjectNamePrefix}{tenant.Code}-{i}",
					Description = this._Faker.Lorem.Sentence()
				};

				if (isDeleted) {
					project.IsDeleted = true;
					project.DeletedAt = this._Faker.Date.Past();
				}

				this._Projects.Add(project);
			}
		}
	}

	/// <summary>
	/// Generates invitations for some tenants.
	/// Note: Skipped for bulk seed - invitations require valid InvitedByUserId from existing users.
	/// </summary>
	private void _GenerateInvitations() {
		// Invitations are skipped in bulk seed because they require:
		// 1. A valid InvitedByUserId (must be an existing user)
		// 2. A unique token
		// These constraints make bulk generation complex. Manual seeding recommended.
		this._Invitations = [];
	}
}
