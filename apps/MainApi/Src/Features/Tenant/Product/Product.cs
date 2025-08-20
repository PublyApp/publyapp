using MainApi.Src.Data;
using MongoDB.Bson.Serialization.Attributes;

namespace MainApi.Src.Features.Tenant.Product;

public class Product : BaseAttributes, ITenantFilter {
	[BsonElement("name")]
	public string? Name { get; set; }

	[BsonElement("description")]
	public string? Description { get; set; }

	[BsonElement("price")]
	public decimal? Price { get; set; }

	[BsonElement("_tenant_id")]
	public string? TenantId { get; set; }

	public static string CollectionName { get; } = "Product";
}
