using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Tenant.Product;

public class Product : BaseAttributes, ITenantEntity
{
	[Column("name")]
	public string? Name { get; set; }

	[Column("description")]
	public string? Description { get; set; }

	[Column("price")]
	public decimal Price { get; set; }

	[Column("tenant_id")]
	public Guid TenantId { get; set; }

	public static readonly string TableName = "products";
}
