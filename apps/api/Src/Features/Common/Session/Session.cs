namespace MainApi.Src.Features.Common.Session;

using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Data;

[Table("sessions")]
public class Session : BaseAttributes, INoTenantEntity
{
	[Column("user_id")]
	public Guid UserId { get; set; }
	public User.User User { get; set; } = null!;

	[Column("token")]
	public string Token { get; set; } = string.Empty;

	[Column("expires_at")]
	public DateTime ExpiresAt { get; set; }
}
