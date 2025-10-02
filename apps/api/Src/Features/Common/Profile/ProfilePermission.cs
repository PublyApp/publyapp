using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Profile;

[Table("profile_permissions")]
public class ProfilePermission : BaseAttributes, INoTenantEntity {
	[Column("profile_id")]
	public Guid ProfileId { get; set; }

	[Column("permission_key")]
	public string PermissionKey { get; set; } = string.Empty;

	// Navigation properties
	[JsonIgnore]
	public Permission.Permission Permission { get; set; } = null!;
}
