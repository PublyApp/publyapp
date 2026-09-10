using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

using ProfileEntity = PublyApp.Api.Modules.Profiles.Entities.Profile;

namespace PublyApp.Api.Modules.Invitations.Entities;

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

	private Invitation? _Invitation;
	[JsonIgnore]
	[ForeignKey(nameof(InvitationId))]
	public Invitation Invitation {
		get {
			return RequiredNavigation.Get(
				_Invitation,
				nameof(InvitationProfile),
				nameof(Invitation)
			);
		}
		set { _Invitation = value; }
	}

	// Foreign key to profiles.id; second half of the composite primary key.
	[Column("profile_id")]
	public required Guid ProfileId { get; set; }

	private ProfileEntity? _Profile;
	[JsonIgnore]
	[ForeignKey(nameof(ProfileId))]
	public ProfileEntity Profile {
		get {
			return RequiredNavigation.Get(
				_Profile,
				nameof(InvitationProfile),
				nameof(Profile)
			);
		}
		set { _Profile = value; }
	}

	// Timestamp columns (cannot inherit from BaseAttributes due to composite PK)
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
