namespace MainApi.Src.Features.Common.Profile;

using MainApi.Src.Data;
using MongoDB.Bson.Serialization.Attributes;

public class ProfileTenant : BaseAttributes, ITenantEntity
{
	[BsonElement("tenantId")]
	public string TenantId { get; set; } = string.Empty;

	[BsonElement("name")]
	public string? Name { get; set; }

	[BsonElement("description")]
	public string? Description { get; set; }

	[BsonElement("permissions")]
	public List<string>? Permissions { get; set; }

	public static readonly string CollectionName = "_ProfileTenant";
}
