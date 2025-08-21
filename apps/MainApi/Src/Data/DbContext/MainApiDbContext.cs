namespace MainApi.Src.Data.DbContext;

using System.Linq.Expressions;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Tenant.Product;
using Microsoft.EntityFrameworkCore;
using MongoDB.EntityFrameworkCore.Extensions;

public class MainApiDbContext : DbContext
{
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

		public string? TenantId { get; set; }

    public MainApiDbContext(DbContextOptions options) : base(options)
    {
        var extension = options.FindExtension<MongoDbContextOptionsExtension>();
        TenantId = extension?.TenantId;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

				// from mongo example
				// modelBuilder.Entity<Session>().ToCollection("_Session");
				// modelBuilder.Entity<Product>()
				// 	.ToCollection("Product")
				// 	.HasQueryFilter(x => x.TenantId == TenantId);

				 foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
			// #pragma warning disable IDE0150 // Prefer 'null' check over type check
			// if (collectionName is not string || string.IsNullOrEmpty(collectionName)) {
			// 						throw new Exception(
			// 							$"You haven't added the {nameof(ICollectionName)} to the entity {entityType.ClrType.Name}");
			// 					}
			// #pragma warning restore IDE0150 // Prefer 'null' check over type check
												string collectionName =
										entityType.ClrType.GetProperty("CollectionName")?.GetValue(entityType.ClrType) as string
											?? entityType.ClrType.Name;

			if (typeof(ITenantFilter).IsAssignableFrom(entityType.ClrType))
                {
                    modelBuilder.Entity(entityType.ClrType)
											.ToCollection(collectionName);

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
                }
                else if (typeof(INoTenantFilter).IsAssignableFrom(entityType.ClrType))
                {
                    // Set collection name for non-tenant-filtered entities
                    modelBuilder.Entity(entityType.ClrType).ToCollection(collectionName);
                }
                else
                {
                    throw new Exception(
                        $"You haven't added the {nameof(ITenantFilter)} or {nameof(INoTenantFilter)} to the entity {entityType.ClrType.Name}");
                }
            }
    }
}
