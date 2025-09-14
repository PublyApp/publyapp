using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Account;

/// <summary>
/// Join table between user accounts and profiles
/// </summary>
[Table("user_account_profiles")]
public class UserAccountProfile : BaseAttributes, INoTenantEntity
{
	[Column("user_account_id")]
	public Guid UserAccountId { get; set; }
	public UserAccount UserAccount { get; set; } = null!;

	[Column("profile_id")]
	public Guid ProfileId { get; set; }
	public Profile.Profile Profile { get; set; } = null!;
}
