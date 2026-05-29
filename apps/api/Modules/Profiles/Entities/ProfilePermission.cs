using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Data;
using MainApi.Modules.Permissions.Entities;

namespace MainApi.Modules.Profiles.Entities;

/// <summary>
/// Active permission membership for a profile.
/// </summary>
/// <remarks>
/// The row's existence is the assignment state. This keeps permission checks simple
/// and avoids reviving soft-deleted rows when admins toggle permissions repeatedly.
/// `ProfileId` and `PermissionKey` are foreign keys and together form the composite
/// primary key. They are not a surrogate row id.
/// </remarks>
[Table("profile_permissions")]
public class ProfilePermission : INoTenantEntity {
	private Profile? _profile;
	private Permission? _permission;

	// Foreign key to profiles.id; first half of the composite primary key.
	[Column("profile_id")]
	public Guid ProfileId { get; set; }

	// Foreign key to permissions.key; second half of the composite primary key.
	[Column("permission_key")]
	public string PermissionKey { get; set; } = string.Empty;

	// Navigation properties
	[JsonIgnore]
	public Profile Profile {
		get { return RequiredNavigation.Get(_profile, nameof(ProfilePermission), nameof(Profile)); }
		set { _profile = value; }
	}

	[JsonIgnore]
	public Permission Permission {
		get { return RequiredNavigation.Get(_permission, nameof(ProfilePermission), nameof(Permission)); }
		set { _permission = value; }
	}

	// Permission assignment screens do not expose a row id, but timestamps remain useful
	// when correlating permission changes with audit-log events.
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	// UpdatedAt matches the InvitationProfile/UserAccountProfile timestamp shape.
	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
