using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Features.Common.Account;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.User;

[Table("users")]
[Index(nameof(Email), IsUnique = true)]
public class User : BaseAttributes, INoTenantEntity {
	[Column("last_name")]
	public string LastName { get; set; } = string.Empty;

	[Column("first_name")]
	public string? FirstName { get; set; }

	private string _email = string.Empty;

	[Column("email")]
	[EmailAddress]
	public string Email {
		get { return _email; }
		set { _email = value.ToLower(); }
	}

	[Column("password")]
	public string Password { get; set; } = string.Empty;

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
