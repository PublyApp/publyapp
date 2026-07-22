using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Profiles.Entities;

/// <summary>
/// Unified profile table for all scopes (Staff, Tenant, Project)
/// </summary>
[Table("profiles")]
public class Profile : BaseAttributes, IOptionalTenantEntity {
	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff profiles
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant profiles
	[JsonIgnore]
	public PublyApp.Api.Modules.Projects.Entities.Project? Project { get; set; }

	[Column("name")]
	public string Name { get; set; } = string.Empty;

	[Column("description")]
	public string? Description { get; set; }

	[Column("icon")]
	public string? Icon { get; set; }

	[Column("tone")]
	public string? Tone { get; set; }

	[Column("scope")]
	public ProfileScope Scope { get; set; }

	[Column("is_default")]
	public bool IsDefault { get; set; }

	// Computed properties for easy identification
	public bool IsStaffProfile {
		get {
			return Scope == ProfileScope.Staff && TenantId is null && ProjectId is null;
		}
	}

	public bool IsTenantProfile {
		get {
			return Scope == ProfileScope.Tenant && TenantId is not null && ProjectId is null;
		}
	}

	public bool IsProjectProfile {
		get {
			return Scope == ProfileScope.Project && TenantId is not null && ProjectId is not null;
		}
	}

	// Factory methods for type-safe creation
	public static Profile CreateStaffProfile(string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			Scope = ProfileScope.Staff,
			IsDefault = false,
			TenantId = null,
			ProjectId = null
		};
	}

	public static Profile CreateTenantProfile(
		Guid tenantId,
		string name,
		string? description = null,
		bool isDefault = false
	) {
		return new Profile {
			Name = name,
			Description = description,
			Scope = ProfileScope.Tenant,
			IsDefault = isDefault,
			TenantId = tenantId,
			ProjectId = null
		};
	}

	public static Profile CreateProjectProfile(Guid tenantId, Guid projectId, string name, string? description = null) {
		return new Profile {
			Name = name,
			Description = description,
			Scope = ProfileScope.Project,
			IsDefault = false,
			TenantId = tenantId,
			ProjectId = projectId
		};
	}

	// Validation
	public void ValidateProfileType() {
		switch (Scope) {
			case ProfileScope.Staff:
				if (TenantId is not null || ProjectId is not null) {
					throw new InvalidOperationException("Staff profiles cannot have TenantId or ProjectId");
				}
				if (IsDefault) {
					throw new InvalidOperationException("Staff profiles cannot be default profiles");
				}
				break;
			case ProfileScope.Tenant:
				if (TenantId is null || ProjectId is not null) {
					throw new InvalidOperationException("Tenant profiles must have TenantId but not ProjectId");
				}
				break;
			case ProfileScope.Project:
				if (TenantId is null || ProjectId is null) {
					throw new InvalidOperationException("Project profiles must have both TenantId and ProjectId");
				}
				if (IsDefault) {
					throw new InvalidOperationException("Project profiles cannot be default profiles");
				}
				break;
			default:
				throw new ArgumentOutOfRangeException(
					nameof(Scope),
					Scope,
					$"Unhandled ProfileScope: {Scope}"
				);
		}
	}

	// navigation properties
	[JsonIgnore]
	public ICollection<PublyApp.Api.Modules.Users.Entities.UserAccountProfile> UserAccountProfiles { get; set; } = [];
	[JsonIgnore]
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];
}

public enum ProfileScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
