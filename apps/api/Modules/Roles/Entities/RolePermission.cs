using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Roles.Entities;

/// <summary>
/// Active permission membership for a role.
/// </summary>
/// <remarks>
/// The row's existence is the assignment state. This keeps permission checks simple
/// and avoids reviving soft-deleted rows when admins toggle permissions repeatedly.
/// `RoleId` and `PermissionKey` are foreign keys and together form the composite
/// primary key. They are not a surrogate row id.
/// </remarks>
[Table("role_permissions")]
public class RolePermission : INoTenantEntity {
	private Role? _Role;
	private Permission? _Permission;

	// Foreign key to roles.id; first half of the composite primary key.
	[Column("role_id")]
	public Guid RoleId { get; set; }

	// Foreign key to permissions.key; second half of the composite primary key.
	[Column("permission_key")]
	public string PermissionKey { get; set; } = string.Empty;

	// Navigation properties
	[JsonIgnore]
	public Role Role {
		get { return RequiredNavigation.Get(this._Role, nameof(RolePermission), nameof(this.Role)); }
		set { this._Role = value; }
	}

	[JsonIgnore]
	public Permission Permission {
		get { return RequiredNavigation.Get(this._Permission, nameof(RolePermission), nameof(this.Permission)); }
		set { this._Permission = value; }
	}

	// Permission assignment screens do not expose a row id, but timestamps remain useful
	// when correlating permission changes with audit-log events.
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	// UpdatedAt matches the InvitationRole/UserAccountRole timestamp shape.
	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
