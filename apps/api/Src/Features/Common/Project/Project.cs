using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Project;

[Table("projects")]
[Index(nameof(TenantId), nameof(Name), IsUnique = true)]
public class Project : BaseAttributes, ITenantEntity {
	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	public Tenant.Tenant Tenant { get; set; } = null!;

	[Column("name")]
	public required string Name { get; set; }

	[Column("description")]
	public string? Description { get; set; }

	[Column("brand_identity")]
	public string? BrandIdentity { get; set; } // JSON or text field for brand info

	[Column("is_active")]
	public bool IsActive { get; set; } = true;

	// Navigation properties
	public ICollection<UserProjectAccount> UserProjectAccounts { get; set; } = [];
	public ICollection<ProjectProfile> ProjectProfiles { get; set; } = [];
}
