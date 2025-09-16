namespace MainApi.Src.Data.DbContext;

using System.Linq.Expressions;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Lib.Filters;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Main database context with automatic audit tracking for all entities.
/// </summary>
public class MainApiDbContext : DbContext {
	private static MainApiDbContext? _singleton = null;

	public static void SetSingleTon(MainApiDbContext context) {
		_singleton = context;
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

	// Unified permission system entities
	public DbSet<Permission> Permission { get; init; }
	public DbSet<Profile> Profile { get; init; }
	public DbSet<ProfilePermission> ProfilePermission { get; init; }
	public DbSet<UserAccountProfile> UserAccountProfile { get; init; }

	// Unified account system
	public DbSet<UserAccount> UserAccount { get; init; }

	public Guid? TenantId { get; set; }

	public MainApiDbContext(DbContextOptions options) : base(options) {
		var extension = options.FindExtension<TenantExtension>();
		TenantId = extension?.TenantId;
	}

	protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) {
		base.OnConfiguring(optionsBuilder);

		// EF Core 9: Define seeding logic here
		optionsBuilder.UseSeeding((context, _) => {
			var dbContext = (MainApiDbContext)context;
			SeedPermissions(dbContext);
		});
	}

	protected override void OnModelCreating(ModelBuilder modelBuilder) {
		base.OnModelCreating(modelBuilder);

		// Database-level lowercase constraints
		modelBuilder.Entity<Tenant>()
			.ToTable(t => t.HasCheckConstraint("CK_Tenant_Code_Lowercase", "code = LOWER(code)"));

		modelBuilder.Entity<User>()
			.ToTable(t => t.HasCheckConstraint("CK_User_Email_Lowercase", "email = LOWER(email)"));

		// Apply matching query filters to ensure consistent filtering
		if (TenantId != null) {
			// UserAccountProfile gets a filter that matches the Profile's tenant
			// This ensures both entities in the relationship are filtered consistently
			modelBuilder.Entity<UserAccountProfile>()
				.HasQueryFilter(uap => uap.Profile.TenantId == TenantId);
		}

		// Configure other entities with generic approach
		foreach (var entityType in modelBuilder.Model.GetEntityTypes()) {
			// Skip entities we've already configured specifically
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
			} else if (typeof(INoTenantEntity).IsAssignableFrom(entityType.ClrType)) {
				// Set table name for non-tenant-filtered entities
				modelBuilder.Entity(entityType.ClrType);
			} else {
				throw new Exception(
						$"{entityType.ClrType.Name} must implement {nameof(ITenantEntity)} or {nameof(INoTenantEntity)}");
			}
		}
	}

	private static void SeedPermissions(MainApiDbContext dbContext) {
		// Check if any permissions already exist to prevent duplicates
		if (!dbContext.Permission.Any()) {
			var permissions = GetPermissionsFromEnum();
			dbContext.Permission.AddRange(permissions);
			dbContext.SaveChanges();
		}
	}

	private static List<Permission> GetPermissionsFromEnum() {
		// Get all permission objects from PermissionEnum using reflection
		var staffEnumType = typeof(PermissionEnum.Staff);
		var tenantEnumType = typeof(PermissionEnum.Tenant);
		var staffFields = staffEnumType.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
		var tenantFields = tenantEnumType.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);

		var permissions = new List<Permission>();

		foreach (var field in staffFields) {
			if (field.FieldType == typeof(Permission)) {
				var permission = (Permission)field.GetValue(null)!;
				permissions.Add(permission);
			}
		}
		foreach (var field in tenantFields) {
			if (field.FieldType == typeof(Permission)) {
				var permission = (Permission)field.GetValue(null)!;
				permissions.Add(permission);
			}
		}

		return permissions;
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
