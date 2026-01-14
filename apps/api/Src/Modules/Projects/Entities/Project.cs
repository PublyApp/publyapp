using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Projects.Entities;

[Table("projects")]
[Index(nameof(TenantId), nameof(Name), IsUnique = true)]
public class Project : BaseAttributes, ITenantEntity {
	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public MainApi.Src.Modules.Tenants.Entities.Tenant Tenant { get; set; } = null!;

	[Column("name")]
	public required string Name { get; set; }

	[Column("description")]
	public string? Description { get; set; }

	[Column("brand_identity")]
	public string? BrandIdentity { get; set; } // JSON or text field for brand info

	[Column("is_active")]
	public bool IsActive { get; set; } = true;

	// Navigation properties
	[JsonIgnore]
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	[JsonIgnore]
	public ICollection<Profile> Profiles { get; set; } = [];
}
