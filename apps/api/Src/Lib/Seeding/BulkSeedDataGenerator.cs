using Bogus;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Projects.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

namespace MainApi.Src.Lib.Seeding;

/// <summary>
/// Generates bulk seed data using Bogus.
/// </summary>
public class BulkSeedDataGenerator {
	private static readonly Lazy<string> CachedSeedPassword = new(
		() => PasswordUtils.HashPassword(SeedConstants.SeedPassword),
		LazyThreadSafetyMode.ExecutionAndPublication
	);

	private readonly int _tenantCount;
	private readonly int _staffUserCount;
	private readonly int _powerUserCount;
	private readonly int _crossTenantUserCount;
	private readonly int _singleTenantUserCount;
	private readonly int _projectsPerTenant;

	private readonly Faker _faker;
	private readonly Random _random;

	private List<Tenant> _tenants = [];
	private List<User> _tenantUsers = [];
	private List<UserAccount> _tenantUserAccounts = [];
	private List<User> _staffUsers = [];
	private List<UserAccount> _staffUserAccounts = [];
	private List<User> _allUsers = [];
	private List<UserAccount> _allUserAccounts = [];
	private List<Project> _projects = [];
	private List<Invitation> _invitations = [];

	public BulkSeedDataGenerator(
		int? tenantCount = null,
		int? staffUserCount = null,
		int? powerUserCount = null,
		int? crossTenantUserCount = null,
		int? singleTenantUserCount = null,
		int? projectsPerTenant = null
	) {
		_tenantCount = tenantCount ?? BulkSeedConstants.DefaultTenantCount;
		_staffUserCount = staffUserCount ?? BulkSeedConstants.DefaultStaffUserCount;
		_powerUserCount = powerUserCount ?? BulkSeedConstants.DefaultPowerUserCount;
		_crossTenantUserCount = crossTenantUserCount ?? BulkSeedConstants.DefaultCrossTenantUserCount;
		_singleTenantUserCount = singleTenantUserCount ?? BulkSeedConstants.DefaultSingleTenantUserCount;
		_projectsPerTenant = projectsPerTenant ?? BulkSeedConstants.DefaultProjectsPerTenant;

		_random = new Random(12345); // Fixed seed for reproducibility
		_faker = new Faker { Random = new Randomizer(_random.Next()) };
	}

	public IReadOnlyList<Tenant> Tenants => _tenants;
	public IReadOnlyList<User> Users => _allUsers;
	public IReadOnlyList<UserAccount> UserAccounts => _allUserAccounts;
	public IReadOnlyList<Project> Projects => _projects;
	public IReadOnlyList<Invitation> Invitations => _invitations;

	public IReadOnlyList<User> TenantUsers => _tenantUsers;
	public IReadOnlyList<UserAccount> TenantUserAccounts => _tenantUserAccounts;
	public IReadOnlyList<User> StaffUsers => _staffUsers;
	public IReadOnlyList<UserAccount> StaffUserAccounts => _staffUserAccounts;

	/// <summary>
	/// Generates all bulk seed data in the correct order (dependencies first).
	/// </summary>
	public void GenerateAll() {
		GenerateTenants();
		GenerateTenantUsers();
		GenerateStaffUsers();
		GenerateTenantUserAccounts();
		GenerateStaffUserAccounts();
		FinalizeCombinedLists();
		GenerateProjects();
		GenerateInvitations();
	}

	private void FinalizeCombinedLists() {
		// BulkSeeder expects a single Users/UserAccounts list to insert. We keep tenant and staff
		// generation separate to avoid accidental cross-scope accounts (staff users must never
		// have tenant memberships).
		_allUsers = [.. _tenantUsers, .. _staffUsers];
		_allUserAccounts = [.. _tenantUserAccounts, .. _staffUserAccounts];
	}

	/// <summary>
	/// Generates bulk tenants.
	/// </summary>
	private void GenerateTenants() {
		_tenants = new List<Tenant>(_tenantCount);

		for (int i = 1; i <= _tenantCount; i++) {
			var roll = _faker.Random.Double();
			var isDeleted = roll < BulkSeedConstants.DeletedTenantRatio;
			var isActive = !isDeleted && roll < (BulkSeedConstants.DeletedTenantRatio + BulkSeedConstants.ActiveTenantRatio);

			// Deleted tenants are always suspended (consistent state)
			var isSuspended = !isActive;

			var tenant = new Tenant {
				// Use UUIDv7 for time-ordered IDs (realistic cursor pagination behavior)
				Id = Guid.CreateVersion7(),
				Code = $"{BulkSeedConstants.TenantCodePrefix}{i:D3}",
				Name = _faker.Company.CompanyName(),
				Status = !isSuspended ? TenantStatus.Active : TenantStatus.Suspended,
				MaxUsers = 100
			};

			if (isDeleted) {
				tenant.IsDeleted = true;
				tenant.DeletedAt = _faker.Date.Past();
			}

			_tenants.Add(tenant);
		}
	}

	/// <summary>
	/// Generates bulk tenant users.
	/// </summary>
	private void GenerateTenantUsers() {
		var totalUsers = _powerUserCount + _crossTenantUserCount + _singleTenantUserCount;
		_tenantUsers = new List<User>(totalUsers);

		// Generate power users (will have many tenant memberships)
		for (int i = 1; i <= _powerUserCount; i++) {
			_tenantUsers.Add(GenerateUser(emailPrefix: "bulk.user", index: i));
		}

		// Generate cross-tenant users
		for (int i = 1; i <= _crossTenantUserCount; i++) {
			_tenantUsers.Add(GenerateUser(emailPrefix: "bulk.user", index: i + _powerUserCount));
		}

		// Generate single-tenant users
		for (int i = 1; i <= _singleTenantUserCount; i++) {
			_tenantUsers.Add(GenerateUser(emailPrefix: "bulk.user", index: i + _powerUserCount + _crossTenantUserCount));
		}
	}

	private void GenerateStaffUsers() {
		_staffUsers = new List<User>(_staffUserCount);

		// For staff UI testing, it's useful to have a decent population for pagination and search.
		for (int i = 1; i <= _staffUserCount; i++) {
			_staffUsers.Add(GenerateUser(emailPrefix: BulkSeedConstants.StaffUserEmailPrefix, index: i));
		}
	}

	private User GenerateUser(string emailPrefix, int index) {
		var roll = _faker.Random.Double();
		var isDeleted = roll < BulkSeedConstants.DeletedUserRatio;
		var isActive = !isDeleted && roll < (BulkSeedConstants.DeletedUserRatio + BulkSeedConstants.ActiveUserRatio);

		var user = new User {
			// Use UUIDv7 for time-ordered IDs (realistic cursor pagination behavior)
			Id = Guid.CreateVersion7(),
			Email = $"{emailPrefix}{index:D5}@{BulkSeedConstants.UserEmailDomain}",
			Password = CachedSeedPassword.Value,
			Status = isActive ? UserStatus.Active : UserStatus.Suspended,
			IsVerified = true,
			FirstName = _faker.Name.FirstName(),
			LastName = _faker.Name.LastName()
		};

		if (isDeleted) {
			user.IsDeleted = true;
			user.DeletedAt = _faker.Date.Past();
		}

		return user;
	}

	/// <summary>
	/// Generates user accounts linking users to tenants.
	/// </summary>
	private void GenerateTenantUserAccounts() {
		_tenantUserAccounts = [];

		var activeTenants = _tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();
		var tenantIds = activeTenants.Select(t => t.GetRequiredId()).ToList();

		// Power users: 10-50 tenant memberships each
		var powerUsers = _tenantUsers.Take(_powerUserCount).ToList();
		var powerUserTenantAssignments = GenerateTenantMemberships(powerUsers.Count, tenantIds,
			BulkSeedConstants.MinTenantMembershipsForPowerUser,
			BulkSeedConstants.MaxTenantMembershipsForPowerUser);

		for (int i = 0; i < powerUsers.Count; i++) {
			var user = powerUsers[i];
			var assignedTenants = powerUserTenantAssignments[i];

			foreach (var tenantIndex in assignedTenants) {
				var tenantId = tenantIds[tenantIndex];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				_tenantUserAccounts.Add(account);
			}
		}

		// Cross-tenant users: 2-5 tenant memberships each
		// Note: Cross-tenant users can share tenants with power users - that's realistic
		var crossTenantUsers = _tenantUsers.Skip(_powerUserCount).Take(_crossTenantUserCount).ToList();
		var crossTenantAssignments = GenerateTenantMemberships(crossTenantUsers.Count, tenantIds,
			BulkSeedConstants.MinTenantMembershipsForCrossTenant,
			BulkSeedConstants.MaxTenantMembershipsForCrossTenant);

		for (int i = 0; i < crossTenantUsers.Count; i++) {
			var user = crossTenantUsers[i];
			var assignedTenants = crossTenantAssignments[i];

			foreach (var tenantIdx in assignedTenants) {
				var tenantId = tenantIds[tenantIdx];
				var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
				account.ValidateAccountType();
				_tenantUserAccounts.Add(account);
			}
		}

		// Single-tenant users: 1 tenant each
		var singleTenantUsers = _tenantUsers.Skip(_powerUserCount + _crossTenantUserCount).ToList();

		// Just use all active tenants for single-tenant users (no need to avoid overlaps)
		for (int i = 0; i < singleTenantUsers.Count; i++) {
			var user = singleTenantUsers[i];
			var tenantId = tenantIds[_random.Next(tenantIds.Count)];
			var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId, AccountLevel.User);
			account.ValidateAccountType();
			_tenantUserAccounts.Add(account);
		}
	}

	private void GenerateStaffUserAccounts() {
		_staffUserAccounts = new List<UserAccount>(_staffUsers.Count);

		foreach (var user in _staffUsers) {
			var roll = _faker.Random.Double();
			var level = roll < BulkSeedConstants.StaffAdminRatio ? AccountLevel.Admin : AccountLevel.User;

			var account = UserAccount.CreateStaffAccount(userId: user.GetRequiredId(), accountLevel: level);
			account.ValidateAccountType();
			_staffUserAccounts.Add(account);
		}
	}

	/// <summary>
	/// Generates random tenant membership assignments.
	/// </summary>
	private List<List<int>> GenerateTenantMemberships(int userCount, List<Guid> tenantIds, int minTenants, int maxTenants) {
		var assignments = new List<List<int>>();

		for (int i = 0; i < userCount; i++) {
			var tenantCount = _faker.Random.Int(minTenants, maxTenants);
			tenantCount = Math.Min(tenantCount, tenantIds.Count);

			var indices = Enumerable.Range(0, tenantIds.Count)
				.OrderBy(_ => _random.Next())
				.Take(tenantCount)
				.ToList();

			assignments.Add(indices);
		}

		return assignments;
	}

	/// <summary>
	/// Generates projects for each tenant.
	/// </summary>
	private void GenerateProjects() {
		_projects = new List<Project>();

		var activeTenants = _tenants.Where(t => !t.IsDeleted && t.Status == TenantStatus.Active).ToList();

		foreach (var tenant in activeTenants) {
			var projectCount = _faker.Random.Int(3, _projectsPerTenant);

			for (int i = 1; i <= projectCount; i++) {
				var isDeleted = _faker.Random.Double() < BulkSeedConstants.DeletedProjectRatio;

				var project = new Project {
					TenantId = tenant.GetRequiredId(),
					Name = $"{BulkSeedConstants.ProjectNamePrefix}{tenant.Code}-{i}",
					Description = _faker.Lorem.Sentence()
				};

				if (isDeleted) {
					project.IsDeleted = true;
					project.DeletedAt = _faker.Date.Past();
				}

				_projects.Add(project);
			}
		}
	}

	/// <summary>
	/// Generates invitations for some tenants.
	/// Note: Skipped for bulk seed - invitations require valid InvitedByUserId from existing users.
	/// </summary>
	private void GenerateInvitations() {
		// Invitations are skipped in bulk seed because they require:
		// 1. A valid InvitedByUserId (must be an existing user)
		// 2. A unique token
		// These constraints make bulk generation complex. Manual seeding recommended.
		_invitations = [];
	}
}
