using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using CommonTenant = MainApi.Src.Features.Common.Tenant;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Tenant.Product;

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
	public CommonTenant.Tenant Tenant { get; set; } = null!;
}
