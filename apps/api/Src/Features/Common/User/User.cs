using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Features.Common.Account;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.User;

[Table("users")]
[Index(nameof(Email), IsUnique = true)]
public class User : BaseAttributes, INoTenantEntity {
	[Column("last_name")]
	public string? LastName { get; set; } = string.Empty;

	[Column("first_name")]
	public string? FirstName { get; set; }

	private string _email = string.Empty;

	[Column("email")]
	[EmailAddress]
	public required string Email {
		get { return _email; }
		set { _email = value.ToLower(); }
	}

	[Column("password")]
	public required string Password { get; set; } = string.Empty;

	[Column("avatar_url")]
	public string? AvatarUrl { get; set; }

	[Column("status")]
	public UserStatus Status { get; set; } = UserStatus.Inactive;

	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	[Column("is_verified")]
	public bool IsVerified { get; set; } = false;

	[Column("email_verify_token")]
	public string? EmailVerifyToken { get; set; }

	[Column("email_verify_token_expires_at")]
	public DateTime? EmailVerifyTokenExpiresAt { get; set; }

	[Column("password_reset_token")]
	public string? PasswordResetToken { get; set; }

	[Column("password_reset_token_expires_at")]
	public DateTime? PasswordResetTokenExpiresAt { get; set; }

	// Navigation properties
	[JsonIgnore]
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	[JsonIgnore]
	public ICollection<Session.Session> Sessions { get; set; } = [];

	public static string GetStatusDescription(UserStatus status) {
		return status switch {
			UserStatus.Inactive => "Inactive",
			UserStatus.Pending => "Pending",
			UserStatus.Suspended => "Suspended",
			UserStatus.Active => "Active",
			UserStatus.Deleted => "Deleted",
			_ => "Unknown",
		};
	}
}

public enum UserStatus {
	Inactive = 10,
	Pending = 20,
	Suspended = 30,
	Active = 40,
	Deleted = 50,
	Banned = 60,
}
