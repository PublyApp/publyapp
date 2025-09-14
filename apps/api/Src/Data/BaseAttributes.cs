namespace MainApi.Src.Data;

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

public class BaseAttributesNoKey
{
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

	[Column("is_deleted")]
	public bool IsDeleted { get; set; } = false;
}

public class BaseAttributes : BaseAttributesNoKey
{
	[Key]
	[Column("id")]
	public Guid Id { get; set; } = Guid.CreateVersion7();
}
