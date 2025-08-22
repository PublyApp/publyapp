namespace MainApi.Src.Data.DbContext;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;


public static class DbContextOptionsBuilderExtensions
{
	public static DbContextOptionsBuilder UseTenantId(
			this DbContextOptionsBuilder optionsBuilder,
			string tenantId)
	{
		var extension = optionsBuilder.Options.FindExtension<MongoDbContextOptionsExtension>()
				?? new MongoDbContextOptionsExtension();

		extension.TenantId = tenantId;
		((IDbContextOptionsBuilderInfrastructure)optionsBuilder).AddOrUpdateExtension(extension);

		return optionsBuilder;
	}
}
