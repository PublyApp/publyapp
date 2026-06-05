using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

internal static class TenantUserDetailsQueries {
	internal static async Task<TenantUserDetailsData?> GetForStaffAsync(
		AppDbContext dbContext,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Treat tenant user details as a shared identity page. Live company
		// memberships are counted separately so unlinking the last company does
		// not imply the User record was deleted.
		var user = await (
			from u in dbContext.User.AsNoTracking()
			where u.Id == userId
				&& !u.IsDeleted
				&& (
					from ua in dbContext.UserAccount.AsNoTracking()
					where ua.UserId == u.Id
						&& ua.Scope == AccountScope.Tenant
					select ua
				).Any()
			select u
		).FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return null;
		}

		var companyCount = await (
			from ua in dbContext.UserAccount.AsNoTracking()
			join tenant in dbContext.Tenant.AsNoTracking()
				on ua.TenantId equals tenant.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !tenant.IsDeleted
			select ua
		).CountAsync(cancellationToken);

		return new TenantUserDetailsData {
			User = user,
			CompanyCount = companyCount,
		};
	}
}
