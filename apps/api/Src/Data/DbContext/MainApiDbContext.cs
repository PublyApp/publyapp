using System.Linq.Expressions;

using MainApi.Src.Lib;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.Auth.Entities;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Permissions.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Projects.Entities;
using MainApi.Src.Modules.SystemNotices.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace MainApi.Src.Data.DbContext;

/// <summary>
/// Main database context with automatic audit tracking for all entities.
/// </summary>
public class MainApiDbContext : Microsoft.EntityFrameworkCore.DbContext {
	private static readonly Lazy<List<Type>> SeederTypeCache = new(DiscoverSeedersInternal, LazyThreadSafetyMode.ExecutionAndPublication);

	public DbSet<Session> Session { get; init; } = null!;
	public DbSet<User> User { get; init; } = null!;
	public DbSet<Tenant> Tenant { get; init; } = null!;

	// Project system entities (still needed for Project entity)
	public DbSet<Project> Project { get; init; } = null!;

	// Unified permission system entities
	public DbSet<Permission> Permission { get; init; } = null!;
	public DbSet<Profile> Profile { get; init; } = null!;
	public DbSet<ProfilePermission> ProfilePermission { get; init; } = null!;
	public DbSet<UserAccountProfile> UserAccountProfile { get; init; } = null!;

	// Unified account system (handles Staff, Tenant, and Project accounts)
	public DbSet<UserAccount> UserAccount { get; init; } = null!;

	// Unified invitation system (Staff/Tenant/Project)
	public DbSet<Invitation> Invitation { get; init; } = null!;
	public DbSet<InvitationProfile> InvitationProfile { get; init; } = null!;

	// Staff back-office entities
	public DbSet<AuditLog> AuditLog { get; init; } = null!;
	public DbSet<SystemNotice> SystemNotice { get; init; } = null!;

	public Guid? TenantId { get; set; }

	public MainApiDbContext(DbContextOptions options) : base(options) {
		var extension = options.FindExtension<TenantExtension>();
		TenantId = extension?.TenantId;
	}

	protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) {
		base.OnConfiguring(optionsBuilder);

		// EF Core 9: Define seeding logic here using reflection to discover all seeders
		optionsBuilder.UseSeeding((context, _) => {
			var dbContext = (MainApiDbContext)context;

			if (dbContext is null) {
				throw new InvalidOperationException("Seeding context cannot be null");
			}

			var infrastructure = (IInfrastructure<IServiceProvider>)dbContext;
			SeedAll(dbContext, infrastructure.Instance);
		});

		optionsBuilder.UseAsyncSeeding(async (context, _, cancellationToken) => {
			var dbContext = (MainApiDbContext)context;

			if (dbContext is null) {
				throw new InvalidOperationException("Seeding context cannot be null");
			}

			var infrastructure = (IInfrastructure<IServiceProvider>)dbContext;
			await SeedAllAsync(dbContext, infrastructure.Instance, cancellationToken);
		});
	}

	/// <summary>
	/// Discovers and executes all entity seeders synchronously.
	/// </summary>
	private static void SeedAll(MainApiDbContext dbContext, IServiceProvider serviceProvider) {
		Task.Run(() => SeedAllAsync(dbContext, serviceProvider, CancellationToken.None))
			.GetAwaiter()
			.GetResult();
	}

	/// <summary>
	/// Discovers and executes all entity seeders asynchronously using reflection.
	/// </summary>
	private static async Task SeedAllAsync(MainApiDbContext dbContext, IServiceProvider serviceProvider, CancellationToken cancellationToken) {
		var logger = serviceProvider.GetService<ILogger<MainApiDbContext>>();
		var seeders = CreateSeeders(serviceProvider);

		foreach (var seeder in seeders) {
			if (logger?.IsEnabled(LogLevel.Information) == true) {
				logger.LogInformation("Running seeder {Seeder} with order {Order}", seeder.GetType().Name, seeder.Order);
			}
			await seeder.SeedAsync(dbContext, cancellationToken);
		}
	}

	/// <summary>
	/// Discovers all classes that implement <see cref="IEntitySeeder"/> using reflection.
	/// </summary>
	private static List<Type> DiscoverSeeders() => SeederTypeCache.Value;

	/// <summary>
	/// Creates seeded instances via dependency injection with robust error handling.
	/// </summary>
	/// <param name="serviceProvider">The service provider used for DI instantiation.</param>
	/// <exception cref="InvalidOperationException">Thrown if a seeder cannot be instantiated.</exception>
	private static List<IEntitySeeder> CreateSeeders(IServiceProvider serviceProvider) {
		var seederTypes = DiscoverSeeders();
		var seeders = new List<IEntitySeeder>(seederTypes.Count);

		foreach (var type in seederTypes) {
			try {
				var instance = (IEntitySeeder)ActivatorUtilities.CreateInstance(serviceProvider, type);
				seeders.Add(instance);
			} catch (Exception ex) {
				throw new InvalidOperationException($"Failed to instantiate seeder '{type.FullName}'.", ex);
			}
		}

		return seeders
			.OrderBy(seeder => seeder.Order)
			.ToList();
	}

	/// <summary>
	/// Performs the reflection scan to find available seeders. Results are cached.
	/// </summary>
	private static List<System.Type> DiscoverSeedersInternal() {
		var seederInterface = typeof(IEntitySeeder);
		var assembly = typeof(MainApiDbContext).Assembly;

		var seederTypes = assembly
			.GetTypes()
			.Where(t =>
				t.IsClass &&
				!t.IsAbstract &&
				seederInterface.IsAssignableFrom(t) &&
				t != seederInterface
			)
			.ToList();

		return seederTypes;
	}

	protected override void OnModelCreating(ModelBuilder modelBuilder) {
		base.OnModelCreating(modelBuilder);

		// Access AppEnvironment for default values used in database schema configuration
		var env = AppEnvironment.Instance;

		// Database-level lowercase constraints
		modelBuilder.Entity<Tenant>()
			.ToTable(t => t.HasCheckConstraint("CK_Tenant_Code_Lowercase", "code = LOWER(code)"))
			.Property(t => t.MaxUsers)
			.HasDefaultValue(env.DEFAULT_MAX_USERS_PER_TENANT);

		modelBuilder.Entity<User>()
			.ToTable(t => t.HasCheckConstraint("CK_User_Email_Lowercase", "email = LOWER(email)"));

		// Database-level account type constraints
		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Staff_Constraints",
				"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"));

		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Tenant_Constraints",
				"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"));

		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Project_Constraints",
				"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"));

		// Database-level profile type constraints
		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Staff_Constraints",
				"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"));

		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Tenant_Constraints",
				"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"));

		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Project_Constraints",
				"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"));

		// Database-level invitation scope constraints
		modelBuilder.Entity<Invitation>()
			.ToTable(t => t.HasCheckConstraint("CK_Invitation_Staff_Constraints",
				"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"));

		modelBuilder.Entity<Invitation>()
			.ToTable(t => t.HasCheckConstraint("CK_Invitation_Tenant_Constraints",
				"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"));

		modelBuilder.Entity<Invitation>()
			.ToTable(t => t.HasCheckConstraint("CK_Invitation_Project_Constraints",
				"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"));

		// Database-level permission key prefix constraints
		modelBuilder.Entity<Permission>()
			.ToTable(t => t.HasCheckConstraint("CK_Permission_Staff_Key_Prefix",
				"(scope = 0 AND key LIKE 'staff.%') OR scope != 0"));

		modelBuilder.Entity<Permission>()
			.ToTable(t => t.HasCheckConstraint("CK_Permission_Tenant_Key_Prefix",
				"(scope = 1 AND key LIKE 'tenant.%') OR scope != 1"));

		modelBuilder.Entity<Permission>()
			.ToTable(t => t.HasCheckConstraint("CK_Permission_Project_Key_Prefix",
				"(scope = 2 AND key LIKE 'project.%') OR scope != 2"));

		// Translations is runtime-only, explicitly exclude from mapping
		modelBuilder.Entity<Permission>()
			.Ignore(p => p.Translations);

		// Explicit relationships for Session -> User (two FKs to same principal)
		modelBuilder.Entity<Session>()
			.HasOne(s => s.User)
			.WithMany(u => u.Sessions)
			.HasForeignKey(s => s.UserId)
			.IsRequired();

		modelBuilder.Entity<Session>()
			.HasOne(s => s.ImpersonatingStaffUser)
			.WithMany()
			.HasForeignKey(s => s.ImpersonatingStaffUserId)
			.OnDelete(DeleteBehavior.Restrict);

		// Configure InvitationProfile junction table
		modelBuilder.Entity<InvitationProfile>(entity => {
			entity.HasKey(e => new { e.InvitationId, e.ProfileId });

			entity.HasOne(e => e.Invitation)
				.WithMany(i => i.InvitationProfiles)
				.HasForeignKey(e => e.InvitationId)
				.OnDelete(DeleteBehavior.Cascade);

			entity.HasOne(e => e.Profile)
				.WithMany()
				.HasForeignKey(e => e.ProfileId)
				.OnDelete(DeleteBehavior.Restrict);
		});

		// Partial indexes to favor active rows without enforcing global filters
		modelBuilder.Entity<User>()
			.HasIndex(u => u.Email)
			.HasDatabaseName("ix_users_email_active")
			.HasFilter("\"is_deleted\" = false");

		modelBuilder.Entity<Tenant>()
			.HasIndex(t => t.Code)
			.HasDatabaseName("ix_tenants_code_active")
			.HasFilter("\"is_deleted\" = false");

		modelBuilder.Entity<UserAccount>()
			.HasIndex(u => new { u.UserId, u.Scope })
			.HasDatabaseName("ix_user_accounts_user_id_account_type_active")
			.HasFilter("\"is_deleted\" = false AND \"is_suspended\" = false");

		// Keyset pagination indexes for staff profiles
		// Supports efficient sorting by Name with Id as tie-breaker
		modelBuilder.Entity<Profile>()
			.HasIndex(p => new { p.Scope, p.Name, p.Id })
			.HasDatabaseName("ix_profiles_staff_name_id")
			.HasFilter("\"scope\" = 0");

		// Supports efficient sorting by CreatedAt with Id as tie-breaker
		modelBuilder.Entity<Profile>()
			.HasIndex(p => new { p.Scope, p.CreatedAt, p.Id })
			.HasDatabaseName("ix_profiles_staff_created_at_id")
			.HasFilter("\"scope\" = 0");

		// Apply matching query filters to ensure consistent filtering
		if (TenantId != null) {
			// UserAccountProfile gets a filter that matches the Profile's tenant
			// This ensures both entities in the relationship are filtered consistently
			modelBuilder.Entity<UserAccountProfile>()
				.HasQueryFilter(uap => uap.Profile.TenantId == TenantId);
		}

		// Configure other entities with generic approach
		foreach (var entityType in modelBuilder.Model.GetEntityTypes()) {
			// Skip UserAccountProfile - it's already configured above with custom query filter
			// UserAccountProfile implements INoTenantEntity but needs tenant filtering through Profile.TenantId
			// Without this check, it would be processed as a regular INoTenantEntity (no filtering)
			// or potentially cause duplicate entity configuration issues
			if (entityType.ClrType == typeof(UserAccountProfile)) {
				continue;
			}

			if (typeof(ITenantEntity).IsAssignableFrom(entityType.ClrType)) {
				modelBuilder.Entity(entityType.ClrType);

				if (TenantId != null) {
					// Dynamically apply query filter for tenant-filtered entities
					var parameter = Expression.Parameter(entityType.ClrType, "x");
					var tenantIdProperty = Expression.Property(parameter, nameof(TenantId));
					var tenantIdConstant = Expression.Constant(TenantId);
					var equalExpression = Expression.Equal(tenantIdProperty, tenantIdConstant);
					var lambda = Expression.Lambda(equalExpression, parameter);

					// Apply the query filter
					modelBuilder.Entity(entityType.ClrType)
						.HasQueryFilter(lambda);
				}
			} else if (typeof(IOptionalTenantEntity).IsAssignableFrom(entityType.ClrType)) {
				// Set table name for optional tenant entities (no automatic filtering)
				modelBuilder.Entity(entityType.ClrType);
			} else if (typeof(INoTenantEntity).IsAssignableFrom(entityType.ClrType)) {
				// Set table name for non-tenant-filtered entities
				modelBuilder.Entity(entityType.ClrType);
			} else {
				throw new Exception(
					$"{entityType.ClrType.Name} must implement {nameof(ITenantEntity)}, {nameof(IOptionalTenantEntity)}, or {nameof(INoTenantEntity)}"
				);
			}

			// Configure UUID v7 auto-generation for entities with Guid Id (inheriting from BaseAttributes)
			if (typeof(BaseAttributes).IsAssignableFrom(entityType.ClrType)) {
				modelBuilder.Entity(entityType.ClrType)
					.Property("Id")
					.HasDefaultValueSql("uuidv7()");
			}
		}
	}

	#region Audit Tracking - SaveChanges Overrides

	/// <summary>
	/// Automatically handles audit field updates for all entities.
	/// </summary>
	public override int SaveChanges() {
		UpdateAuditFields();
		return base.SaveChanges();
	}

	/// <summary>
	/// Automatically handles audit field updates for all entities.
	/// </summary>
	public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) {
		UpdateAuditFields();
		return await base.SaveChangesAsync(cancellationToken);
	}

	private readonly HashSet<object> _forceHardDeleteEntities = new();

	/// <summary>
	/// Updates audit fields based on entity state: Added (CreatedAt, UpdatedAt), Modified (UpdatedAt), Deleted (soft delete).
	/// </summary>
	private void UpdateAuditFields() {
		var entries = ChangeTracker.Entries()
			.Where(e => e.State == EntityState.Added || e.State == EntityState.Modified || e.State == EntityState.Deleted);

		foreach (var entry in entries) {
			// Handle BaseAttributesNoKey entities
			if (entry.Entity is BaseAttributesNoKey baseEntity) {
				var now = DateTime.UtcNow;

				switch (entry.State) {
					case EntityState.Added:
						baseEntity.CreatedAt = now;
						baseEntity.UpdatedAt = now;
						baseEntity.IsDeleted = false;
						baseEntity.DeletedAt = null;
						break;

					case EntityState.Modified:
						baseEntity.UpdatedAt = now;
						break;

					case EntityState.Deleted:
						// Check if this is a forced hard delete
						if (_forceHardDeleteEntities.Contains(entry.Entity)) {
							// Allow actual deletion - don't convert to soft delete
							_forceHardDeleteEntities.Remove(entry.Entity);
							continue;
						}

						// Default behavior: convert to soft delete
						entry.State = EntityState.Modified;
						baseEntity.IsDeleted = true;
						baseEntity.DeletedAt = now;
						baseEntity.UpdatedAt = now;
						break;
				}
			}
			// Handle Permission record (has audit properties but doesn't inherit from BaseAttributesNoKey)
			else if (entry.Entity is Permission permission) {
				var now = DateTime.UtcNow;

				switch (entry.State) {
					case EntityState.Added:
						permission.CreatedAt = now;
						permission.UpdatedAt = now;
						permission.IsDeleted = false;
						permission.DeletedAt = null;
						break;

					case EntityState.Modified:
						permission.UpdatedAt = now;
						break;

					case EntityState.Deleted:
						// Check if this is a forced hard delete
						if (_forceHardDeleteEntities.Contains(entry.Entity)) {
							// Allow actual deletion - don't convert to soft delete
							_forceHardDeleteEntities.Remove(entry.Entity);
							continue;
						}

						// Default behavior: convert to soft delete
						entry.State = EntityState.Modified;
						permission.IsDeleted = true;
						permission.DeletedAt = now;
						permission.UpdatedAt = now;
						break;
				}
			}
		}
	}

	/// <summary>
	/// Forces a hard delete (permanent removal) instead of soft delete.
	/// Use with caution as this bypasses audit tracking.
	/// </summary>
	public void ForceHardDelete<TEntity>(TEntity entity) where TEntity : class {
		_forceHardDeleteEntities.Add(entity);
		Remove(entity);
	}

	/// <summary>
	/// Forces hard delete for multiple entities.
	/// </summary>
	public void ForceHardDeleteRange<TEntity>(IEnumerable<TEntity> entities) where TEntity : class {
		foreach (var entity in entities) {
			ForceHardDelete(entity);
		}
	}

	#endregion
}
