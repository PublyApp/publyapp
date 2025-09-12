namespace MainApi.Src.Data;

using System.ComponentModel.DataAnnotations.Schema;

public interface IEntity
{
}

public interface ITenantEntity : IEntity
{
	[Column("tenant_id")]
	Guid TenantId { get; set; }
}

public interface INoTenantEntity : IEntity
{
}
