using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Roles.Services;

/// <summary>
/// Read-side helpers for the full-access system role. "Admin" no longer exists as an
/// account flag: an account is full-access exactly when it holds the scope's
/// <see cref="Role.IsFullAccess"/> role. Keeping the predicate here stops the
/// invariant from being re-derived (and drifting) in every caller.
/// </summary>
public static class FullAccessRoleQueries {
	public static IQueryable<Role> FullAccessRoles(AppDbContext dbContext) {
		return dbContext.Role.Where(p => p.IsFullAccess && !p.IsDeleted);
	}

	public static IQueryable<UserAccountRole> FullAccessAssignments(AppDbContext dbContext) {
		return dbContext.UserAccountRole
			.Where(uap => !uap.Role.IsDeleted && uap.Role.IsFullAccess);
	}

	public static async Task<bool> IsFullAccessAccountAsync(
		AppDbContext dbContext,
		Guid userAccountId,
		CancellationToken cancellationToken = default
	) {
		return await FullAccessRoleQueries.FullAccessAssignments(dbContext)
			.AnyAsync(uap => uap.UserAccountId == userAccountId, cancellationToken);
	}

	public static async Task<bool> IsFullAccessUserAsync(
		AppDbContext dbContext,
		Guid userId,
		Guid? tenantId,
		CancellationToken cancellationToken = default
	) {
		var accounts = dbContext.UserAccount
			.Where(ua => ua.UserId == userId
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended);

		accounts = tenantId is null
			? accounts.Where(ua => ua.Scope == AccountScope.Staff)
			: accounts.Where(ua => ua.Scope == AccountScope.Tenant && ua.TenantId == tenantId);

		return await (
			from ua in accounts
			join uap in FullAccessRoleQueries.FullAccessAssignments(dbContext)
				on ua.Id equals uap.UserAccountId
			select ua.Id
		).AnyAsync(cancellationToken);
	}

	/// <summary>
	/// Active = the account, its user and its full-access role are live and neither the
	/// account nor the user is suspended. This is the definition the last-admin invariant
	/// protects; suspended holders still count for display-only owner counts.
	/// </summary>
	public static IQueryable<UserAccount> ActiveTenantFullAccessAccounts(
		AppDbContext dbContext,
		Guid tenantId
	) {
		return (
			from ua in dbContext.UserAccount
			join uap in FullAccessRoleQueries.FullAccessAssignments(dbContext)
				on ua.Id equals uap.UserAccountId
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
				&& !ua.User.IsDeleted
				&& ua.User.Status != UserStatus.Suspended
			select ua
		).Distinct();
	}

	public static IQueryable<UserAccount> ActiveStaffFullAccessAccounts(AppDbContext dbContext) {
		return (
			from ua in dbContext.UserAccount
			join uap in FullAccessRoleQueries.FullAccessAssignments(dbContext)
				on ua.Id equals uap.UserAccountId
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
				&& !ua.User.IsDeleted
				&& ua.User.Status != UserStatus.Suspended
			select ua
		).Distinct();
	}

	public static Task<int> CountActiveTenantFullAccessAsync(
		AppDbContext dbContext,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		return FullAccessRoleQueries.ActiveTenantFullAccessAccounts(dbContext, tenantId)
			.CountAsync(cancellationToken);
	}

	public static Task<int> CountActiveStaffFullAccessAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken = default
	) {
		return FullAccessRoleQueries.ActiveStaffFullAccessAccounts(dbContext)
			.CountAsync(cancellationToken);
	}
}
