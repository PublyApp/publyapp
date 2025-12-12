using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

namespace MainApi.Src.Modules.Shared.Profiles;

/// <summary>
/// Unified profile table for all scopes (Staff, Tenant, Project)
/// </summary>
[Table("profiles")]
public class Profile : BaseAttributes, IOptionalTenantEntity {
	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff profiles
	[JsonIgnore]
	public Tenants.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant profiles
	[JsonIgnore]
	public Projects.Project? Project { get; set; }

	[Column("name")]
	public string Name { get; set; } = string.Empty;

	[Column("description")]
	public string? Description { get; set; }

	[Column("scope")]
	public ProfileScope Scope { get; set; }

	// Computed properties for easy identification
	public bool IsStaffProfile => Scope == ProfileScope.Staff && TenantId == null && ProjectId == null;
	public bool IsTenantProfile => Scope == ProfileScope.Tenant && TenantId != null && ProjectId == null;
	public bool IsProjectProfile => Scope == ProfileScope.Project && TenantId != null && ProjectId != null;

	// Factory methods for type-safe creation
	public static Profile CreateStaffProfile(string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			Scope = ProfileScope.Staff,
			TenantId = null,
			ProjectId = null
		};
	}

	public static Profile CreateTenantProfile(Guid tenantId, string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			Scope = ProfileScope.Tenant,
			TenantId = tenantId,
			ProjectId = null
		};
	}

	public static Profile CreateProjectProfile(Guid tenantId, Guid projectId, string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			Scope = ProfileScope.Project,
			TenantId = tenantId,
			ProjectId = projectId
		};
	}

	// Validation
	public void ValidateProfileType() {
		switch (Scope) {
			case ProfileScope.Staff:
				if (TenantId != null || ProjectId != null) {
					throw new InvalidOperationException("Staff profiles cannot have TenantId or ProjectId");
				}
				break;
			case ProfileScope.Tenant:
				if (TenantId == null || ProjectId != null) {
					throw new InvalidOperationException("Tenant profiles must have TenantId but not ProjectId");
				}
				break;
			case ProfileScope.Project:
				if (TenantId == null || ProjectId == null) {
					throw new InvalidOperationException("Project profiles must have both TenantId and ProjectId");
				}
				break;
		}
	}

	// navigation properties
	[JsonIgnore]
	public ICollection<MainApi.Src.Modules.Shared.Users.UserAccountProfile> UserAccountProfiles { get; set; } = [];
	[JsonIgnore]
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];
}

public enum ProfileScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
