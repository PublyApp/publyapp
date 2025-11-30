using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Modules.Tenant.Product;

[Table("products")]
public class Product : BaseAttributes, ITenantEntity {
	[Column("name")]
	public string? Name { get; set; }

	[Column("description")]
	public string? Description { get; set; }

	[Column("price")]
	public decimal Price { get; set; }

	[Column("tenant_id")]
	public Guid TenantId { get; set; }
	[JsonIgnore]
	public MainApi.Src.Modules.Shared.Tenants.Tenant Tenant { get; set; } = null!;
}
