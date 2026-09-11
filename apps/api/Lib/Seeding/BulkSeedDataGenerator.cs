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
		_TenantCount = tenantCount ?? BulkSeedConstants.DefaultTenantCount;
		_StaffUserCount = staffUserCount ?? BulkSeedConstants.DefaultStaffUserCount;
		_PowerUserCount = powerUserCount ?? BulkSeedConstants.DefaultPowerUserCount;
		_CrossTenantUserCount = crossTenantUserCount ?? BulkSeedConstants.DefaultCrossTenantUserCount;
		_SingleTenantUserCount = singleTenantUserCount ?? BulkSeedConstants.DefaultSingleTenantUserCount;
		_ProjectsPerTenant = projectsPerTenant ?? BulkSeedConstants.DefaultProjectsPerTenant;

		_Random = new Random(12345); // Fixed seed for reproducibility
		_Faker = new Faker { Random = new Randomizer(_Random.Next()) };
	}

	public IReadOnlyList<Tenant> Tenants {
		get {
			return _Tenants;
		}
	}

	public IReadOnlyList<User> Users {
		get {
			return _AllUsers;
		}
	}

	public IReadOnlyList<UserAccount> UserAccounts {
		get {
			return _AllUserAccounts;
		}
	}

	public IReadOnlyList<Project> Projects {
		get {
			return _Projects;
		}
	}

	public IReadOnlyList<Invitation> Invitations {
		get {
			return _Invitations;
		}
	}

	public IReadOnlyList<User> TenantUsers {
		get {
			return _TenantUsers;
		}
	}

	public IReadOnlyList<UserAccount> TenantUserAccounts {
		get {
			return _TenantUserAccounts;
		}
	}

	public IReadOnlyList<User> StaffUsers {
		get {
			return _StaffUsers;
		}
	}

	public IReadOnlyList<UserAccount> StaffUserAccounts {
		get {
			return _StaffUserAccounts;
		}
	}

	/// <summary>
	/// Generates all bulk seed data in the correct order (dependencies first).
	/// </summary>
	public void GenerateAll() {
		_GenerateTenants();
		_GenerateTenantUsers();
		_GenerateStaffUsers();
		_GenerateTenantUserAccounts();
		_GenerateStaffUserAccounts();
		_FinalizeCombinedLists();
		_GenerateProjects();
		_GenerateInvitations();
	}

	private void _FinalizeCombinedLists() {
		// BulkSeeder expects a single Users/UserAccounts list to insert. We keep tenant and staff
		// generation separate to avoid accidental cross-scope accounts (staff users must never
		// have tenant memberships).
		_AllUsers = [.. _TenantUsers, .. _StaffUsers];
		_AllUserAccounts = [.. _TenantUserAccounts, .. _StaffUserAccounts];
	}

	/// <summary>
	/// Generates bulk tenants.
	/// </summary>
	private void _GenerateTenants() {
		_Tenants = new List<Tenant>(_TenantCount);

		for (int i = 1; i <= _TenantCount; i++) {
			var roll = _Faker.Random.Double();
			var isDeleted = roll < BulkSeedConstants.DeletedTenantRatio;
			var isActive = !isDeleted && roll < (BulkSeedConstants.DeletedTenantRatio + BulkSeedConstants.ActiveTenantRatio);

			// Deleted tenants are always suspended (consistent state)
			var isSuspended = !isActive;

			var tenant = new Tenant {
				// Use UUIDv7 for time-ordered IDs (realistic cursor pagination behavior)
				Id = Guid.CreateVersion7(),
				Code = $"{BulkSeedConstants.TenantCodePrefix}{i:D3}",
				Name = _Faker.Company.CompanyName(),
				Status = !isSuspended ? TenantStatus.Active : TenantStatus.Suspended,
				MaxUsers = 100
			};

			if (isDeleted) {
				tenant.IsDeleted = true;
				tenant.DeletedAt = _Faker.Date.Past();
			}

			_Tenants.Add(tenant);
		}
	}

	/// <summary>
	/// Generates bulk tenant users.
	/// </summary>
	private void _GenerateTenantUsers() {
		var totalUsers = _PowerUserCount + _CrossTenantUserCount + _SingleTenantUserCount;
		_TenantUsers = new List<User>(totalUsers);

		// Generate power users (will have many tenant memberships)
		for (int i = 1; i <= _PowerUserCount; i++) {
			_TenantUsers.Add(_GenerateUser(emailPrefix: "bulk.user", index: i));
		}

		// Generate cross-tenant users
		for (int i = 1; i <= _CrossTenantUserCount; i++) {
			_TenantUsers.Add(_GenerateUser(emailPrefix: "bulk.user", index: i + _PowerUserCount));
		}

		// Generate single-tenant users
		for (int i = 1; i <= _SingleTenantUserCount; i++) {
			_TenantUsers.Add(_GenerateUser(emailPrefix: "bulk.user", index: i + _PowerUserCount + _CrossTenantUserCount));
		}
	}

	private void _GenerateStaffUsers() {
		_StaffUsers = new List<User>(_StaffUserCount);

		// For staff UI testing, it's useful to have a decent population for pagination and search.
		for (int i = 1; i <= _StaffUserCount; i++) {
			_StaffUsers.Add(_GenerateUser(emailPrefix: BulkSeedConstants.StaffUserEmailPrefix, index: i));
		}
	}

	private User _GenerateUser(string emailPrefix, int index) {
		var roll = _Faker.Random.Double();
		var isDeleted = roll < BulkSeedConstants.DeletedUserRatio;
		var isActive = !isDeleted && roll < (BulkSeedConstants.DeletedUserRatio + BulkSeedConstants.ActiveUserRatio);

		var user = new User {
			// Use UUIDv7 for time-ordered IDs (realistic cursor pagination behavior)
			Id = Guid.CreateVersion7(),
			Email = $"{emailPrefix}{index:D5}@{BulkSeedConstants.UserEmailDomain}",
			Password = _CachedSeedPassword.Value,
			Status = isActive ? UserStatus.Active : UserStatus.Suspended,
			IsVerified = true,
			FirstName = _Faker.Name.FirstName(),
			LastName = _Faker.Name.LastName()
		};

		if (isDeleted) {
			user.IsDeleted = true;
			user.DeletedAt = _Faker.Date.Past();
		}

		return user;
	}

	/// <summary>
	/// Generates user accounts linking users to tenants.
	/// </summary>
	private void _GenerateTenantUserAccounts() {
		_TenantUserAccounts = [];

		var activeTenants = _Tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();
		var tenantIds = activeTenants.Select(t => t.GetRequiredId()).ToList();

		// Power users: 10-50 tenant memberships each
		var powerUsers = _TenantUsers.Take(_PowerUserCount).ToList();
		var powerUserTenantAssignments = _GenerateTenantMemberships(powerUsers.Count, tenantIds,
			BulkSeedConstants.MinTenantMembershipsForPowerUser,
			BulkSeedConstants.MaxTenantMembershipsForPowerUser);

		for (int i = 0; i < powerUsers.Count; i++) {
			var user = powerUsers[i];
			var assignedTenants = powerUserTenantAssignments[i];

			foreach (var tenantIndex in assignedTenants) {
				var tenantId = tenantIds[tenantIndex];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				_TenantUserAccounts.Add(account);
			}
		}

		// Cross-tenant users: 2-5 tenant memberships each
		// Note: Cross-tenant users can share tenants with power users - that's realistic
		var crossTenantUsers = _TenantUsers.Skip(_PowerUserCount).Take(_CrossTenantUserCount).ToList();
		var crossTenantAssignments = _GenerateTenantMemberships(crossTenantUsers.Count, tenantIds,
			BulkSeedConstants.MinTenantMembershipsForCrossTenant,
			BulkSeedConstants.MaxTenantMembershipsForCrossTenant);

		for (int i = 0; i < crossTenantUsers.Count; i++) {
			var user = crossTenantUsers[i];
			var assignedTenants = crossTenantAssignments[i];

			foreach (var tenantIdx in assignedTenants) {
				var tenantId = tenantIds[tenantIdx];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				_TenantUserAccounts.Add(account);
			}
		}

		// Single-tenant users: 1 tenant each
		var singleTenantUsers = _TenantUsers.Skip(_PowerUserCount + _CrossTenantUserCount).ToList();

		// Just use all active tenants for single-tenant users (no need to avoid overlaps)
		for (int i = 0; i < singleTenantUsers.Count; i++) {
			var user = singleTenantUsers[i];
			var tenantId = tenantIds[_Random.Next(tenantIds.Count)];
			var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
			account.ValidateAccountType();
			_TenantUserAccounts.Add(account);
		}
	}

	private void _GenerateStaffUserAccounts() {
		_StaffUserAccounts = new List<UserAccount>(_StaffUsers.Count);

		foreach (var user in _StaffUsers) {
			var roll = _Faker.Random.Double();
			var level = roll < BulkSeedConstants.StaffAdminRatio ? AccountLevel.Admin : AccountLevel.User;

			var account = UserAccount.CreateStaffAccount(userId: user.GetRequiredId(), accountLevel: level);
			account.ValidateAccountType();
			_StaffUserAccounts.Add(account);
		}
	}

	/// <summary>
	/// Generates random tenant membership assignments.
	/// </summary>
	private List<List<int>> _GenerateTenantMemberships(int userCount, List<Guid> tenantIds, int minTenants, int maxTenants) {
		var assignments = new List<List<int>>();

		for (int i = 0; i < userCount; i++) {
			var tenantCount = _Faker.Random.Int(minTenants, maxTenants);
			tenantCount = Math.Min(tenantCount, tenantIds.Count);

			var indices = Enumerable.Range(0, tenantIds.Count)
				.OrderBy(_ => _Random.Next())
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
		_Projects = new List<Project>();

		var activeTenants = _Tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();

		foreach (var tenant in activeTenants) {
			var projectCount = _Faker.Random.Int(3, _ProjectsPerTenant);

			for (int i = 1; i <= projectCount; i++) {
				var isDeleted = _Faker.Random.Double() < BulkSeedConstants.DeletedProjectRatio;

				var project = new Project {
					TenantId = tenant.GetRequiredId(),
					Name = $"{BulkSeedConstants.ProjectNamePrefix}{tenant.Code}-{i}",
					Description = _Faker.Lorem.Sentence()
				};

				if (isDeleted) {
					project.IsDeleted = true;
					project.DeletedAt = _Faker.Date.Past();
				}

				_Projects.Add(project);
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
		_Invitations = [];
	}
}
