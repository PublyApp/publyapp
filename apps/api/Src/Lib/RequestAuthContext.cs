using MainApi.Src.Modules.Users.Entities;

namespace MainApi.Src.Lib;

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
}

public class RequestAuthContext : IRequestAuthContext {
	// Session/Identity
	public string? SessionToken { get; set; }
	public Guid? UserId { get; set; }

	public bool IsAuthenticated =>
		!string.IsNullOrEmpty(SessionToken) && UserId.HasValue;

	// Staff scope
	public UserAccount? AccountStaff { get; set; }

	// Tenant scope
	public string? TenantId { get; set; }
	public UserAccount? AccountTenant { get; set; }

	public bool IsTenantAuthorized =>
		AccountTenant is not null &&
		!AccountTenant.IsSuspended &&
		AccountTenant.Scope == AccountScope.Tenant;
}
