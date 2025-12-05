using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Modules.Shared.Permissions;

namespace MainApi.Src.Modules.Shared.Profiles;

[Table("profile_permissions")]
[Index(nameof(ProfileId), nameof(PermissionKey))]
public class ProfilePermission : BaseAttributes, INoTenantEntity {
	[Column("profile_id")]
	public Guid ProfileId { get; set; }

	[Column("permission_key")]
	public string PermissionKey { get; set; } = string.Empty;

	// Navigation properties
	[JsonIgnore]
	public Permission Permission { get; set; } = null!;
}
