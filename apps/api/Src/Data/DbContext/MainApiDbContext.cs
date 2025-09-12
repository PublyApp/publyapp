namespace MainApi.Src.Data.DbContext;

using System.Linq.Expressions;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Tenant.Product;
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
	public DbSet<UserAccountStaff> UserAccountStaff { get; init; }
	public DbSet<UserAccountTenant> UserAccountTenant { get; init; }
	public DbSet<Tenant> Tenant { get; init; }
	public DbSet<ProfileStaff> ProfileStaff { get; init; }
	public DbSet<ProfileTenant> ProfileTenant { get; init; }

	public Guid? TenantId { get; set; }

	public MainApiDbContext(DbContextOptions options) : base(options)
	{
		var extension = options.FindExtension<TenantExtension>();
		TenantId = extension?.TenantId;
	}

	protected override void OnModelCreating(ModelBuilder modelBuilder)
	{
		base.OnModelCreating(modelBuilder);

		// Configure PostgreSQL table names and relationships
		foreach (var entityType in modelBuilder.Model.GetEntityTypes())
		{
			string tableName = entityType.ClrType.Name.ToLower();

			// Check if the entity has a static TableName field
			var tableNameField = entityType.ClrType.GetField("TableName",
				System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);

			if (tableNameField != null && tableNameField.FieldType == typeof(string))
			{
				var staticTableName = tableNameField.GetValue(null) as string;
				if (!string.IsNullOrEmpty(staticTableName))
				{
					tableName = staticTableName;
				}
			}

			if (typeof(ITenantEntity).IsAssignableFrom(entityType.ClrType))
			{
				modelBuilder.Entity(entityType.ClrType)
					.ToTable(tableName);

				// Configure tenant ID as foreign key
				modelBuilder.Entity(entityType.ClrType)
					.HasOne(typeof(Tenant))
					.WithMany()
					.HasForeignKey("TenantId")
					.OnDelete(DeleteBehavior.Restrict);

				if (TenantId != null)
				{
					// Dynamically apply query filter for tenant-filtered entities
					var parameter = Expression.Parameter(entityType.ClrType, "x");
					var tenantIdProperty = Expression.Property(parameter, "TenantId");
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
				modelBuilder.Entity(entityType.ClrType).ToTable(tableName);
			}
			else
			{
				throw new Exception(
						$"{entityType.ClrType.Name} must implement {nameof(ITenantEntity)} or {nameof(INoTenantEntity)}");
			}
		}
	}
}
