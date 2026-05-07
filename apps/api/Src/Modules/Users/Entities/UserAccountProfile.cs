using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

namespace MainApi.Src.Modules.Users.Entities;

/// <summary>
/// Active membership between a user account and a profile.
/// </summary>
/// <remarks>
/// This is intentionally a pure junction entity: the composite key is the identity,
/// and unassigning a profile hard-deletes the row. Historical assignment data belongs
/// in audit logs, not in inactive junction rows.
/// </remarks>
[Table("user_account_profiles")]
public class UserAccountProfile : INoTenantEntity {
	[Column("user_account_id")]
	public Guid UserAccountId { get; set; }

	[JsonIgnore]
	public UserAccount UserAccount { get; set; } = null!;

	[Column("profile_id")]
	public Guid ProfileId { get; set; }

	[JsonIgnore]
	public MainApi.Src.Modules.Profiles.Entities.Profile Profile { get; set; } = null!;

	// Keep assignment timestamps because profile-user lists sort by when the link was created.
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	// UpdatedAt is retained for consistency with other composite-key junction tables.
	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
