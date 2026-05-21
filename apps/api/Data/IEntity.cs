using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Data;

public interface IEntity {
}

public interface ITenantEntity : IEntity {
	[Column("tenant_id")]
	Guid TenantId { get; set; }
}

public interface IOptionalTenantEntity : IEntity {
	[Column("tenant_id")]
	Guid? TenantId { get; set; }
}

public interface INoTenantEntity : IEntity {
}
