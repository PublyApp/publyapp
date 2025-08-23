using MainApi.Src.Data;
using MongoDB.Bson.Serialization.Attributes;

namespace MainApi.Src.Features.Tenant.Product;

public class Product : BaseAttributes, ITenantEntity
{
	[BsonElement("name")]
	public string? Name { get; set; }

	[BsonElement("description")]
	public string? Description { get; set; }

	[BsonElement("price")]
	public decimal? Price { get; set; }

	[BsonElement("tenantId")]
	public string TenantId { get; set; } = string.Empty;
}
