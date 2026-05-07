using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.Profiles.Entities;

/// <summary>
/// Active permission membership for a profile.
/// </summary>
/// <remarks>
/// The row's existence is the assignment state. This keeps permission checks simple
/// and avoids reviving soft-deleted rows when admins toggle permissions repeatedly.
/// </remarks>
[Table("profile_permissions")]
public class ProfilePermission : INoTenantEntity {
	[Column("profile_id")]
	public Guid ProfileId { get; set; }

	[Column("permission_key")]
	public string PermissionKey { get; set; } = string.Empty;

	// Navigation properties
	[JsonIgnore]
	public Profile Profile { get; set; } = null!;

	[JsonIgnore]
	public Permission Permission { get; set; } = null!;

	// Permission assignment screens do not expose a row id, but timestamps remain useful
	// when correlating permission changes with audit-log events.
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	// UpdatedAt matches the InvitationProfile/UserAccountProfile timestamp shape.
	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
