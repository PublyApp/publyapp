using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

using Microsoft.EntityFrameworkCore;

using UserEntity = MainApi.Src.Modules.Users.Entities.User;

namespace MainApi.Src.Modules.Auth.Entities;

[Table("sessions")]
[Index(nameof(Token), IsUnique = true)]
[Index(nameof(ExpiresAt))]
public class Session : BaseAttributes, INoTenantEntity {
	[Column("user_id")]
	public required Guid UserId { get; set; }

	[JsonIgnore]
	public UserEntity User { get; set; } = null!;

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
