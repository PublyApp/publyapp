using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Account;

/// <summary>
/// Unified account table for users across all scopes (Staff, Tenant, Project)
/// </summary>
[Table("user_accounts")]
[Index(nameof(UserId), nameof(TenantId), nameof(ProjectId), nameof(AccountType), IsUnique = true)]
[Index(nameof(UserId), nameof(AccountType))]
[Index(nameof(TenantId), nameof(AccountType))]
[Index(nameof(ProjectId), nameof(AccountType))]
public class UserAccount : BaseAttributes, IOptionalTenantEntity {
	[Column("user_id")]
	public required Guid UserId { get; set; }
	public User.User User { get; set; } = null!;

	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff accounts
	public Tenant.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant accounts
	public Project.Project? Project { get; set; }

	[Column("account_type")]
	public AccountType AccountType { get; set; } = AccountType.Tenant;

	[Column("hierarchy_level")]
	public AccountHierarchyLevel HierarchyLevel { get; set; } = AccountHierarchyLevel.User;

	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	// Computed properties for easy identification
	public bool IsStaffAccount => AccountType == AccountType.Staff && TenantId == null && ProjectId == null;
	public bool IsTenantAccount => AccountType == AccountType.Tenant && TenantId != null && ProjectId == null;
	public bool IsProjectAccount => AccountType == AccountType.Project && TenantId != null && ProjectId != null;

	// Factory methods for type-safe creation
	public static UserAccount CreateStaffAccount(Guid userId) {
		return new UserAccount {
			UserId = userId,
			AccountType = AccountType.Staff,
			TenantId = null,
			ProjectId = null
		};
	}

	public static UserAccount CreateTenantAccount(Guid userId, Guid tenantId) {
		return new UserAccount {
			UserId = userId,
			AccountType = AccountType.Tenant,
			TenantId = tenantId,
			ProjectId = null
		};
	}

	public static UserAccount CreateProjectAccount(Guid userId, Guid tenantId, Guid projectId) {
		return new UserAccount {
			UserId = userId,
			AccountType = AccountType.Project,
			TenantId = tenantId,
			ProjectId = projectId
		};
	}

	// Validation
	public void ValidateAccountType() {
		switch (AccountType) {
			case AccountType.Staff:
				if (TenantId != null || ProjectId != null) {
					throw new InvalidOperationException("Staff accounts cannot have TenantId or ProjectId");
				}
				break;
			case AccountType.Tenant:
				if (TenantId == null || ProjectId != null) {
					throw new InvalidOperationException("Tenant accounts must have TenantId but not ProjectId");
				}
				break;
			case AccountType.Project:
				if (TenantId == null || ProjectId == null) {
					throw new InvalidOperationException("Project accounts must have both TenantId and ProjectId");
				}
				break;
		}
	}

	// navigation properties
	public ICollection<UserAccountProfile> UserAccountProfiles { get; set; } = [];
}

public enum AccountType {
	Staff = 0,
	Tenant = 1,
	Project = 2
}

public enum AccountHierarchyLevel {
	// maybe owner too?
	Admin = 50,
	User = 10,
}
