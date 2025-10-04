using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Data;

/// <summary>
/// Base class for entities that need audit tracking without a primary key.
/// </summary>
public class BaseAttributesNoKey {
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

	[Column("is_deleted")]
	public bool IsDeleted { get; set; } = false;

	[Column("deleted_at")]
	public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Base class for entities that need audit tracking with a primary key.
/// </summary>
public class BaseAttributes : BaseAttributesNoKey {
	[Key]
	[Column("id")]
	public Guid Id { get; set; } = Guid.CreateVersion7();
}
