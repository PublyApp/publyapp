using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.User;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.StaffMember;

public interface IStaffMemberService {
	Task<User?> GetStaffMemberUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
}

public class StaffMemberService : IStaffMemberService {
	private readonly MainApiDbContext _dbContext;

	public StaffMemberService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<User?> GetStaffMemberUserByIdAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
			&& ua.AccountScope == AccountScope.Staff
			&& !ua.IsDeleted
			&& !ua.IsSuspended
			&& !ua.User.IsDeleted
			&& !ua.User.IsSuspended
			select ua.User;

		return await query.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
	}
}
