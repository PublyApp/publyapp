using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Users.Entities;

/// <summary>
/// Active membership between a user account and a role.
/// </summary>
/// <remarks>
/// This is intentionally a pure junction entity: the composite key is the identity,
/// and unassigning a role hard-deletes the row. Historical assignment data belongs
/// in audit logs, not in inactive junction rows.
/// `UserAccountId` and `RoleId` are foreign keys and together form the composite
/// primary key. They are not a surrogate row id.
/// </remarks>
[Table("user_account_roles")]
public class UserAccountRole : INoTenantEntity {
	// Foreign key to user_accounts.id; first half of the composite primary key.
	[Column("user_account_id")]
	public Guid UserAccountId { get; set; }

	private UserAccount? _UserAccount;
	[JsonIgnore]
	public UserAccount UserAccount {
		get {
			return RequiredNavigation.Get(
				this._UserAccount,
				nameof(UserAccountRole),
				nameof(this.UserAccount)
			);
		}
		set { this._UserAccount = value; }
	}

	// Foreign key to roles.id; second half of the composite primary key.
	[Column("role_id")]
	public Guid RoleId { get; set; }

	private PublyApp.Api.Modules.Roles.Entities.Role? _Role;
	[JsonIgnore]
	public PublyApp.Api.Modules.Roles.Entities.Role Role {
		get {
			return RequiredNavigation.Get(
				this._Role,
				nameof(UserAccountRole),
				nameof(this.Role)
			);
		}
		set { this._Role = value; }
	}

	// Keep assignment timestamps because role-user lists sort by when the link was created.
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	// UpdatedAt is retained for consistency with other composite-key junction tables.
	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
