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

	[Column("status")]
	// Project lifecycle. Removing a project uses soft-delete audit fields, not Inactive.
	public ProjectStatus Status { get; set; } = ProjectStatus.Active;

	// Navigation properties
	[JsonIgnore]
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	[JsonIgnore]
	public ICollection<Profile> Profiles { get; set; } = [];

	public static string GetStatusDescription(ProjectStatus status) {
		return status switch {
			ProjectStatus.Active => nameof(ProjectStatus.Active),
			ProjectStatus.Inactive => nameof(ProjectStatus.Inactive),
			_ => "Unknown",
		};
	}

	public static ProjectStatus? ParseStatus(string statusString) {
		if (string.Equals(statusString, nameof(ProjectStatus.Active), StringComparison.OrdinalIgnoreCase)) {
			return ProjectStatus.Active;
		}
		if (string.Equals(statusString, nameof(ProjectStatus.Inactive), StringComparison.OrdinalIgnoreCase)) {
			return ProjectStatus.Inactive;
		}
		return null;
	}

	public bool IsActive() {
		return IsActive(Status);
	}

	public bool IsInactive() {
		return IsInactive(Status);
	}

	public static bool IsActive(ProjectStatus status) {
		return status == ProjectStatus.Active;
	}

	public static bool IsInactive(ProjectStatus status) {
		return status == ProjectStatus.Inactive;
	}
}

public enum ProjectStatus {
	Active = 10,
	Inactive = 20,
}
