using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;
using MainApi.Src.Modules.Permissions.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Profiles.Entities;

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
