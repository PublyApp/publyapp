using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Profile;

/// <summary>
/// Unified profile table for all scopes (Staff, Tenant, Project)
/// </summary>
[Table("profiles")]
public class Profile : BaseAttributes, IOptionalTenantEntity {
	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff profiles
	[JsonIgnore]
	public Tenant.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant profiles
	[JsonIgnore]
	public Project.Project? Project { get; set; }

	[Column("name")]
	public string Name { get; set; } = string.Empty;

	[Column("description")]
	public string? Description { get; set; }

	[Column("profile_scope")]
	public ProfileScope ProfileScope { get; set; }

	// Computed properties for easy identification
	public bool IsStaffProfile => ProfileScope == ProfileScope.Staff && TenantId == null && ProjectId == null;
	public bool IsTenantProfile => ProfileScope == ProfileScope.Tenant && TenantId != null && ProjectId == null;
	public bool IsProjectProfile => ProfileScope == ProfileScope.Project && TenantId != null && ProjectId != null;

	// Factory methods for type-safe creation
	public static Profile CreateStaffProfile(string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			ProfileScope = ProfileScope.Staff,
			TenantId = null,
			ProjectId = null
		};
	}

	public static Profile CreateTenantProfile(Guid tenantId, string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			ProfileScope = ProfileScope.Tenant,
			TenantId = tenantId,
			ProjectId = null
		};
	}

	public static Profile CreateProjectProfile(Guid tenantId, Guid projectId, string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			ProfileScope = ProfileScope.Project,
			TenantId = tenantId,
			ProjectId = projectId
		};
	}

	// Validation
	public void ValidateProfileType() {
		switch (ProfileScope) {
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
	public ICollection<Account.UserAccountProfile> UserAccountProfiles { get; set; } = [];
	[JsonIgnore]
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];
}

public enum ProfileScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
