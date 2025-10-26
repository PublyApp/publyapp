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
	public Guid? Id { get; set; }

	/// <summary>
	/// Determines if this entity is new (not persisted to database) by checking if Id is null or empty.
	/// Since database generates UUID v7 null or empty Guid indicates it hasn't been saved yet.
	/// </summary>
	public bool IsNew() {
		return Id is null || Id == Guid.Empty;
	}

	/// <summary>
	/// Gets the Id value with null check. Throws InvalidOperationException if Id is null.
	/// This should be used when the entity is expected to be persisted (not new).
	/// </summary>
	public Guid GetRequiredId() {
		if (Id is null) {
			throw new InvalidOperationException($"Entity {GetType().Name} Id is null. Make sure the entity is saved before accessing Id.");
		}
		return Id.Value;
	}
}
