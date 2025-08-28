namespace MainApi.Src.Data.DbContext;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

public class TenantExtension : IDbContextOptionsExtension
{
	public string? TenantId { get; set; }

	public void ApplyServices(IServiceCollection services)
	{
		// No additional services needed
	}

	public void Validate(IDbContextOptions options)
	{
		// Validation if needed
	}

	public DbContextOptionsExtensionInfo Info => new ExtensionInfo(this);

	private sealed class ExtensionInfo : DbContextOptionsExtensionInfo
	{
		public ExtensionInfo(IDbContextOptionsExtension extension) : base(extension) { }

		public override bool IsDatabaseProvider => false;
		public override string LogFragment => $"TenantId={((TenantExtension)Extension).TenantId}";

		public override int GetServiceProviderHashCode() => 0;
		public override bool ShouldUseSameServiceProvider(DbContextOptionsExtensionInfo other) => true;
		public override void PopulateDebugInfo(IDictionary<string, string> debugInfo)
				=> debugInfo[$"Tenant:{nameof(TenantId)}"] = ((TenantExtension)Extension).TenantId ?? "(null)";
	}
}

public static class UseTenantIdExtension
{
	public static DbContextOptionsBuilder UseTenantId(
			this DbContextOptionsBuilder optionsBuilder,
			string tenantId)
	{
		var extension = optionsBuilder.Options.FindExtension<TenantExtension>()
				?? new TenantExtension();

		extension.TenantId = tenantId;
		((IDbContextOptionsBuilderInfrastructure)optionsBuilder).AddOrUpdateExtension(extension);

		return optionsBuilder;
	}
}
