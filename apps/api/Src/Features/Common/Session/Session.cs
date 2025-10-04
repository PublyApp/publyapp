using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Session;

[Table("sessions")]
[Index(nameof(Token), IsUnique = true)]
[Index(nameof(ExpiresAt))]
public class Session : BaseAttributes, INoTenantEntity {
	[Column("user_id")]
	public required Guid UserId { get; set; }

	[JsonIgnore]
	public User.User User { get; set; } = null!;

	[Column("token")]
	public required string Token { get; set; } = string.Empty;

	[Column("expires_at")]
	public required DateTime ExpiresAt { get; set; }
}
