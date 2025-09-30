using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Profile;

/// <summary>
/// Unified profile table for all scopes (Staff, Tenant, Project)
/// </summary>
[Table("profiles")]
public class Profile : BaseAttributes, IOptionalTenantEntity {
	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff profiles
	public Tenant.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant profiles
	public Project.Project? Project { get; set; }

	[Column("name")]
	public string Name { get; set; } = string.Empty;

	[Column("description")]
	public string? Description { get; set; }

	[Column("profile_type")]
	public ProfileType ProfileType { get; set; }

	// Computed properties for easy identification
	public bool IsStaffProfile => ProfileType == ProfileType.Staff && TenantId == null && ProjectId == null;
	public bool IsTenantProfile => ProfileType == ProfileType.Tenant && TenantId != null && ProjectId == null;
	public bool IsProjectProfile => ProfileType == ProfileType.Project && TenantId != null && ProjectId != null;

	// Factory methods for type-safe creation
	public static Profile CreateStaffProfile(string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			ProfileType = ProfileType.Staff,
			TenantId = null,
			ProjectId = null
		};
	}

	public static Profile CreateTenantProfile(Guid tenantId, string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			ProfileType = ProfileType.Tenant,
			TenantId = tenantId,
			ProjectId = null
		};
	}

	public static Profile CreateProjectProfile(Guid tenantId, Guid projectId, string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			ProfileType = ProfileType.Project,
			TenantId = tenantId,
			ProjectId = projectId
		};
	}

	// Validation
	public void ValidateProfileType() {
		switch (ProfileType) {
			case ProfileType.Staff:
				if (TenantId != null || ProjectId != null) {
					throw new InvalidOperationException("Staff profiles cannot have TenantId or ProjectId");
				}
				break;
			case ProfileType.Tenant:
				if (TenantId == null || ProjectId != null) {
					throw new InvalidOperationException("Tenant profiles must have TenantId but not ProjectId");
				}
				break;
			case ProfileType.Project:
				if (TenantId == null || ProjectId == null) {
					throw new InvalidOperationException("Project profiles must have both TenantId and ProjectId");
				}
				break;
		}
	}

	// navigation properties
	public ICollection<Account.UserAccountProfile> UserAccountProfiles { get; set; } = [];
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];
}

public enum ProfileType {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
