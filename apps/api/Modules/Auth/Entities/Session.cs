using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

using UserEntity = PublyApp.Api.Modules.Users.Entities.User;

namespace PublyApp.Api.Modules.Auth.Entities;

[Table("sessions")]
[Index(nameof(Token), IsUnique = true)]
[Index(nameof(ExpiresAt))]
public class Session : INoTenantEntity {
	private UserEntity? _user;

	[Key]
	[Column("id")]
	public Guid? Id { get; set; }

	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

	[Column("user_id")]
	public required Guid UserId { get; set; }

	[JsonIgnore]
	public UserEntity User {
		get { return RequiredNavigation.Get(_user, nameof(Session), nameof(User)); }
		set { _user = value; }
	}

	[Column("token")]
	public required string Token { get; set; } = string.Empty;

	[Column("expires_at")]
	public required DateTime ExpiresAt { get; set; }

	[Column("is_impersonation")]
	public bool IsImpersonation { get; set; } = false;

	[Column("impersonating_staff_user_id")]
	public Guid? ImpersonatingStaffUserId { get; set; }

	[JsonIgnore]
	public UserEntity? ImpersonatingStaffUser { get; set; }

	[Column("impersonation_reason")]
	public string? ImpersonationReason { get; set; }

	[Column("impersonation_expires_at")]
	public DateTime? ImpersonationExpiresAt { get; set; }

	public bool IsImpersonationValid() {
		return IsImpersonation
			&& ImpersonationExpiresAt is not null
			&& ImpersonationExpiresAt.Value > DateTime.UtcNow;
	}
}
