using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Account;

/// <summary>
/// Join table between users and tenants
/// </summary>
[Table("user_accounts")]
[Index(nameof(UserId), nameof(TenantId), nameof(AccountType), IsUnique = true)]
[Index(nameof(UserId), nameof(AccountType))]
public class UserAccount : BaseAttributes, ITenantEntity {
	[Column("user_id")]
	public required Guid UserId { get; set; }
	public User.User User { get; set; } = null!;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	public Tenant.Tenant Tenant { get; set; } = null!;

	[Column("account_type")]
	public AccountType AccountType { get; set; } = AccountType.Tenant;

	[Column("hierarchy_level")]
	public AccountHierarchyLevel HierarchyLevel { get; set; } = AccountHierarchyLevel.User;

	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	// navigation properties
	public ICollection<UserAccountProfile> UserAccountProfiles { get; set; } = [];
}

public enum AccountType {
	Staff = 0,
	Tenant = 1
}

public enum AccountHierarchyLevel {
	// maybe owner too?
	Admin = 50,
	User = 10,
}
