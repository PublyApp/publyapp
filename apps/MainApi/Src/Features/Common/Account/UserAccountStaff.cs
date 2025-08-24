namespace MainApi.Src.Features.Common.Account;

using MainApi.Src.Data;
using MongoDB.Bson.Serialization.Attributes;

public class UserAccountStaff : BaseAttributes, INoTenantEntity
{
	[BsonElement("userId")]
	public string? UserId { get; set; }

	[BsonElement("isSuspended")]
	public bool? IsSuspended { get; set; }

	[BsonElement("hierarchyLevel")]
	public AccountHierarchyLevel? HierarchyLevel { get; set; }

	public static readonly string CollectionName = "_UserAccountStaff";
}
