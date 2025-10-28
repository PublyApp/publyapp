using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Staff.StaffMember;

public class StaffMemberData {
	public required User User { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public class UpdateUserDocument {
	public string? Email { get; set; }
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public string? AccountLevel { get; set; }
}

public abstract record UpdateUserByIdResult {
	public sealed record Success() : UpdateUserByIdResult;
	public sealed record UserNotFound() : UpdateUserByIdResult;
	public sealed record UserAccountNotFound() : UpdateUserByIdResult;
	public sealed record MultipleStaffAccountsFound() : UpdateUserByIdResult;
	public sealed record UpdateFailed(string ErrorMessage) : UpdateUserByIdResult;
}

public interface IStaffMemberService {
	Task<StaffMemberData?> GetStaffMemberUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<int> CountStaffMembersAsync(CancellationToken cancellationToken = default);
	Task<List<StaffMemberData>> FindStaffMembersAsync(
		int? page,
		int? limit,
		string? sortId,
		SortOrder? sortOrder,
		CancellationToken cancellationToken = default
	);
	/// <summary>
	/// Updates a user entity (PATCH-style partial replacement).
	/// </summary>
	/// <param name="id">The user id</param>
	/// <param name="document">The document with the updated values</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>The updated user entity</returns>
	Task<UpdateUserByIdResult> UpdateStaffMemberByIdAsync(Guid userId, UpdateUserDocument document, CancellationToken cancellationToken = default);
}

public class StaffMemberService : IStaffMemberService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;
	private readonly ILogger<StaffMemberService> _logger;

	public StaffMemberService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings, ILogger<StaffMemberService> logger) {
		_appSettings = appSettings;
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<StaffMemberData?> GetStaffMemberUserByIdAsync(
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
			select new StaffMemberData { User = ua.User, AccountLevel = ua.Level };

		return await query.FirstOrDefaultAsync(cancellationToken);
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
		return await query.CountAsync(cancellationToken);
	}

	public async Task<List<StaffMemberData>> FindStaffMembersAsync(
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
			.ToListAsync(cancellationToken);

		return results.Select(x => new StaffMemberData {
			User = x.User,
			AccountLevel = x.Level
		}).ToList();
	}

	public async Task<UpdateUserByIdResult> UpdateStaffMemberByIdAsync(
		Guid userId,
		UpdateUserDocument document,
		CancellationToken cancellationToken = default
) {
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			var updatedCount = await _dbContext.User
					.Where(u => u.Id == userId)
					.ExecuteUpdateWithAuditAsync(setters => {
						var s = setters;

						if (document.Email is not null) {
							s = s.SetProperty(u => u.Email, document.Email);
						}

						if (document.LastName is not null) {
							s = s.SetProperty(u => u.LastName, document.LastName);
						}

						if (document.FirstName is not null) {
							s = s.SetProperty(u => u.FirstName, document.FirstName);
						}

						if (document.AvatarUrl is not null) {
							s = s.SetProperty(u => u.AvatarUrl, document.AvatarUrl);
						}

						return s;
					}, cancellationToken);

			if (updatedCount == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return new UpdateUserByIdResult.UserNotFound();
			}

			if (document.AccountLevel is not null) {
				var staffAccountCount = await _dbContext.UserAccount
					.CountAsync(ua => ua.UserId == userId && ua.Scope == AccountScope.Staff, cancellationToken);

				if (staffAccountCount == 0) {
					await transaction.RollbackAsync(cancellationToken);
					return new UpdateUserByIdResult.UserAccountNotFound();
				}

				if (staffAccountCount > 1) {
					await transaction.RollbackAsync(cancellationToken);
					return new UpdateUserByIdResult.MultipleStaffAccountsFound();
				}

				await _dbContext.UserAccount
						.Where(ua => ua.UserId == userId && ua.Scope == AccountScope.Staff)
						.ExecuteUpdateWithAuditAsync(setters => {
							return setters
								.SetProperty(ua => ua.Level, UserAccount.ParseAccountLevel(document.AccountLevel));
						},
						cancellationToken);
			}

			await transaction.CommitAsync(cancellationToken);
			return new UpdateUserByIdResult.Success();
		} catch (Exception exception) {
			await transaction.RollbackAsync(cancellationToken);
			_logger.LogError(exception, "Failed to update staff member {UserId}", userId);
			return new UpdateUserByIdResult.UpdateFailed(exception.Message);
		}
	}
}
