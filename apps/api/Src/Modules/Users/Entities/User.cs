using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Users.Entities;

[Table("users")]
[Index(nameof(Email), IsUnique = true)]
public class User : BaseAttributes, INoTenantEntity {
	[Column("last_name")]
	public string? LastName { get; set; }

	[Column("first_name")]
	public string? FirstName { get; set; }

	private string _email = string.Empty;

	[Column("email")]
	[EmailAddress]
	public required string Email {
		get { return _email; }
		set { _email = value.ToLowerInvariant(); }
	}

	[Column("password")]
	public required string Password { get; set; } = string.Empty;

	[Column("avatar_url")]
	public string? AvatarUrl { get; set; }

	[Column("status")]
	// Global identity lifecycle. Suspended here dominates all staff/tenant/project memberships.
	public UserStatus Status { get; set; } = UserStatus.Pending;

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
	public ICollection<MainApi.Src.Modules.Auth.Entities.Session> Sessions { get; set; } = [];

	public static string GetStatusDescription(UserStatus status) {
		return status switch {
			UserStatus.Pending => nameof(UserStatus.Pending),
			UserStatus.Suspended => nameof(UserStatus.Suspended),
			UserStatus.Active => nameof(UserStatus.Active),
			_ => "Unknown",
		};
	}

	public static UserStatus? ParseStatus(string statusString) {
		var isPending = string.Equals(
			statusString,
			nameof(UserStatus.Pending),
			StringComparison.OrdinalIgnoreCase
		);
		if (isPending) {
			return UserStatus.Pending;
		}
		var isSuspended = string.Equals(
			statusString,
			nameof(UserStatus.Suspended),
			StringComparison.OrdinalIgnoreCase
		);
		if (isSuspended) {
			return UserStatus.Suspended;
		}
		var isActive = string.Equals(
			statusString,
			nameof(UserStatus.Active),
			StringComparison.OrdinalIgnoreCase
		);
		if (isActive) {
			return UserStatus.Active;
		}
		return null;
	}

	public bool IsPending() {
		return IsPending(Status);
	}

	public bool IsSuspended() {
		return IsSuspended(Status);
	}

	public bool IsActive() {
		return IsActive(Status);
	}

	public static bool IsPending(UserStatus status) {
		return status == UserStatus.Pending;
	}

	public static bool IsSuspended(UserStatus status) {
		return status == UserStatus.Suspended;
	}

	public static bool IsActive(UserStatus status) {
		return status == UserStatus.Active;
	}
}

public enum UserStatus {
	Pending = 20,
	Suspended = 30,
	Active = 40,
}
