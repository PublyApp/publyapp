using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Users.Entities;

/// <summary>
/// Unified account table for users across all scopes (Staff, Tenant, Project)
/// </summary>
[Table("user_accounts")]
// Membership uniqueness per scope is enforced via filtered unique indexes in
// AppDbContext (ux_user_accounts_staff_active, ux_user_accounts_tenant_active,
// ux_user_accounts_project_active) because PostgreSQL treats NULLs as distinct
// under a plain composite unique index, which would let TenantId/ProjectId
// NULLs bypass this attribute-based index entirely.
[Index(nameof(UserId), nameof(Scope))]
[Index(nameof(TenantId), nameof(Scope))]
[Index(nameof(ProjectId), nameof(Scope))]
[Index(nameof(UserId), nameof(TenantId))]
public class UserAccount : BaseAttributes, IOptionalTenantEntity {
	[Column("user_id")]
	public required Guid UserId { get; set; }

	private User? _user;
	[JsonIgnore]
	public User User {
		get { return RequiredNavigation.Get(_user, nameof(UserAccount), nameof(User)); }
		set { _user = value; }
	}

	[Column("tenant_id")]
	public Guid? TenantId { get; set; }  // Nullable for staff accounts
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }  // Nullable for staff/tenant accounts
	[JsonIgnore]
	public PublyApp.Api.Modules.Projects.Entities.Project? Project { get; set; }

	[Column("scope")]
	public AccountScope Scope { get; set; } = AccountScope.Tenant;

	[Column("level")]
	public AccountLevel Level { get; set; } = AccountLevel.User;

	// Membership-local lifecycle only. Global user suspension is derived from User.Status.
	[Column("status")]
	public AccountStatus Status { get; set; } = AccountStatus.Active;

	// Computed properties for easy identification
	public bool IsStaffAccount {
		get {
			return Scope == AccountScope.Staff && TenantId is null && ProjectId is null;
		}
	}

	public bool IsTenantAccount {
		get {
			return Scope == AccountScope.Tenant && TenantId is not null && ProjectId is null;
		}
	}

	public bool IsProjectAccount {
		get {
			return Scope == AccountScope.Project && TenantId is not null && ProjectId is not null;
		}
	}

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
				if (TenantId is not null || ProjectId is not null) {
					throw new InvalidOperationException("Staff accounts cannot have TenantId or ProjectId");
				}
				break;
			case AccountScope.Tenant:
				if (TenantId is null || ProjectId is not null) {
					throw new InvalidOperationException("Tenant accounts must have TenantId but not ProjectId");
				}
				break;
			case AccountScope.Project:
				if (TenantId is null || ProjectId is null) {
					throw new InvalidOperationException("Project accounts must have both TenantId and ProjectId");
				}
				break;
			default:
				throw new ArgumentOutOfRangeException(
					nameof(Scope),
					Scope,
					$"Unhandled AccountScope: {Scope}"
				);
		}
	}

	// navigation properties
	[JsonIgnore]
	public ICollection<UserAccountProfile> UserAccountProfiles { get; set; } = [];

	public static AccountLevel? ParseLevel(string accountLevel) {
		var isAdmin = string.Equals(
			accountLevel,
			nameof(AccountLevel.Admin),
			StringComparison.OrdinalIgnoreCase
		);
		if (isAdmin) {
			return AccountLevel.Admin;
		}
		var isUser = string.Equals(
			accountLevel,
			nameof(AccountLevel.User),
			StringComparison.OrdinalIgnoreCase
		);
		if (isUser) {
			return AccountLevel.User;
		}
		return null;
	}

	public static string GetLevelDescription(AccountLevel accountLevel) {
		return accountLevel switch {
			AccountLevel.Admin => nameof(AccountLevel.Admin),
			AccountLevel.User => nameof(AccountLevel.User),
			_ => "Unknown"
		};
	}

	public static AccountStatus? ParseStatus(string statusString) {
		var isSuspended = string.Equals(
			statusString,
			nameof(AccountStatus.Suspended),
			StringComparison.OrdinalIgnoreCase
		);
		if (isSuspended) {
			return AccountStatus.Suspended;
		}

		var isActive = string.Equals(
			statusString,
			nameof(AccountStatus.Active),
			StringComparison.OrdinalIgnoreCase
		);
		if (isActive) {
			return AccountStatus.Active;
		}

		return null;
	}

	public static TenantUserStatus? ParseTenantStatus(string statusString) {
		// Tenant-user filtering accepts the derived read-model status, not just persisted account states.
		var isGloballySuspended = string.Equals(
			statusString,
			"globally_suspended",
			StringComparison.OrdinalIgnoreCase
		) || string.Equals(
			statusString,
			nameof(TenantUserStatus.GloballySuspended),
			StringComparison.OrdinalIgnoreCase
		);
		if (isGloballySuspended) {
			return TenantUserStatus.GloballySuspended;
		}

		var isSuspended = string.Equals(
			statusString,
			nameof(TenantUserStatus.Suspended),
			StringComparison.OrdinalIgnoreCase
		);
		if (isSuspended) {
			return TenantUserStatus.Suspended;
		}

		var isActive = string.Equals(
			statusString,
			nameof(TenantUserStatus.Active),
			StringComparison.OrdinalIgnoreCase
		);
		if (isActive) {
			return TenantUserStatus.Active;
		}

		return null;
	}

	public static TenantUserStatus GetTenantStatus(
		UserStatus userStatus,
		AccountStatus accountStatus
	) {
		// Global identity suspension has precedence over the membership-local status in tenant UIs.
		bool isUserGloballySuspended = User.IsSuspended(userStatus);
		bool isMembershipSuspended = IsSuspended(accountStatus);

		if (isUserGloballySuspended) {
			return TenantUserStatus.GloballySuspended;
		}

		if (isMembershipSuspended) {
			return TenantUserStatus.Suspended;
		}

		return TenantUserStatus.Active;
	}

	public bool IsActive() {
		return IsActive(Status);
	}

	public bool IsSuspended() {
		return IsSuspended(Status);
	}

	public static bool IsActive(AccountStatus status) {
		return status == AccountStatus.Active;
	}

	public static bool IsSuspended(AccountStatus status) {
		return status == AccountStatus.Suspended;
	}

	public static string GetStatusDescription(AccountStatus status) {
		return status switch {
			AccountStatus.Active => nameof(AccountStatus.Active),
			AccountStatus.Suspended => nameof(AccountStatus.Suspended),
			_ => "Unknown"
		};
	}

	public static string GetStatusDescription(TenantUserStatus status) {
		return status switch {
			TenantUserStatus.Active => nameof(TenantUserStatus.Active),
			TenantUserStatus.Suspended => nameof(TenantUserStatus.Suspended),
			TenantUserStatus.GloballySuspended => nameof(TenantUserStatus.GloballySuspended),
			_ => "Unknown"
		};
	}
}

public enum AccountScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}

[JsonConverter(typeof(JsonStringEnumConverter<AccountLevel>))]
public enum AccountLevel {
	// maybe owner too?
	Admin = 50,
	User = 10,
}

public enum AccountStatus {
	Active = 0,
	Suspended = 1,
}

[JsonConverter(typeof(JsonStringEnumConverter<TenantUserStatus>))]
public enum TenantUserStatus {
	Active = 0,
	Suspended = 1,
	GloballySuspended = 2,
}
