namespace MainApi.Src.Features.Common.Session;

using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MainApi.Src.Data;

public class Session : BaseAttributes, INoTenantFilter
{
    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("token")]
    public string Token { get; set; } = string.Empty;

    [BsonElement("_expires_at")]
    public DateTime? ExpiresAt { get; set; }

		public static string CollectionName { get; } = "_Session";
}
