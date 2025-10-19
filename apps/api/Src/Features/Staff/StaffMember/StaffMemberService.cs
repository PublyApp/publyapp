using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Staff.StaffMember;

public class StaffMemberWithLevel {
	public required User User { get; set; }
	public required AccountLevel Level { get; set; }
}

public interface IStaffMemberService {
	Task<User?> GetStaffMemberUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<int> CountStaffMembersAsync(CancellationToken cancellationToken = default);
	Task<List<StaffMemberWithLevel>> FindStaffMembersAsync(
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
			&& ua.Scope == AccountScope.Staff
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
			where ua.Scope == AccountScope.Staff
			&& !ua.IsDeleted
			&& !ua.IsSuspended
			&& !ua.User.IsDeleted
			&& !ua.User.IsSuspended
			select ua.User;
		return await query.CountAsync(cancellationToken).ConfigureAwait(false);
	}

	public async Task<List<StaffMemberWithLevel>> FindStaffMembersAsync(
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
			where ua.Scope == AccountScope.Staff
			&& !ua.IsDeleted
			&& !ua.IsSuspended
			&& !ua.User.IsDeleted
			&& !ua.User.IsSuspended
			select new { User = ua.User, Level = ua.Level };

		if (sortId is not null) {
			query = sortId.ToLower() switch {
				"createdat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(x => x.User.CreatedAt)
					: query.OrderByDescending(x => x.User.CreatedAt),
				"updatedat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(x => x.User.UpdatedAt)
					: query.OrderByDescending(x => x.User.UpdatedAt),
				"email" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(x => x.User.Email)
					: query.OrderByDescending(x => x.User.Email),
				"firstname" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(x => x.User.FirstName)
					: query.OrderByDescending(x => x.User.FirstName),
				"lastname" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(x => x.User.LastName)
					: query.OrderByDescending(x => x.User.LastName),
				"status" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(x => x.User.Status)
					: query.OrderByDescending(x => x.User.Status),
				"level" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(x => x.Level)
					: query.OrderByDescending(x => x.Level),
				_ => query // Default: no sorting for unsupported fields
			};
		}

		var results = await query
			.Skip((effectivePage - 1) * effectiveLimit).Take(effectiveLimit)
			.ToListAsync(cancellationToken)
			.ConfigureAwait(false);

		return results.Select(x => new StaffMemberWithLevel {
			User = x.User,
			Level = x.Level
		}).ToList();
	}
}
