namespace MainApi.Src.Data;

using MongoDB.Bson.Serialization.Attributes;

public interface IEntity
{
}

public interface ITenantEntity : IEntity
{
	[BsonElement("tenantId")]
    string? TenantId { get; set; }
}

public interface INoTenantEntity : IEntity
{
}
