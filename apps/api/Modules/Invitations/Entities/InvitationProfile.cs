using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Data;

using ProfileEntity = MainApi.Modules.Profiles.Entities.Profile;

namespace MainApi.Modules.Invitations.Entities;

/// <summary>
/// Active membership between an invitation and a profile.
/// </summary>
/// <remarks>
/// `InvitationId` and `ProfileId` are foreign keys and together form the composite
/// primary key. They are not surrogate row identifiers; no separate `Id` is needed.
/// </remarks>
[Table("invitation_profiles")]
public class InvitationProfile : INoTenantEntity {
	// Foreign key to invitations.id; first half of the composite primary key.
	[Column("invitation_id")]
	public required Guid InvitationId { get; set; }

	[JsonIgnore]
	[ForeignKey(nameof(InvitationId))]
	public Invitation Invitation { get; set; } = null!;

	// Foreign key to profiles.id; second half of the composite primary key.
	[Column("profile_id")]
	public required Guid ProfileId { get; set; }

	[JsonIgnore]
	[ForeignKey(nameof(ProfileId))]
	public ProfileEntity Profile { get; set; } = null!;

	// Timestamp columns (cannot inherit from BaseAttributes due to composite PK)
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

