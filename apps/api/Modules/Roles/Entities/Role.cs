using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Roles.Entities;

/// <summary>
/// Unified role table for all scopes (Staff, Tenant, Project)
/// </summary>
[Table("roles")]
public class Role : BaseAttributes, IOptionalTenantEntity {
	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff roles
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant roles
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
	public RoleScope Scope { get; set; }

	[Column("is_default")]
	public bool IsDefault { get; set; }

	// A system role that grants every permission in its scope. There is exactly one
	// per scope (staff, and one per tenant); it is seeded and cannot be edited or deleted.
	// PermissionService materialises the effective `*` for its holders, so no parallel
	// permission mechanism is needed.
	[Column("is_full_access")]
	public bool IsFullAccess { get; set; }

	// Computed properties for easy identification
	public bool IsStaffRole {
		get {
			return this.Scope == RoleScope.Staff && this.TenantId is null && this.ProjectId is null;
		}
	}

	public bool IsTenantRole {
		get {
			return this.Scope == RoleScope.Tenant && this.TenantId is not null && this.ProjectId is null;
		}
	}

	public bool IsProjectRole {
		get {
			return this.Scope == RoleScope.Project && this.TenantId is not null && this.ProjectId is not null;
		}
	}

	// Factory methods for type-safe creation
	public static Role CreateStaffRole(
		string name,
		string? description = null,
		bool isFullAccess = false
	) {
		return new Role {
			Name = name,
			Description = description,
			Scope = RoleScope.Staff,
			IsDefault = false,
			IsFullAccess = isFullAccess,
			TenantId = null,
			ProjectId = null
		};
	}

	public static Role CreateTenantRole(
		Guid tenantId,
		string name,
		string? description = null,
		bool isDefault = false,
		string? icon = null,
		string? tone = null,
		bool isFullAccess = false
	) {
		return new Role {
			Name = name,
			Description = description,
			Icon = icon,
			Tone = tone,
			Scope = RoleScope.Tenant,
			IsDefault = isDefault,
			IsFullAccess = isFullAccess,
			TenantId = tenantId,
			ProjectId = null
		};
	}

	public static Role CreateProjectRole(
		Guid tenantId,
		Guid projectId,
		string name,
		string? description = null,
		bool isFullAccess = false
	) {
		return new Role {
			Name = name,
			Description = description,
			Scope = RoleScope.Project,
			IsDefault = false,
			IsFullAccess = isFullAccess,
			TenantId = tenantId,
			ProjectId = projectId
		};
	}

	// Validation
	public void ValidateRoleType() {
		switch (this.Scope) {
			case RoleScope.Staff:
				if (this.TenantId is not null || this.ProjectId is not null) {
					throw new InvalidOperationException("Staff roles cannot have TenantId or ProjectId");
				}
				if (this.IsDefault) {
					throw new InvalidOperationException("Staff roles cannot be default roles");
				}
				break;
			case RoleScope.Tenant:
				if (this.TenantId is null || this.ProjectId is not null) {
					throw new InvalidOperationException("Tenant roles must have TenantId but not ProjectId");
				}
				break;
			case RoleScope.Project:
				if (this.TenantId is null || this.ProjectId is null) {
					throw new InvalidOperationException("Project roles must have both TenantId and ProjectId");
				}
				if (this.IsDefault) {
					throw new InvalidOperationException("Project roles cannot be default roles");
				}
				break;
			default:
				throw new ArgumentOutOfRangeException(
					nameof(this.Scope),
					this.Scope,
					$"Unhandled RoleScope: {this.Scope}"
				);
		}

		if (this.IsFullAccess && this.IsDefault) {
			throw new InvalidOperationException("A full-access role cannot be the default role");
		}
	}

	// navigation properties
	[JsonIgnore]
	public ICollection<PublyApp.Api.Modules.Users.Entities.UserAccountRole> UserAccountRoles { get; set; } = [];
	[JsonIgnore]
	public ICollection<RolePermission> RolePermissions { get; set; } = [];
}

public enum RoleScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
