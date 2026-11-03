using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib;

public interface IRequestAuthContext {
	// Session/Identity
	string? SessionToken { get; set; }
	Guid? UserId { get; set; }
	bool IsAuthenticated { get; }

	// Staff scope
	UserAccount? AccountStaff { get; set; }

	// Tenant scope
	string? TenantId { get; set; }
	UserAccount? AccountTenant { get; set; }
	bool IsTenantAuthorized { get; }

	/// <summary>
	/// Gets the staff account with a null check. Throws InvalidOperationException if no
	/// staff principal is in the context, which means the endpoint is missing
	/// .WithPermission() middleware. The same safe-accessor shape as GetRequiredId().
	/// </summary>
	UserAccount GetRequiredStaffAccount();

	/// <summary>
	/// Gets the tenant account with a null check. Throws InvalidOperationException if no
	/// tenant principal is in the context, which means the endpoint is missing
	/// .WithTenantPermission(...) middleware. The same safe-accessor shape as GetRequiredId().
	/// </summary>
	UserAccount GetRequiredTenantAccount();
}

public class RequestAuthContext : IRequestAuthContext {
	// Session/Identity
	public string? SessionToken { get; set; }
	public Guid? UserId { get; set; }

	public bool IsAuthenticated {
		get {
			return !string.IsNullOrEmpty(this.SessionToken) && this.UserId.HasValue;
		}
	}

	// Staff scope
	public UserAccount? AccountStaff { get; set; }

	// Tenant scope
	public string? TenantId { get; set; }
	public UserAccount? AccountTenant { get; set; }

	public bool IsTenantAuthorized {
		get {
			return this.AccountTenant is not null &&
		!this.AccountTenant.IsSuspended() &&
		this.AccountTenant.Scope == AccountScope.Tenant;
		}
	}

	public UserAccount GetRequiredStaffAccount() {
		var account = this.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}
		return account;
	}

	public UserAccount GetRequiredTenantAccount() {
		var account = this.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has .WithTenantPermission(...) middleware."
			);
		}
		return account;
	}
}
