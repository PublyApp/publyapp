using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using ProfileEntity = MainApi.Src.Modules.Shared.Profiles.Profile;

namespace MainApi.Src.Modules.Shared.Invitations;

[Table("invitation_profiles")]
public class InvitationProfile : INoTenantEntity {
	[Column("invitation_id")]
	public required Guid InvitationId { get; set; }

	[JsonIgnore]
	[ForeignKey(nameof(InvitationId))]
	public Invitation Invitation { get; set; } = null!;

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

