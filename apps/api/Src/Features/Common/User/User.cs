using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Features.Common.Account;

namespace MainApi.Src.Features.Common.User;

[Table("users")]
public class User : BaseAttributes, INoTenantEntity
{
	[Column("email")]
	public string? Email { get; set; }

	[Column("password")]
	public string? Password { get; set; }

	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	[Column("is_verified")]
	public bool IsVerified { get; set; } = false;

	[Column("email_verify_token")]
	public string? EmailVerifyToken { get; set; }

	[Column("email_verify_token_expires_at")]
	public DateTime? EmailVerifyTokenExpiresAt { get; set; }

	// Navigation properties
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	public ICollection<Session.Session> Sessions { get; set; } = [];
}
