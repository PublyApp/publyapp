namespace MainApi.Src.Data;

using MongoDB.Bson.Serialization.Attributes;

public interface ITenantFilter
{
	[BsonElement("_tenant_id")]
    string? TenantId { get; set; }
}
