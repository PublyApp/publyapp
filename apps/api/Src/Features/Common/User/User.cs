using MainApi.Src.Data;
using MongoDB.Bson.Serialization.Attributes;

namespace MainApi.Src.Features.Common.User;

public class User : BaseAttributes, INoTenantEntity
{
	[BsonElement("email")]
	public string? Email { get; set; }

	[BsonElement("password")]
	public string? Password { get; set; }

	[BsonElement("isSuspended")]
	public bool? IsSuspended { get; set; }

	[BsonElement("isVerified")]
	public bool? IsVerified { get; set; }

	public static readonly string CollectionName = "_User";
}
