using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Staff.StaffMember;

public interface IStaffMemberService {
	Task<User?> GetStaffMemberUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<int> CountStaffMembersAsync(CancellationToken cancellationToken = default);
	Task<List<User>> FindStaffMembersAsync(
		int? page,
		int? limit,
		string? sortId,
		SortOrder? sortOrder,
		CancellationToken cancellationToken = default
	);
}

public class StaffMemberService : IStaffMemberService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public StaffMemberService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_appSettings = appSettings;
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

	public async Task<int> CountStaffMembersAsync(CancellationToken cancellationToken = default) {
		var query =
			from ua in _dbContext.UserAccount
			where ua.AccountScope == AccountScope.Staff
			&& !ua.IsDeleted
			&& !ua.IsSuspended
			&& !ua.User.IsDeleted
			&& !ua.User.IsSuspended
			select ua.User;
		return await query.CountAsync(cancellationToken).ConfigureAwait(false);
	}

	public async Task<List<User>> FindStaffMembersAsync(
		int? page = 1,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = page ?? 1;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
		var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;

		var query =
			from ua in _dbContext.UserAccount
			where ua.AccountScope == AccountScope.Staff
			&& !ua.IsDeleted
			&& !ua.IsSuspended
			&& !ua.User.IsDeleted
			&& !ua.User.IsSuspended
			select ua.User;

		if (sortId is not null) {
			if (effectiveSortOrder == SortOrder.Asc) {
				query = query.OrderBy(u => EF.Property<object>(u, sortId));
			} else {
				query = query.OrderByDescending(u => EF.Property<object>(u, sortId));
			}
		}

		return await query
			.Skip((effectivePage - 1) * effectiveLimit).Take(effectiveLimit)
			.ToListAsync(cancellationToken)
			.ConfigureAwait(false);
	}
}
