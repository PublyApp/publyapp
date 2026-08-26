using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Users.Entities;

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
	// Default closed: normal onboarding flows must explicitly activate the identity.
	// This avoids accidentally granting access when a new User is built without a status.
	public UserStatus Status { get; set; } = UserStatus.Suspended;

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
	public ICollection<PublyApp.Api.Modules.Auth.Entities.Session> Sessions { get; set; } = [];

	public static string GetStatusDescription(UserStatus status) {
		return status switch {
			UserStatus.Suspended => nameof(UserStatus.Suspended),
			UserStatus.Active => nameof(UserStatus.Active),
			_ => "Unknown",
		};
	}

	public static UserStatus? ParseStatus(string statusString) {
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

	public bool IsSuspended() {
		return IsSuspended(Status);
	}

	public bool IsActive() {
		return IsActive(Status);
	}

	public static bool IsSuspended(UserStatus status) {
		return status == UserStatus.Suspended;
	}

	public static bool IsActive(UserStatus status) {
		return status == UserStatus.Active;
	}
}

[JsonConverter(typeof(JsonStringEnumConverter<UserStatus>))]
public enum UserStatus {
	Suspended = 30,
	Active = 40,
}
