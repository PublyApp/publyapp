using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Modules.Shared.Users;

/// <summary>
/// Join table between user accounts and profiles
/// </summary>
[Table("user_account_profiles")]
[Index(nameof(UserAccountId), nameof(ProfileId), IsUnique = true)]
public class UserAccountProfile : BaseAttributes, INoTenantEntity {
	[Column("user_account_id")]
	public Guid UserAccountId { get; set; }
	[JsonIgnore]
	public UserAccount UserAccount { get; set; } = null!;

	[Column("profile_id")]
	public Guid ProfileId { get; set; }
	[JsonIgnore]
	public MainApi.Src.Modules.Shared.Profiles.Profile Profile { get; set; } = null!;
}
