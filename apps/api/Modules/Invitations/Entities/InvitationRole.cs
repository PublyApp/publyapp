using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

using RoleEntity = PublyApp.Api.Modules.Roles.Entities.Role;

namespace PublyApp.Api.Modules.Invitations.Entities;

/// <summary>
/// Active membership between an invitation and a role.
/// </summary>
/// <remarks>
/// `InvitationId` and `RoleId` are foreign keys and together form the composite
/// primary key. They are not surrogate row identifiers; no separate `Id` is needed.
/// </remarks>
[Table("invitation_roles")]
public class InvitationRole : INoTenantEntity {
	// Foreign key to invitations.id; first half of the composite primary key.
	[Column("invitation_id")]
	public required Guid InvitationId { get; set; }

	private Invitation? _Invitation;
	[JsonIgnore]
	[ForeignKey(nameof(InvitationRole.InvitationId))]
	public Invitation Invitation {
		get {
			return RequiredNavigation.Get(
				this._Invitation,
				nameof(InvitationRole),
				nameof(this.Invitation)
			);
		}
		set { this._Invitation = value; }
	}

	// Foreign key to roles.id; second half of the composite primary key.
	[Column("role_id")]
	public required Guid RoleId { get; set; }

	private RoleEntity? _Role;
	[JsonIgnore]
	[ForeignKey(nameof(InvitationRole.RoleId))]
	public RoleEntity Role {
		get {
			return RequiredNavigation.Get(
				this._Role,
				nameof(InvitationRole),
				nameof(this.Role)
			);
		}
		set { this._Role = value; }
	}

	// Timestamp columns (cannot inherit from BaseAttributes due to composite PK)
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
