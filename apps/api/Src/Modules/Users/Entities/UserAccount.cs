using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Users.Entities;

/// <summary>
/// Unified account table for users across all scopes (Staff, Tenant, Project)
/// </summary>
[Table("user_accounts")]
[Index(nameof(UserId), nameof(TenantId), nameof(ProjectId), nameof(Scope), IsUnique = true)]
[Index(nameof(UserId), nameof(Scope))]
[Index(nameof(TenantId), nameof(Scope))]
[Index(nameof(ProjectId), nameof(Scope))]
[Index(nameof(UserId), nameof(TenantId))]
public class UserAccount : BaseAttributes, IOptionalTenantEntity {
	[Column("user_id")]
	public required Guid UserId { get; set; }
	[JsonIgnore]
	public User User { get; set; } = null!;

	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff accounts
	[JsonIgnore]
	public MainApi.Src.Modules.Tenants.Entities.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant accounts
	[JsonIgnore]
	public MainApi.Src.Modules.Projects.Entities.Project? Project { get; set; }

	[Column("scope")]
	public AccountScope Scope { get; set; } = AccountScope.Tenant;

	[Column("level")]
	public AccountLevel Level { get; set; } = AccountLevel.User;

	// Membership-local suspension is valid only for users whose global identity
	// is not suspended. Global user suspension must cascade to all memberships.
	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	// Computed properties for easy identification
	public bool IsStaffAccount => Scope == AccountScope.Staff && TenantId == null && ProjectId == null;
	public bool IsTenantAccount => Scope == AccountScope.Tenant && TenantId != null && ProjectId == null;
	public bool IsProjectAccount => Scope == AccountScope.Project && TenantId != null && ProjectId != null;

	// Factory methods for type-safe creation
	public static UserAccount CreateStaffAccount(
		Guid userId,
		AccountLevel? accountLevel = null
	) {
		return new UserAccount {
			UserId = userId,
			Scope = AccountScope.Staff,
			TenantId = null,
			ProjectId = null,
			Level = accountLevel ?? AccountLevel.User,
		};
	}

	public static UserAccount CreateTenantAccount(
		Guid userId,
		Guid tenantId,
		AccountLevel? accountLevel = null
	) {
		return new UserAccount {
			UserId = userId,
			Scope = AccountScope.Tenant,
			TenantId = tenantId,
			ProjectId = null,
			Level = accountLevel ?? AccountLevel.User
		};
	}

	public static UserAccount CreateProjectAccount(Guid userId, Guid tenantId, Guid projectId) {
		return new UserAccount {
			UserId = userId,
			Scope = AccountScope.Project,
			TenantId = tenantId,
			ProjectId = projectId
		};
	}

	// Validation
	public void ValidateAccountType() {
		switch (Scope) {
			case AccountScope.Staff:
				if (TenantId != null || ProjectId != null) {
					throw new InvalidOperationException("Staff accounts cannot have TenantId or ProjectId");
				}
				break;
			case AccountScope.Tenant:
				if (TenantId == null || ProjectId != null) {
					throw new InvalidOperationException("Tenant accounts must have TenantId but not ProjectId");
				}
				break;
			case AccountScope.Project:
				if (TenantId == null || ProjectId == null) {
					throw new InvalidOperationException("Project accounts must have both TenantId and ProjectId");
				}
				break;
		}
	}

	// navigation properties
	[JsonIgnore]
	public ICollection<UserAccountProfile> UserAccountProfiles { get; set; } = [];

	public static AccountLevel? ParseAccountLevel(string accountLevel) {
		var isAdmin = string.Compare(accountLevel, nameof(AccountLevel.Admin), StringComparison.OrdinalIgnoreCase) == 0;
		if (isAdmin) {
			return AccountLevel.Admin;
		}
		var isUser = string.Compare(accountLevel, nameof(AccountLevel.User), StringComparison.OrdinalIgnoreCase) == 0;
		if (isUser) {
			return AccountLevel.User;
		}
		return null;
	}

	public static string GetAccountLevelDescription(AccountLevel accountLevel) {
		return accountLevel switch {
			AccountLevel.Admin => nameof(AccountLevel.Admin),
			AccountLevel.User => nameof(AccountLevel.User),
			_ => "Unknown"
		};
	}

	public static UserStatus? ParseStatus(string statusString) {
		var isSuspended = string.Equals(
			statusString,
			nameof(UserStatus.Suspended),
			StringComparison.OrdinalIgnoreCase
		);
		if (isSuspended) {
			return UserStatus.Suspended;
		}

		var isActive = string.Equals(
			statusString,
			nameof(UserStatus.Active),
			StringComparison.OrdinalIgnoreCase
		);
		if (isActive) {
			return UserStatus.Active;
		}

		return null;
	}

	public static string GetStatusDescription(bool isSuspended) {
		return isSuspended
			? nameof(UserStatus.Suspended)
			: nameof(UserStatus.Active);
	}
}

public enum AccountScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}

public enum AccountLevel {
	// maybe owner too?
	Admin = 50,
	User = 10,
}
