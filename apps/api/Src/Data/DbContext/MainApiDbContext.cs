using System.Linq.Expressions;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Common.Project;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Tenant.Product;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Lib;

namespace MainApi.Src.Data.DbContext;

/// <summary>
/// Main database context with automatic audit tracking for all entities.
/// </summary>
public class MainApiDbContext : Microsoft.EntityFrameworkCore.DbContext {
	private static MainApiDbContext? _singleton = null;

	public static MainApiDbContext SingleTon {
		get {
			if (_singleton is null) {
				_singleton = new MainApiDbContext(
					new DbContextOptionsBuilder<MainApiDbContext>()
						.UseNpgsql(AppEnvironment.POSTGRES_CONNECTION_STRING)
						.Options
				);
			}
			return _singleton;
		}
	}

	public static MainApiDbContext GetSingleTon() {
		if (_singleton is null) {
			throw new Exception("You must call SetSingleTon before calling GetSingleTon");
		}

		return _singleton;
	}

	public DbSet<Session> Session { get; init; }
	public DbSet<Product> Product { get; init; }
	public DbSet<User> User { get; init; }
	public DbSet<Tenant> Tenant { get; init; }

	// Project system entities (still needed for Project entity)
	public DbSet<Project> Project { get; init; }

	// Unified permission system entities
	public DbSet<Permission> Permission { get; init; }
	public DbSet<Profile> Profile { get; init; }
	public DbSet<ProfilePermission> ProfilePermission { get; init; }
	public DbSet<UserAccountProfile> UserAccountProfile { get; init; }

	// Unified account system (handles Staff, Tenant, and Project accounts)
	public DbSet<UserAccount> UserAccount { get; init; }

	public Guid? TenantId { get; set; }

	public MainApiDbContext(DbContextOptions options) : base(options) {
		var extension = options.FindExtension<TenantExtension>();
		TenantId = extension?.TenantId;
	}

	protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) {
		base.OnConfiguring(optionsBuilder);

		// EF Core 9: Define seeding logic here
		// optionsBuilder.UseSeeding((context, _) => {
		// 	var dbContext = (MainApiDbContext)context;

		// 	if (dbContext is null) {
		// 		throw new Exception("dbContext is null");
		// 	}

		// 	Seeder.SeedAll(dbContext);
		// });

		// optionsBuilder.UseAsyncSeeding(async (context, _, cancellationToken) => {
		// 	var dbContext = (MainApiDbContext)context;

		// 	if (dbContext is null) {
		// 		throw new Exception("dbContext is null");
		// 	}

		// 	await Seeder.SeedAllAsync(dbContext);
		// });
	}

	protected override void OnModelCreating(ModelBuilder modelBuilder) {
		base.OnModelCreating(modelBuilder);

		// Database-level lowercase constraints
		modelBuilder.Entity<Tenant>()
			.ToTable(t => t.HasCheckConstraint("CK_Tenant_Code_Lowercase", "code = LOWER(code)"));

		modelBuilder.Entity<User>()
			.ToTable(t => t.HasCheckConstraint("CK_User_Email_Lowercase", "email = LOWER(email)"));

		// Database-level account type constraints
		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Staff_Constraints",
				"(account_scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR account_scope != 0"));

		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Tenant_Constraints",
				"(account_scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR account_scope != 1"));

		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Project_Constraints",
				"(account_scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR account_scope != 2"));

		// Database-level profile type constraints
		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Staff_Constraints",
				"(profile_scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR profile_scope != 0"));

		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Tenant_Constraints",
				"(profile_scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR profile_scope != 1"));

		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Project_Constraints",
				"(profile_scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR profile_scope != 2"));

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
			.HasIndex(u => new { u.UserId, u.AccountScope })
			.HasDatabaseName("ix_user_accounts_user_id_account_type_active")
			.HasFilter("\"is_deleted\" = false AND \"is_suspended\" = false");

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
						$"{entityType.ClrType.Name} must implement {nameof(ITenantEntity)}, {nameof(IOptionalTenantEntity)}, or {nameof(INoTenantEntity)}");
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
