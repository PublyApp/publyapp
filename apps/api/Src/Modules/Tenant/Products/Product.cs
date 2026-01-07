using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

namespace MainApi.Src.Modules.Tenant.Products;

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
