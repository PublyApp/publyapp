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

public class MainApiDbContext : DbContext
{
	private static MainApiDbContext? _singleton = null;

	public static void SetSingleTon(MainApiDbContext context)
	{
		_singleton = context;
	}

	public static MainApiDbContext GetSingleTon()
	{
		if (_singleton is null)
		{
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

	public MainApiDbContext(DbContextOptions options) : base(options)
	{
		var extension = options.FindExtension<TenantExtension>();
		TenantId = extension?.TenantId;
	}

	protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
	{
		base.OnConfiguring(optionsBuilder);

		// EF Core 9: Define seeding logic here
		optionsBuilder.UseSeeding((context, _) =>
		{
			var dbContext = (MainApiDbContext)context;
			SeedPermissions(dbContext);
		});
	}

	protected override void OnModelCreating(ModelBuilder modelBuilder)
	{
		base.OnModelCreating(modelBuilder);

		// Apply matching query filters to ensure consistent filtering
		if (TenantId != null)
		{
			// UserAccountProfile gets a filter that matches the Profile's tenant
			// This ensures both entities in the relationship are filtered consistently
			modelBuilder.Entity<UserAccountProfile>()
				.HasQueryFilter(uap => uap.Profile.TenantId == TenantId);
		}

		// Configure other entities with generic approach
		foreach (var entityType in modelBuilder.Model.GetEntityTypes())
		{
			// Skip entities we've already configured specifically
			if (entityType.ClrType == typeof(UserAccountProfile))
			{
				continue;
			}

			if (typeof(ITenantEntity).IsAssignableFrom(entityType.ClrType))
			{
				modelBuilder.Entity(entityType.ClrType);

				if (TenantId != null)
				{
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
			}
			else if (typeof(INoTenantEntity).IsAssignableFrom(entityType.ClrType))
			{
				// Set table name for non-tenant-filtered entities
				modelBuilder.Entity(entityType.ClrType);
			}
			else
			{
				throw new Exception(
						$"{entityType.ClrType.Name} must implement {nameof(ITenantEntity)} or {nameof(INoTenantEntity)}");
			}
		}
	}

	private static void SeedPermissions(MainApiDbContext dbContext)
	{
		// Check if any permissions already exist to prevent duplicates
		if (!dbContext.Permission.Any())
		{
			var permissions = GetPermissionsFromEnum();
			dbContext.Permission.AddRange(permissions);
			dbContext.SaveChanges();
		}
	}

	private static List<Permission> GetPermissionsFromEnum()
	{
		// Get all permission objects from PermissionEnum using reflection
		var staffEnumType = typeof(PermissionEnum.Staff);
		var tenantEnumType = typeof(PermissionEnum.Tenant);
		var staffFields = staffEnumType.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
		var tenantFields = tenantEnumType.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);

		var permissions = new List<Permission>();

		foreach (var field in staffFields)
		{
			if (field.FieldType == typeof(Permission))
			{
				var permission = (Permission)field.GetValue(null)!;
				permissions.Add(permission);
			}
		}
		foreach (var field in tenantFields)
		{
			if (field.FieldType == typeof(Permission))
			{
				var permission = (Permission)field.GetValue(null)!;
				permissions.Add(permission);
			}
		}

		return permissions;
	}
}
