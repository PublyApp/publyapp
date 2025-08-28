namespace MainApi.Src.Features.Common.Account;

using MainApi.Src.Data;
using MongoDB.Bson.Serialization.Attributes;

public class UserAccountTenant : BaseAttributes, ITenantEntity
{
	[BsonElement("userId")]
	public string? UserId { get; set; }

	[BsonElement("hierarchyLevel")]
	public AccountHierarchyLevel? HierarchyLevel { get; set; }

	[BsonElement("tenantId")]
	public string TenantId { get; set; } = string.Empty;

	public static readonly string CollectionName = "_UserAccountTenant";
}
