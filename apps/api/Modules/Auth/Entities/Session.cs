using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

using UserEntity = PublyApp.Api.Modules.Users.Entities.User;

namespace PublyApp.Api.Modules.Auth.Entities;

[Table("sessions")]
[Index(nameof(Session.Token), IsUnique = true)]
[Index(nameof(Session.ExpiresAt), nameof(Session.Id), Name = "ix_sessions_expires_at_id")]
public class Session : INoTenantEntity {
	private UserEntity? _User;

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
		get { return RequiredNavigation.Get(this._User, nameof(Session), nameof(this.User)); }
		set { this._User = value; }
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
		return this.IsImpersonation
			&& this.ImpersonationExpiresAt is not null
			&& this.ImpersonationExpiresAt.Value > DateTime.UtcNow;
	}
}
