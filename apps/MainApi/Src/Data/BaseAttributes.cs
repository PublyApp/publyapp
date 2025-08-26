namespace MainApi.Src.Data;

using MainApi.Src.Lib.Utils;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

public class BaseAttributes
{
	[BsonId]
	// [BsonRepresentation(BsonType.ObjectId)]
	public string? Id { get; set; } = CryptoUtils.NewObjectId();

	[BsonElement("createdAt")]
	public DateTime? CreatedAt { get; set; } = DateTime.UtcNow;

	[BsonElement("updatedAt")]
	public DateTime? UpdatedAt { get; set; } = DateTime.UtcNow;

	[BsonElement("isDeleted")]
	public bool? IsDeleted { get; set; }
}
