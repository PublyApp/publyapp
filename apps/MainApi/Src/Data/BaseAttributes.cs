namespace MainApi.Src.Data;

using MongoDB.Bson.Serialization.Attributes;

public class BaseAttributes
{
    [BsonId]
    public string? Id { get; set; }

    [BsonElement("_created_at")]
    public DateTime? CreatedAt { get; set; }

    [BsonElement("_updated_at")]
    public DateTime? UpdatedAt { get; set; }
}
